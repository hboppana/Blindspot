import Link from "next/link";
import { ArrowRight, MapTrifold, Path, SealCheck, Snowflake } from "@phosphor-icons/react/ssr";
import { getFixList, getFixPlanNotes, getIntersection } from "@/lib/api";
import { capitalize, displayName, totalCrashEffect } from "@/lib/format";
import { fixStory, shortFixName } from "@/lib/plain";
import { Button } from "@/components/ui/button";
import { ListHero, RankSign } from "@/components/ListParts";
import { RequestLetter } from "@/components/RequestLetter";
import { ShareButton } from "@/components/ShareButton";
import { NumberTicker } from "@/components/viz/NumberTicker";
import { TrafficLight } from "@/components/viz/TrafficLight";

// The Fix Plan: the green light, last of the three signals. The Red List says what's
// broken, the Watch List what's getting worse; this says what building the
// fixes would do and how to move them forward. Every estimate uses only a
// fix's FHWA effect on total crashes, applied to that intersection's crashes.
// Snowflake Cortex adds the words, never the numbers: a short "where to start"
// and a draft request letter per fix, generated offline from these same
// figures (scripts/cortex_fix_plan.py). Without them the page is unchanged.

const COST_STEPS = ["low", "medium", "high"] as const;
const stagger = (i: number) => ({ "--i": i }) as React.CSSProperties;
const plain = (s: string) => capitalize(s.replace(/\s*\([^)]*\)/g, "").trim());
const range = (lo: number, hi: number) => (Math.round(lo) === Math.round(hi) ? `${Math.round(lo)}` : `${Math.round(lo)} to ${Math.round(hi)}`);

export default async function FixPlanPage() {
  const [fixes, notes] = await Promise.all([getFixList(), getFixPlanNotes()]);
  const details = await Promise.all(fixes.map((f) => getIntersection(f.id)));

  // One row per Red List intersection: its fix, the fix's effect, its cost.
  const rows = fixes.map((f, k) => {
    const d = details[k];
    const measure = d?.countermeasures.find((c) => c.name === f.recommended_fix) ?? d?.countermeasures[0] ?? null;
    const review = f.recommended_fix.startsWith("review needed");
    const effect = measure && !review ? totalCrashEffect(measure.effects) : null;
    return {
      f,
      review,
      measure: review ? null : measure,
      effect,
      cost: d?.case_file?.facts?.countermeasures.find((c) => c.id === measure?.id)?.cost ?? null,
    };
  });

  // Grouped by fix, the fix that avoids the most crashes first.
  const groups = [...new Set(rows.filter((r) => !r.review).map((r) => r.f.recommended_fix))]
    .map((fix) => {
      const members = rows.filter((r) => r.f.recommended_fix === fix);
      const perYear = members.reduce((n, r) => n + r.f.crashes_per_year, 0);
      const effect = members[0].effect;
      return {
        fix,
        members,
        perYear,
        avoided: effect ? ([perYear * effect[0], perYear * effect[1]] as const) : null,
        otherEffect: members[0].measure?.effects[0] ?? null,
        cost: members[0].cost,
        url: members[0].measure?.url ?? null,
      };
    })
    .sort((a, b) => (b.avoided?.[1] ?? 0) - (a.avoided?.[1] ?? 0));
  const reviews = rows.filter((r) => r.review);
  const lo = groups.reduce((n, g) => n + (g.avoided?.[0] ?? 0), 0);
  const hi = groups.reduce((n, g) => n + (g.avoided?.[1] ?? 0), 0);
  const covered = rows.length - reviews.length;
  const lowCost = rows.filter((r) => r.cost === "low").length;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 pb-16 sm:px-6 md:pt-12">
      <ListHero
        title="The Fix Plan"
        lead={`Every fix here is proven and ready to build. This is what building them would do for the Red List, and how to move them forward.`}
        light="green"
        stats={[
          {
            value: (
              <span className="tabular-nums">
                <NumberTicker value={Math.round(lo)} />
                <span className="text-xl">-</span>
                <NumberTicker value={Math.round(hi)} />
              </span>
            ),
            label: "fewer crashes a year, estimated",
            tone: "good",
          },
          { value: <NumberTicker value={groups.length} />, label: `proven fixes cover ${covered} of the ${rows.length}` },
          { value: <NumberTicker value={lowCost} />, label: "need only a low-cost fix" },
        ]}
      />

      {/* The plan */}
      <section className="mt-12">
        <h2 className="text-2xl font-extrabold tracking-tight">The plan, biggest payoff first</h2>
        <p className="mt-1 text-muted">
          Estimates apply each fix&apos;s federal result on total crashes to the crashes these intersections have now.
        </p>

        {notes?.plan && (
          <div className="reveal mt-5 flex gap-4 rounded-2xl border border-line bg-surface p-5">
            <Snowflake weight="bold" className="mt-0.5 size-6 shrink-0 text-[#29b5e8]" aria-hidden />
            <div>
              <p className="text-sm font-bold text-muted">Where to start</p>
              <p className="mt-1 text-lg leading-snug font-semibold">{notes.plan.summary}</p>
              <p className="mt-2 text-xs text-muted">Written by Snowflake Cortex from the figures on this page.</p>
            </div>
          </div>
        )}

        <ol className="mt-5 space-y-4">
          {groups.map((g, i) => (
            <li
              key={g.fix}
              className="reveal grid overflow-hidden rounded-2xl border border-line bg-surface lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,15rem)]"
              style={stagger(i)}
            >
              {/* The fix, drawn as a guide sign. */}
              <div className="bg-[#00613a] p-2 text-white">
                <div className="flex h-full flex-col rounded-xl border-2 border-white/85 p-5">
                  <p className="text-xl leading-snug font-extrabold">{shortFixName(g.fix)}</p>
                  <p className="mt-2 text-sm text-white/85">{fixStory(g.fix)}</p>
                  {g.url && (
                    <a
                      href={g.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-auto inline-flex items-center gap-1.5 pt-4 text-sm font-semibold text-white hover:underline"
                    >
                      How it works
                      <ArrowRight weight="bold" aria-hidden />
                    </a>
                  )}
                </div>
              </div>

              {/* Where it goes. */}
              <div className="p-5">
                <p className="text-xs font-bold text-muted">
                  {g.members.length} {g.members.length === 1 ? "intersection" : "intersections"} on the Red List
                </p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {g.members.map((m) => (
                    <li key={m.f.id}>
                      <Link
                        href={`/intersections/${m.f.id}`}
                        className="group flex items-center gap-2 rounded-lg py-1 pr-2 hover:bg-brand-soft"
                      >
                        <RankSign rank={m.f.rank} />
                        <span className="min-w-0 leading-tight">
                          <span className="block truncate text-sm font-bold group-hover:underline">
                            {displayName(m.f.name)}
                          </span>
                          <span className="block text-xs text-muted">{m.f.crashes_per_year} crashes a year</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              {/* What it buys, and what it costs. */}
              <div className="flex flex-col gap-4 border-t border-line p-5 lg:border-t-0 lg:border-l">
                {g.avoided ? (
                  <div>
                    <p className="text-3xl leading-none font-extrabold text-good-ink tabular-nums">
                      {range(g.avoided[0], g.avoided[1])}
                    </p>
                    <p className="mt-1 text-sm font-semibold">fewer crashes a year</p>
                    <p className="text-xs text-muted">of {g.perYear} now</p>
                  </div>
                ) : (
                  g.otherEffect && (
                    <p className="text-sm">
                      <span className="text-2xl font-extrabold text-good-ink">{g.otherEffect.value}</span>{" "}
                      <span className="font-semibold">{plain(g.otherEffect.measure).replace(/^Reduction in /, "fewer ")}</span>
                    </p>
                  )
                )}
                {g.cost && (
                  <div className="flex items-center gap-2.5 text-sm">
                    <span className="text-muted">Cost</span>
                    <span className="flex gap-1" aria-hidden>
                      {COST_STEPS.map((c, k) => (
                        <span
                          key={c}
                          className={`h-2 w-6 rounded-full ${k <= COST_STEPS.indexOf(g.cost!) ? "bg-good-ink" : "bg-line"}`}
                        />
                      ))}
                    </span>
                    <strong>{capitalize(g.cost)}</strong>
                  </div>
                )}
                {notes?.letters[g.fix] && (
                  <div className="mt-auto">
                    <RequestLetter {...notes.letters[g.fix]} about={shortFixName(g.fix)} source={notes.source} />
                  </div>
                )}
              </div>
            </li>
          ))}

          {reviews.length > 0 && (
            <li
              className="reveal flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-dashed border-line p-5"
              style={stagger(groups.length)}
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold">
                  {reviews.length === 1 ? "One intersection needs" : `${reviews.length} intersections need`} an
                  engineer&apos;s review first
                </p>
                <p className="mt-1 text-sm text-muted">
                  The crashes there are a mix of kinds, so no single standard fix fits:{" "}
                  {reviews.map((r, k) => (
                    <span key={r.f.id}>
                      {k > 0 && ", "}
                      <Link href={`/intersections/${r.f.id}`} className="font-semibold text-foreground hover:underline">
                        #{r.f.rank} {displayName(r.f.name)}
                      </Link>
                    </span>
                  ))}
                  .
                </p>
              </div>
              {reviews.map(
                (r) =>
                  notes?.letters[r.f.id] && (
                    <RequestLetter
                      key={r.f.id}
                      {...notes.letters[r.f.id]}
                      about={`engineering review of ${displayName(r.f.name)}`}
                      source={notes.source}
                    />
                  ),
              )}
            </li>
          )}
        </ol>
      </section>

      {/* Move it forward */}
      <section className="mt-14">
        <h2 className="text-2xl font-extrabold tracking-tight">Move it forward</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="reveal flex flex-col rounded-2xl bg-brand p-6 text-white ring-1 ring-line md:row-span-2">
            <SealCheck weight="fill" className="size-8 text-[#2fd08f]" aria-hidden />
            <h3 className="mt-4 text-2xl font-extrabold tracking-tight">Take the reports to the city</h3>
            <p className="mt-2 text-white/75">
              Each intersection&apos;s report shows what keeps happening, the proven fix, what it costs and what it
              would prevent, ready to print or share with city staff and commissioners.
            </p>
            <div className="mt-auto flex flex-wrap gap-3 pt-6">
              <Button asChild>
                <Link href="/red-list">
                  Open the Red List
                  <ArrowRight weight="bold" aria-hidden />
                </Link>
              </Button>
            </div>
          </div>

          <div className="reveal rounded-2xl border border-line bg-surface p-6" style={stagger(1)}>
            <Path weight="bold" className="size-7 text-muted" aria-hidden />
            <h3 className="mt-3 text-xl font-extrabold tracking-tight">Check your own route</h3>
            <p className="mt-1 text-muted">
              Driving, walking or biking: see the grade of every intersection you pass, and the safest way through.
            </p>
            <Link href="/map" className="mt-4 inline-flex items-center gap-1.5 font-bold hover:underline">
              Route Planner on the City Map
              <ArrowRight weight="bold" aria-hidden />
            </Link>
          </div>

          <div className="reveal rounded-2xl border border-line bg-surface p-6" style={stagger(2)}>
            <MapTrifold weight="bold" className="size-7 text-muted" aria-hidden />
            <h3 className="mt-3 text-xl font-extrabold tracking-tight">Spread the word</h3>
            <p className="mt-1 text-muted">The more people see the Red List, the harder it is to leave these corners as they are.</p>
            <div className="mt-4">
              <ShareButton path="/red-list" title="StreetSmart: Gainesville's Red List" label="Share the Red List" />
            </div>
          </div>
        </div>
      </section>

      {/* The three signals, together */}
      <section className="reveal mt-14 overflow-hidden rounded-3xl bg-brand text-white ring-1 ring-line">
        <div className="lane-line" aria-hidden />
        <div className="flex flex-col items-start gap-8 px-6 py-10 sm:px-10 md:flex-row md:items-center">
          <div className="flex gap-3" aria-hidden>
            <TrafficLight lit="red" size="md" />
            <TrafficLight lit="amber" size="md" />
            <TrafficLight lit="green" size="md" />
          </div>
          <div className="flex-1">
            <p className="text-3xl leading-tight font-extrabold tracking-tight text-balance">
              Red means fix it. Amber means watch it. Green means go.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="road" className="h-11 px-5 ring-1 ring-white/20">
              <Link href="/red-list">Red List</Link>
            </Button>
            <Button asChild variant="road" className="h-11 px-5 ring-1 ring-white/20">
              <Link href="/watch-list">Watch List</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
