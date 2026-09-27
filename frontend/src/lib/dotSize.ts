// Map dots come in four standard sizes, one per band of crashes since 2022,
// so the same size always means the same thing (and the legend can show it).
export const SIZE_BANDS = [
  { min: 100, r: 14, label: "100+" },
  { min: 50, r: 11, label: "50 to 99" },
  { min: 10, r: 8, label: "10 to 49" },
  { min: 0, r: 5.5, label: "Under 10" },
] as const;

/** Dot radius in px for an intersection's crash count. */
export const dotRadius = (crashes: number) => SIZE_BANDS.find((b) => crashes >= b.min)!.r;
