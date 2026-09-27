// Crashes each year as columns, so a climb reads at a glance. The current
// year is only partly over: its solid part is the crashes so far and a
// striped cap takes it to a full-year pace, so it is never mistaken for a
// finished year.

const ORANGE = "var(--series-2)";

export function YearTrend({
  years,
  size = "md",
}: {
  years: { year: number; crashes: number; partial: boolean; pace: number }[];
  size?: "md" | "lg";
}) {
  const max = Math.max(...years.map((y) => Math.max(y.pace, y.crashes)), 1);
  const h = size === "lg" ? 120 : 76;
  return (
    <figure>
      <div className="flex items-end gap-2" style={{ height: h + 20 }} role="img" aria-label={label(years)}>
        {years.map((y, i) => {
          const solid = (y.crashes / max) * h;
          const cap = y.partial ? Math.max(0, ((y.pace - y.crashes) / max) * h) : 0;
          return (
            <div key={y.year} className="flex flex-1 flex-col items-center justify-end">
              <span className="mb-1 text-xs font-bold tabular-nums">{y.partial ? `~${y.pace}` : y.crashes}</span>
              {/* Cap and bar grow as one column. */}
              <span className="reveal-grow-y flex w-full flex-col">
                {cap > 0 && (
                  <span
                    className="w-full rounded-t-[4px] border border-b-0 border-dashed"
                    style={{
                      height: cap,
                      borderColor: ORANGE,
                      background: `repeating-linear-gradient(135deg, color-mix(in oklab, ${ORANGE} 35%, transparent) 0 3px, transparent 3px 7px)`,
                    }}
                  />
                )}
                <span
                  className={`w-full ${cap > 0 ? "" : "rounded-t-[4px]"}`}
                  style={{
                    height: Math.max(solid, 2),
                    background: ORANGE,
                    // Earlier years sit back so the climb to the latest reads first.
                    opacity: 0.4 + 0.6 * (i / Math.max(years.length - 1, 1)),
                  }}
                />
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-2 text-[11px] text-muted">
        {years.map((y) => (
          <span key={y.year} className="flex-1 text-center">
            {y.partial ? `${y.year}*` : y.year}
          </span>
        ))}
      </div>
    </figure>
  );
}

const label = (years: { year: number; crashes: number; partial: boolean; pace: number }[]) =>
  "Crashes by year: " +
  years.map((y) => (y.partial ? `${y.year} ${y.crashes} so far, on pace for ${y.pace}` : `${y.year} ${y.crashes}`)).join(", ");
