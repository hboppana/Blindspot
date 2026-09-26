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

export function factorGroup(i: IntersectionListItem): FactorGroup {
  if (i.confidence !== "ok") return "none";
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
