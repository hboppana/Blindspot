import type { NextConfig } from "next";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The Google key lives in the repo-root .env (shared with the data scripts);
// Next only reads env files in frontend/. frontend/.env.local still wins.
function rootEnv(name: string): string | undefined {
  const file = join(__dirname, "..", ".env");
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const [key, ...rest] = line.split("=");
    if (key.trim() === name) return rest.join("=").trim().replace(/^["']|["']$/g, "");
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY:
      process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ??
      rootEnv("GOOGLE_MAPS_API_KEY") ??
      "",
  },
};

export default nextConfig;
