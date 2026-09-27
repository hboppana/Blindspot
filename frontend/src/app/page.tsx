import Link from "next/link";
import { ArrowRight, MagnifyingGlass, Scales, SealCheck, Wrench } from "@phosphor-icons/react/ssr";
import { getCitySummary, getFixList, getIntersection } from "@/lib/api";
import { displayName, monthYear, num, titleCase } from "@/lib/format";
import { Button } from "@/components/ui/button";

// The front door. Four beats, one idea each: where crashes happen (problem),
// why that is the road's doing and not only the drivers' (the reviewer's first
// question), how StreetSmart reads the road (solution), and what fixing the
// worst corners is worth (impact). Detail lives on the map and the lists.

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

  // The evidence that it's the road: the worst corner against intersections
  // with the same traffic, and a Gainesville corner where changing the road
  // cut crashes (from the worst corner's case file).
  const worst = fixes[0];
  const worstSimilar = worst ? Math.max(worst.crashes_per_year - worst.excess_crashes_per_year, 0) : 0;
  const precedent = worst ? (await getIntersection(worst.id))?.case_file?.facts?.gainesville_precedent : null;
  const precedentDrop = Number(precedent?.effect.match(/(\d+)%\s+fewer/)?.[1] ?? NaN);
  // Its first sentence says what was built, minus the bracketed road numbers.
  const precedentChange = precedent?.change.split(". ")[0].replace(/\s*\([^)]*\)/g, "");

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
            StreetSmart is ground intelligence: it reads Gainesville&apos;s roads to find the intersections
            that keep crashing, why, and the fix.
          </p>
          <div className="rise mt-9 flex flex-wrap gap-3" style={stagger(2)}>
            <Button asChild size="lg">
              <Link href="/map">
                Open the City Map
                <ArrowRight weight="bold" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/red-list">See the Red List</Link>
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
          <div className="mt-10 grid gap-10 md:grid-cols-2 md:gap-16">
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
            <div>
              <p className="text-7xl leading-none font-extrabold tracking-tighter tabular-nums md:text-8xl">
                {num(s.with_repeat_crashes)}
              </p>
              <p className="mt-4 max-w-[36ch] text-lg text-muted">
                intersections have had five or more crashes since 2022. The same corners, again and again.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why the road */}
      {worst && (
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
          <h2 className="reveal max-w-[22ch] text-4xl leading-tight font-extrabold tracking-tight text-balance md:text-5xl">
            It isn&apos;t just the drivers.
          </h2>
          <p className="reveal mt-4 max-w-[60ch] text-lg text-muted">
            Every crash involves a mistake. But the same Gainesville drivers use every intersection in town, and a few
            crash far more than others carrying the same traffic. When one corner keeps producing the same crash, the
            corner is the cause.
          </p>

          <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            {/* Same traffic, different road */}
            <div className="reveal flex flex-col rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <h3 className="text-sm font-bold text-muted">Same traffic, different road</h3>
              <p className="mt-2 text-2xl leading-snug font-extrabold tracking-tight">
                {displayName(worst.name)} has {worst.crashes_per_year} crashes a year. Intersections with the same
                traffic and layout have {Math.round(worstSimilar)}.
              </p>
              <div className="mt-8 space-y-5">
                {[
                  { label: "Intersections with the same traffic", value: worstSimilar, color: "var(--baseline)" },
                  { label: displayName(worst.name), value: worst.crashes_per_year, color: "#c8102e" },
                ].map((b) => (
                  <div key={b.label}>
                    <div className="flex items-baseline justify-between gap-4 text-sm">
                      <span className="font-semibold">{b.label}</span>
                      <span className="text-lg font-extrabold tabular-nums">{Math.round(b.value)} a year</span>
                    </div>
                    <div
                      className="reveal-grow mt-2 h-4 rounded-full"
                      style={{ width: `${(b.value / worst.crashes_per_year) * 100}%`, background: b.color }}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-auto pt-8 text-muted">
                Same drivers, same number of cars. The{" "}
                <span className="font-bold text-danger-ink">
                  {Math.round(worst.excess_crashes_per_year)} extra crashes
                </span>{" "}
                a year come from the intersection itself.
              </p>
            </div>

            <div className="grid gap-4">
              {/* Change the road, crashes drop */}
              {precedent && Number.isFinite(precedentDrop) && (
                <div className="reveal rounded-2xl bg-brand p-6 text-white ring-1 ring-line sm:p-8">
                  <h3 className="text-sm font-bold text-accent">Change the road, crashes drop</h3>
                  <p className="mt-2 text-xl leading-snug font-extrabold">
                    {titleCase(precedent.intersection)}: about {precedentDrop}% fewer crashes after the road was rebuilt.
                  </p>
                  <div className="mt-5 space-y-2 text-sm">
                    {[
                      { label: "Before", value: 100, color: "#5f666d" },
                      { label: "After", value: 100 - precedentDrop, color: "#2fd08f" },
                    ].map((b) => (
                      <div key={b.label} className="flex items-center gap-3">
                        <span className="w-12 text-white/60">{b.label}</span>
                        <span
                          className="reveal-grow h-3 rounded-full"
                          style={{ width: `${b.value * 0.8}%`, background: b.color }}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-sm text-white/65">
                    Same drivers. {precedentChange}. Measured against the change across the whole city.
                  </p>
                </div>
              )}

              {/* The federal standard */}
              <div className="reveal rounded-2xl border border-line bg-surface p-6 sm:p-8">
                <h3 className="text-sm font-bold text-muted">The federal standard</h3>
                <p className="mt-2 text-lg leading-snug font-bold">
                  The FHWA&apos;s Safe System Approach starts from a plain fact: people make mistakes, so roads should be
                  built so a mistake doesn&apos;t cost a life.
                </p>
                <p className="mt-3 flex items-start gap-2 text-sm text-muted">
                  <SealCheck weight="fill" className="mt-0.5 size-4 shrink-0 text-good-ink" aria-hidden />
                  Every fix StreetSmart suggests is on the FHWA&apos;s list of proven safety countermeasures.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

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
                <Link href="/red-list">
                  See the Red List
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
