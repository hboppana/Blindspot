import type { Grade } from "@/lib/grade";

// A three-lamp signal that shows a verdict at a glance: red for D and F,
// amber for C, green for A and B. The housing stays asphalt-dark in both
// colour schemes, like the real thing; the lit lamp switches on as the page
// loads. Built from plain shapes (21st.dev has no traffic-light element).

export type Light = "red" | "amber" | "green";

export const lightFor = (g: Grade | null): Light | null =>
  g === "F" || g === "D" ? "red" : g === "C" ? "amber" : g ? "green" : null;

const LAMPS: { light: Light; color: string }[] = [
  { light: "red", color: "#ff4d5e" },
  { light: "amber", color: "#f6c700" },
  { light: "green", color: "#2fd08f" },
];

const SIZES = {
  sm: { box: "gap-1 rounded-lg p-1", lamp: "size-3" },
  md: { box: "gap-1.5 rounded-xl p-1.5", lamp: "size-5" },
  lg: { box: "gap-2.5 rounded-2xl p-2.5", lamp: "size-11" },
};

export function TrafficLight({
  lit,
  size = "md",
  horizontal = false,
  className = "",
}: {
  lit: Light | null;
  size?: keyof typeof SIZES;
  horizontal?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <div
      role="img"
      aria-label={lit ? `Signal: ${lit}` : "Signal: off, not graded"}
      className={`inline-flex shrink-0 bg-[#1f2226] ring-1 ring-white/10 ${horizontal ? "flex-row" : "flex-col"} ${s.box} ${className}`}
    >
      {LAMPS.map(({ light, color }, i) => {
        const on = light === lit;
        return (
          <span
            key={light}
            className={`${s.lamp} rounded-full ${on ? "pop" : ""}`}
            style={
              on
                ? ({ background: color, boxShadow: `0 0 14px 1px ${color}80`, "--i": 3 + i } as React.CSSProperties)
                : { background: color, opacity: 0.16 }
            }
          />
        );
      })}
    </div>
  );
}
