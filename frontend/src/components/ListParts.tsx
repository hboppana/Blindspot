import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react/ssr";
import { TrafficLight, type Light } from "@/components/viz/TrafficLight";

// Shared by the Red List, the Watch List and the Road Map, so the three read as
// one signal: a lit lamp and three figures up top, then the cards.

const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

export function ListHero({
  title,
  lead,
  light,
  stats,
}: {
  title: string;
  lead: string;
  light: Light;
  stats: { value: React.ReactNode; label: string; tone?: "danger" | "warn" | "good" }[];
}) {
  return (
    <section className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_auto]">
      <div>
        <h1 className="rise text-5xl leading-none font-extrabold tracking-tight sm:text-6xl" style={stagger(0)}>
          {title}
        </h1>
        <p className="rise mt-4 max-w-[52ch] text-lg text-muted" style={stagger(1)}>
          {lead}
        </p>
      </div>
      <div className="rise flex items-center gap-6" style={stagger(2)}>
        <TrafficLight lit={light} size="lg" />
        <dl className="grid gap-3">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <dt className="sr-only">{s.label}</dt>
              <dd
                className={`flex w-24 justify-end text-3xl font-extrabold ${
                  s.tone === "danger"
                    ? "text-danger-ink"
                    : s.tone === "warn"
                      ? "text-[var(--series-2)]"
                      : s.tone === "good"
                        ? "text-good-ink"
                        : ""
                }`}
              >
                {s.value}
              </dd>
              <dd className="max-w-[22ch] text-muted">{s.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

// The rank on a road sign: a yellow diamond (warning) or an orange one
// (the orange of work-zone signs, for places heading the wrong way).
export function RankSign({ rank, tone = "yellow", size = "md" }: { rank: number; tone?: "yellow" | "orange"; size?: "md" | "lg" }) {
  return (
    <span
      className={`relative grid shrink-0 place-items-center ${size === "lg" ? "size-16" : "size-11"}`}
      aria-label={`Rank ${rank}`}
    >
      <span
        className={`absolute rotate-45 ring-2 ring-[#1f2226] ring-inset ${size === "lg" ? "inset-[9px] rounded-[7px]" : "inset-[6px] rounded-[5px]"} ${
          tone === "orange" ? "bg-[#f28c28]" : "bg-accent"
        }`}
      />
      <span className={`relative font-extrabold text-[#1f2226] tabular-nums ${size === "lg" ? "text-xl" : "text-sm"}`}>
        {rank}
      </span>
    </span>
  );
}

// One intersection. The whole card is the link to its report.
export function ListCard({
  href,
  wide,
  i,
  children,
}: {
  href: string;
  wide?: boolean;
  i: number;
  children: React.ReactNode;
}) {
  return (
    <li className={`reveal ${wide ? "sm:col-span-2 lg:col-span-3" : ""}`} style={stagger(i)}>
      <Link
        href={href}
        className="group flex h-full flex-col rounded-2xl border border-line bg-surface p-5 transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-muted"
      >
        {children}
        <span className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-bold">
          View Report
          <ArrowRight weight="bold" className="transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </Link>
    </li>
  );
}

// A labelled plain-language line inside a card.
export function CardLine({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm leading-snug">{children}</dd>
    </div>
  );
}

export function CrossLink({ href, question, label }: { href: string; question: string; label: string }) {
  return (
    <Link
      href={href}
      className="group mt-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line px-6 py-5 transition-colors hover:bg-surface"
    >
      <span className="font-bold">{question}</span>
      <span className="inline-flex items-center gap-1.5 font-bold">
        {label}
        <ArrowRight weight="bold" className="transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}
