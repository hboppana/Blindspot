import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CitySummary,
  FixListItem,
  IntersectionDetail,
  IntersectionListItem,
} from "./types";

// Set API_BASE_URL (e.g. http://localhost:8000) to use the real backend.
// Unset, responses come from mock/ (npm run mocks).
const API_BASE_URL = process.env.API_BASE_URL;

async function get<T>(path: string): Promise<T | null> {
  if (API_BASE_URL) {
    const res = await fetch(`${API_BASE_URL}${path}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
    return res.json();
  }
  try {
    const file = join(process.cwd(), "mock", `${path}.json`);
    return JSON.parse(await readFile(file, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function getOrThrow<T>(path: string): Promise<T> {
  const data = await get<T>(path);
  if (data === null) throw new Error(`GET ${path}: not found`);
  return data;
}

export const getCitySummary = () => getOrThrow<CitySummary>("/city/summary");

export const getIntersections = () =>
  getOrThrow<IntersectionListItem[]>("/intersections");

export const getIntersection = (id: string) =>
  get<IntersectionDetail>(`/intersections/${encodeURIComponent(id)}`);

export const getFixList = () => getOrThrow<FixListItem[]>("/fix-list");
