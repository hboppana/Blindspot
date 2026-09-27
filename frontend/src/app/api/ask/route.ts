import { askAnalyst, readOnlySql, runSql, snowflakeConfig } from "@/lib/snowflake";
import type { AskAnswer } from "@/lib/types";

// POST /api/ask {question} -> an answer from Snowflake Cortex Analyst, run
// against StreetSmart's data by a read-only user. Rate-limited per visitor;
// identical questions are answered from a short cache.

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_LENGTH = 300;
const WINDOW_MS = 10 * 60 * 1000;
const PER_WINDOW = 12;
const CACHE_MS = 10 * 60 * 1000;

// In memory, per server instance: enough to stop a runaway loop, not a quota.
const visits = new Map<string, number[]>();
const cache = new Map<string, { at: number; answer: AskAnswer }>();

function limited(ip: string) {
  const now = Date.now();
  const recent = (visits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  visits.set(ip, recent);
  return recent.length > PER_WINDOW;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

export async function POST(req: Request) {
  const config = snowflakeConfig();
  if (!config) return json({ error: "Ask StreetSmart is offline right now." }, 503);

  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim().replace(/\s+/g, " ") : "";
  if (!question) return json({ error: "Type a question first." }, 400);
  if (question.length > MAX_LENGTH) return json({ error: `Keep it under ${MAX_LENGTH} characters.` }, 400);

  const key = question.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return json(hit.answer);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (limited(ip)) return json({ error: "That's a lot of questions. Give it a few minutes and try again." }, 429);

  try {
    const a = await askAnalyst(config, question);
    const answer: AskAnswer = {
      question,
      interpretation: a.interpretation,
      suggestions: a.suggestions,
      sql: null,
      columns: [],
      rows: [],
      truncated: false,
    };
    if (a.sql) {
      const sql = readOnlySql(a.sql);
      if (!sql) return json({ error: "That question led somewhere I can't safely go. Try asking it another way." }, 422);
      answer.sql = sql;
      Object.assign(answer, await runSql(config, sql));
    }
    cache.set(key, { at: Date.now(), answer });
    return json(answer);
  } catch (err) {
    console.error("[ask]", err);
    return json({ error: "Couldn't get an answer just now. Try again, or ask it another way." }, 502);
  }
}
