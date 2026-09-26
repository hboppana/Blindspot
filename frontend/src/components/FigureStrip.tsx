import Link from "next/link";

// A row of key figures in one panel, divided by rules rather than boxed as
// separate cards. `emphasis` marks the one figure the page wants acted on;
// `href` makes a figure a link.
export type Figure = {
  value: string;
  label: string;
  note?: string;
  emphasis?: boolean;
  href?: string;
};

export function FigureStrip({ figures }: { figures: Figure[] }) {
  return (
    <div className="grid grid-cols-2 divide-line overflow-hidden rounded-md border border-line bg-surface md:grid-cols-4 md:divide-x">
      {figures.map((f) => {
        const body = (
          <>
            <p
              className={`text-[28px] leading-none font-extrabold tabular-nums ${
                f.emphasis ? "text-accent-ink" : ""
              }`}
            >
              {f.value}
            </p>
            <p className={`mt-2 text-sm font-semibold ${f.href ? "road-link w-fit" : ""}`}>
              {f.label}
            </p>
            {f.note && <p className="mt-0.5 text-xs text-muted">{f.note}</p>}
          </>
        );
        const cell = `block border-line p-4 max-md:[&:nth-child(n+3)]:border-t max-md:odd:border-r ${
          f.emphasis ? "shadow-[inset_0_-3px_0_var(--accent)]" : ""
        }`;
        return f.href ? (
          <Link key={f.label} href={f.href} className={`${cell} hover:bg-brand-soft`}>
            {body}
          </Link>
        ) : (
          <div key={f.label} className={cell}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
