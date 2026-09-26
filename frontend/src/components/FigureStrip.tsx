import Link from "next/link";

// Key figures as a ruled row rather than a box: a rule above and below and a
// thin divider between figures. `emphasis` marks the one figure the page wants
// acted on; `href` makes a figure a link.
export type Figure = {
  value: string;
  label: string;
  note?: string;
  emphasis?: boolean;
  href?: string;
};

const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

export function FigureStrip({ figures }: { figures: Figure[] }) {
  return (
    <div className="grid grid-cols-2 border-y border-line md:grid-cols-4">
      {figures.map((f, i) => {
        const body = (
          <>
            <p className={`text-3xl leading-none font-extrabold tabular-nums ${f.emphasis ? "text-accent-ink" : ""}`}>
              {f.value}
            </p>
            <p className={`mt-2 text-sm font-semibold ${f.href ? "road-link w-fit" : ""}`}>{f.label}</p>
            {f.note && <p className="mt-0.5 text-xs text-muted">{f.note}</p>}
          </>
        );
        // Dividers: between the two columns on phones, between all four on desktop.
        const cell = [
          "rise block border-line py-4 pr-4",
          i % 2 === 1 ? "border-l pl-4" : "",
          i >= 2 ? "max-md:border-t" : "",
          i === 2 ? "md:border-l md:pl-4" : "",
        ].join(" ");
        return f.href ? (
          <Link key={f.label} href={f.href} className={cell} style={stagger(i)}>
            {body}
          </Link>
        ) : (
          <div key={f.label} className={cell} style={stagger(i)}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
