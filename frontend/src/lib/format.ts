import type { Factor, IntersectionListItem } from "./types";

export const FACTOR_LABELS: Record<Factor, string> = {
  rear_end: "Rear-end",
  angle: "Angle",
  left_turn: "Left-turn",
  right_turn: "Right-turn",
  sideswipe: "Sideswipe",
  pedestrian: "Pedestrian",
  bicycle: "Bicycle",
  other: "Other",
};

export const factorLabel = (f: Factor | null) =>
  f ? FACTOR_LABELS[f] : "No clear factor";

// Map colors: at most three hues can sit side by side and stay colorblind-safe,
// so the eight factors fold into three groups plus gray.
export type FactorGroup = "turning" | "same_direction" | "vulnerable" | "none";

export const FACTOR_GROUPS: Record<
  FactorGroup,
  { label: string; color: string }
> = {
  turning: { label: "Turning and angle", color: "#2a78d6" },
  same_direction: { label: "Rear-end and sideswipe", color: "#eb6834" },
  vulnerable: { label: "Pedestrian and bike", color: "#1baf7a" },
  none: { label: "No clear factor", color: "#9a988f" },
};

// Only confident corners (and fix-list corners) get a factor colour, so the
// map doesn't overclaim.
export function factorGroup(
  i: Pick<IntersectionListItem, "main_factor" | "confidence" | "in_fix_list">,
): FactorGroup {
  if (i.confidence !== "ok" && !i.in_fix_list) return "none";
  switch (i.main_factor) {
    case "angle":
    case "left_turn":
    case "right_turn":
      return "turning";
    case "rear_end":
    case "sideswipe":
      return "same_direction";
    case "pedestrian":
    case "bicycle":
      return "vulnerable";
    default:
      return "none";
  }
}

export const GAINESVILLE = { lat: 29.6516, lng: -82.3248 };

export const num = (n: number) => n.toLocaleString("en-US");

// Some source names are malformed (e.g. "-a & SW 36th Ter").
export const displayName = (name: string) =>
  name.replace(/^[^A-Za-z0-9]+/, "").trim() || "Unnamed intersection";

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const KEEP_UPPER = new Set(["N", "S", "E", "W", "NW", "NE", "SW", "SE", "SR", "US", "CR"]);

// "NW 69TH TER & W NEWBERRY RD" -> "NW 69th Ter & W Newberry Rd"
export const titleCase = (name: string) =>
  name.replace(/[A-Za-z0-9-]+/g, (w) => {
    const upper = w.toUpperCase();
    if (KEEP_UPPER.has(upper) || /^I-\d+$/.test(upper)) return upper;
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  });

/** "2026-07-23" -> "July 2026" */
export const monthYear = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

/** Fix-list entries grouped by recommended fix, biggest crashes-a-year first. */
export function groupByFix(fixes: { recommended_fix: string; crashes_per_year: number }[]) {
  const groups = new Map<string, { count: number; perYear: number }>();
  for (const f of fixes) {
    const key = f.recommended_fix.startsWith("review needed")
      ? "Needs an engineer's review"
      : f.recommended_fix;
    const g = groups.get(key) ?? { count: 0, perYear: 0 };
    groups.set(key, { count: g.count + 1, perYear: g.perYear + f.crashes_per_year });
  }
  return [...groups.entries()]
    .map(([fix, g]) => ({ fix, ...g }))
    .sort((a, b) => b.perYear - a.perYear);
}

/** Hour of day 0-23 -> "12 AM", "1 AM", ... "12 PM", ... "11 PM" */
export const hour12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`;

/** Years covered by a "2022-01-01 to 2026-07-23" period, for per-year figures. */
export function yearsIn(period: string) {
  const [from, to] = period.split(" to ").map((d) => new Date(`${d}T12:00:00`).getTime());
  return (to - from) / (365.25 * 24 * 3600 * 1000);
}

/** Median crashes a year across intersections with at least one crash since 2022. */
export function medianPerYear(items: { crashes_since_2022: number }[], years: number) {
  const c = items.map((i) => i.crashes_since_2022).filter((n) => n > 0).sort((a, b) => a - b);
  if (!c.length) return 0;
  const mid = c.length / 2;
  const median = c.length % 2 ? c[Math.floor(mid)] : (c[mid - 1] + c[mid]) / 2;
  return median / years;
}

/** "14-26%" -> [0.14, 0.26]; "40%" -> [0.4, 0.4]; anything else -> null. */
export function effectRange(value: string): [number, number] | null {
  const m = value.match(/(\d+(?:\.\d+)?)\s*(?:-|to)?\s*(\d+(?:\.\d+)?)?\s*%/);
  if (!m) return null;
  const lo = Number(m[1]) / 100;
  return [lo, m[2] ? Number(m[2]) / 100 : lo];
}
