import "server-only";
import { createHash, createPrivateKey, createPublicKey, createSign } from "node:crypto";

// Snowflake for Ask StreetSmart: Cortex Analyst turns a question into SQL, and
// the SQL API runs it. Both use the read-only service user's key-pair login
// (scripts/snowflake_load.py --access). The key never reaches the browser:
// these variables have no NEXT_PUBLIC_ prefix and this module is server-only.

type Config = {
  account: string;
  user: string;
  role: string;
  warehouse: string;
  semanticView: string;
  privateKey: string; // PKCS8 PEM, stored base64-encoded on one line
};

export function snowflakeConfig(): Config | null {
  const e = process.env;
  const c = {
    account: e.SNOWFLAKE_ACCOUNT,
    user: e.SNOWFLAKE_ASK_USER,
    role: e.SNOWFLAKE_ASK_ROLE,
    warehouse: e.SNOWFLAKE_ASK_WAREHOUSE,
    semanticView: e.SNOWFLAKE_SEMANTIC_VIEW,
    privateKey: e.SNOWFLAKE_ASK_PRIVATE_KEY,
  };
  if (Object.values(c).some((v) => !v)) return null;
  return { ...(c as Config), privateKey: Buffer.from(c.privateKey!, "base64").toString("utf8") };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

// Key-pair JWTs last at most an hour; reuse one for 50 minutes.
let token: { value: string; expires: number } | null = null;

function jwt(c: Config) {
  if (token && token.expires > Date.now()) return token.value;
  const key = createPrivateKey(c.privateKey);
  const der = createPublicKey(key).export({ type: "spki", format: "der" });
  const fingerprint = "SHA256:" + createHash("sha256").update(der).digest("base64");
  const account = c.account.toUpperCase().replace(/\./g, "-");
  const user = c.user.toUpperCase();
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(
    JSON.stringify({ iss: `${account}.${user}.${fingerprint}`, sub: `${account}.${user}`, iat: now, exp: now + 3600 }),
  );
  const signature = createSign("RSA-SHA256").update(`${head}.${body}`).sign(key);
  token = { value: `${head}.${body}.${b64url(signature)}`, expires: Date.now() + 50 * 60 * 1000 };
  return token.value;
}

async function post<T>(c: Config, path: string, body: unknown, timeoutMs: number): Promise<T> {
  const host = `https://${c.account.toLowerCase().replace(/_/g, "-")}.snowflakecomputing.com`;
  const res = await fetch(host + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt(c)}`,
      "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Snowflake ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T>;
}

type AnalystContent =
  | { type: "text"; text: string }
  | { type: "sql"; statement: string }
  | { type: "suggestions"; suggestions: string[] };

export async function askAnalyst(c: Config, question: string) {
  const r = await post<{ message: { content: AnalystContent[] } }>(
    c,
    "/api/v2/cortex/analyst/message",
    { messages: [{ role: "user", content: [{ type: "text", text: question }] }], semantic_view: c.semanticView },
    45_000,
  );
  const content = r.message?.content ?? [];
  const text = content.find((x): x is Extract<AnalystContent, { type: "text" }> => x.type === "text")?.text ?? "";
  return {
    interpretation: text.replace(/^This is our interpretation of your question:\s*/i, "").trim(),
    sql: content.find((x): x is Extract<AnalystContent, { type: "sql" }> => x.type === "sql")?.statement ?? null,
    suggestions:
      content.find((x): x is Extract<AnalystContent, { type: "suggestions" }> => x.type === "suggestions")
        ?.suggestions ?? [],
  };
}

export const MAX_ROWS = 200;

/** Cortex's SQL, cleaned and checked: one read-only statement, or null. */
export function readOnlySql(sql: string) {
  const clean = sql
    .replace(/--[^\n]*/g, "")
    .trim()
    .replace(/;\s*$/, "")
    .trim();
  if (!/^(select|with)\b/i.test(clean) || clean.includes(";")) return null;
  return clean;
}

export async function runSql(c: Config, sql: string) {
  const r = await post<{ resultSetMetaData: { rowType: { name: string; type: string }[] }; data: (string | null)[][] }>(
    c,
    "/api/v2/statements",
    {
      statement: `SELECT * FROM (${sql}) LIMIT ${MAX_ROWS + 1}`,
      timeout: 20,
      warehouse: c.warehouse,
      role: c.role,
    },
    30_000,
  );
  const rows = r.data ?? [];
  return {
    columns: r.resultSetMetaData.rowType.map((t) => ({ name: t.name, type: t.type })),
    rows: rows.slice(0, MAX_ROWS),
    truncated: rows.length > MAX_ROWS,
  };
}
