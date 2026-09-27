// One letter grade per intersection, from one number: crashes a year above
// what similar intersections see (network screening's excess_per_year).
// Intersections too quiet to screen have no grade.
import type { IntersectionListItem } from "./types";

export type Grade = "A" | "B" | "C" | "D" | "F";

// Worst first. `min` is the lowest excess (crashes a year) that earns the grade.
export const GRADES: { grade: Grade; min: number; range: string; color: string; ink: string }[] = [
  { grade: "F", min: 8, range: "8+ a year above similar", color: "#c8102e", ink: "#ffffff" },
  { grade: "D", min: 4, range: "4 to 8 above", color: "#eb6834", ink: "#1f2226" },
  { grade: "C", min: 1, range: "1 to 4 above", color: "#f6c700", ink: "#1f2226" },
  { grade: "B", min: 0, range: "0 to 1 above", color: "#9ccf5b", ink: "#1f2226" },
  { grade: "A", min: -Infinity, range: "Fewer than similar", color: "#1baf7a", ink: "#1f2226" },
];

export const UNGRADED = { color: "#9aa1a8", label: "Not graded (too few crashes to compare)" };

export function gradeOf(i: Pick<IntersectionListItem, "excess_per_year">): Grade | null {
  if (i.excess_per_year == null) return null;
  return GRADES.find((g) => i.excess_per_year! >= g.min)!.grade;
}

export const gradeInfo = (g: Grade) => GRADES.find((x) => x.grade === g)!;

/** "5 more crashes a year than similar intersections" and the like. */
export function gradeReason(i: Pick<IntersectionListItem, "excess_per_year">) {
  const e = i.excess_per_year;
  if (e == null) return "Too few crashes to compare with similar intersections";
  const n = Math.abs(e) < 1 ? Math.abs(e).toFixed(1) : String(Math.round(Math.abs(e)));
  return e >= 0
    ? `${n} more crashes a year than similar intersections`
    : `${n} fewer crashes a year than similar intersections`;
}
