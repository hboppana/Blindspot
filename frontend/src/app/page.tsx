import Link from "next/link";
import { ArrowRight, MagnifyingGlass, Scales, Wrench } from "@phosphor-icons/react/ssr";
import { getCitySummary, getFixList } from "@/lib/api";
import { displayName, monthYear, num } from "@/lib/format";
import { Button } from "@/components/ui/button";

// The front door. Three beats, one idea each: where crashes happen (problem),
// how StreetSmart reads them (solution), what fixing the worst corners is worth
// (impact). Detail lives on the map and the wreck list, one click away.

const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;

const STEPS = [
  {
    Icon: Scales,
    title: "Compare",
    body: "Each intersection is measured against corners with the same traffic, signals and layout.",
  },
  {
    Icon: MagnifyingGlass,
    title: "Diagnose",
    body: "Crash reports and street imagery show which kind of crash happens more than it should.",
  },
  {
    Icon: Wrench,
    title: "Fix",
    body: "That pattern is matched to a federal Proven Safety Countermeasure built for it.",
  },
];

export default async function Home() {
  const [{ summary: s }, fixes] = await Promise.all([getCitySummary(), getFixList()]);
  const through = monthYear(s.period.split(" to ")[1]);

  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:pt-16 md:pb-20">
        <div>
          <h1
            className="rise text-5xl leading-[0.98] font-extrabold tracking-tight text-balance sm:text-6xl"
            style={stagger(0)}
          >
            Safer streets start at the corner.
          </h1>
          <p className="rise mt-6 max-w-[34ch] text-lg leading-relaxed text-muted sm:text-xl" style={stagger(1)}>
            StreetSmart finds Gainesville&apos;s most dangerous intersections, shows why they keep
            crashing, and names the fix.
          </p>
          <div className="rise mt-9 flex flex-wrap gap-3" style={stagger(2)}>
            <Button asChild size="lg">
              <Link href="/map">
                Open the City Map
                <ArrowRight weight="bold" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/fix-list">See the Wreck List</Link>
            </Button>
          </div>
        </div>

        {/* The brand's cross-road warning sign (MUTCD W2-1), at road scale. */}
        <div className="hidden justify-center md:flex" aria-hidden>
          <div className="pop relative aspect-square w-[min(100%,260px)]" style={stagger(3)}>
            <div className="absolute inset-[14.6%] rotate-45 rounded-[1.75rem] bg-accent shadow-[0_30px_60px_-20px_rgb(107_82_0/0.45)] ring-[6px] ring-[#1f2226] ring-inset" />
            <div className="absolute top-1/2 left-1/2 h-[46%] w-[9.5%] -translate-1/2 bg-[#1f2226]" />
            <div className="absolute top-1/2 left-1/2 h-[9.5%] w-[46%] -translate-1/2 bg-[#1f2226]" />
          </div>
        </div>
      </section>

      {/* Problem */}
      <section className="border-t border-line bg-surface">
        <div className="reveal mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <p className="text-sm font-bold tracking-[0.14em] text-accent-ink uppercase">The problem</p>
          <h2 className="mt-3 max-w-[18ch] text-4xl leading-tight font-extrabold tracking-tight md:text-5xl">
            Most crashes happen where roads meet.
          </h2>
          <div className="mt-10 grid gap-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] md:gap-16">
            <div>
              <p className="text-7xl leading-none font-extrabold tracking-tighter tabular-nums md:text-8xl">
                {s.share_of_crashes_at_intersections_pct}%
              </p>
              <p className="mt-4 max-w-[36ch] text-lg text-muted">
                of Gainesville crashes since January 2022 were at an intersection. That&apos;s{" "}
                <span className="font-semibold text-foreground">
                  {num(s.crashes_at_intersections_since_2022)} crashes
                </span>
                .
              </p>
            </div>
            <div className="md:self-end">
              <p className="text-5xl leading-none font-extrabold tracking-tight tabular-nums">
                {num(s.with_repeat_crashes)}
              </p>
              <p className="mt-3 max-w-[30ch] text-muted">
                intersections have had five or more. The same corners, again and again.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Solution */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
        <h2 className="reveal max-w-[20ch] text-4xl text-balance leading-tight font-extrabold tracking-tight md:text-5xl">
          We find the pattern, then the fix.
        </h2>
        <ol className="relative mt-12 grid gap-10 md:grid-cols-3 md:gap-10">
          {/* The dashed centre line joins the three steps on wide screens. */}
          <div className="lane-dash absolute top-7 right-[16%] left-[16%] hidden md:block" aria-hidden />
          {STEPS.map(({ Icon, title, body }) => (
            <li key={title} className="reveal relative md:text-center">
              <span className="relative grid size-14 place-items-center rounded-full bg-brand text-accent ring-8 ring-background md:mx-auto">
                <Icon size={26} weight="bold" aria-hidden />
              </span>
              <h3 className="mt-6 text-2xl font-extrabold tracking-tight">{title}</h3>
              <p className="mt-2 max-w-[32ch] text-muted md:mx-auto">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Impact */}
      <section className="px-4 pb-16 sm:px-6 md:pb-20">
        <div className="reveal mx-auto max-w-6xl overflow-hidden rounded-3xl bg-brand text-white ring-1 ring-line">
          <div className="lane-line" aria-hidden />
          <div className="grid gap-12 px-6 py-12 sm:px-10 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:px-14 md:py-14">
            <div>
              <h2 className="text-4xl leading-tight font-extrabold tracking-tight text-balance md:text-5xl">
                Fix {fixes.length} intersections. Address{" "}
                <span className="text-accent">{num(s.fix_list_crashes_per_year)}</span> crashes a year.
              </h2>
              <p className="mt-5 max-w-[40ch] text-lg text-white/65">
                {num(s.fix_list_excess_crashes_per_year)} of those are more than similar intersections
                see. That excess is what each fix is designed to remove.
              </p>
              <Button asChild size="lg" className="mt-9">
                <Link href="/fix-list">
                  See the Wreck List
                  <ArrowRight weight="bold" aria-hidden />
                </Link>
              </Button>
            </div>

            <ol className="self-center">
              {fixes.slice(0, 3).map((f) => (
                <li key={f.id} className="border-t border-white/12 first:border-t-0">
                  <Link
                    href={`/intersections/${f.id}`}
                    className="group grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-4 py-5"
                  >
                    <span className="grid size-9 place-items-center rounded-full bg-accent text-sm font-extrabold text-[#1f2226] tabular-nums">
                      {f.rank}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-bold decoration-accent decoration-2 underline-offset-4 group-hover:underline">
                        {displayName(f.name)}
                      </span>
                      <span className="block truncate text-sm text-white/55">{f.recommended_fix}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-xl font-extrabold tabular-nums">{f.crashes_per_year}</span>
                      <span className="block text-xs text-white/55">a year</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-6">
          <p>
            Crash data from dataGNV and FDOT, January 2022 to {through}. Fixes from the FHWA.
          </p>
          <Link href="/backtest" className="road-link font-semibold text-foreground">
            How We Tested This
          </Link>
        </div>
      </footer>
    </>
  );
}
