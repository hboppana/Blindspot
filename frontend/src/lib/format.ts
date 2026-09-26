import type { Factor } from "./types";

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

export const num = (n: number) => n.toLocaleString("en-US");

// Some source names are malformed (e.g. "-a & SW 36th Ter").
export const displayName = (name: string) =>
  name.replace(/^[^A-Za-z0-9]+/, "").trim() || "Unnamed intersection";
