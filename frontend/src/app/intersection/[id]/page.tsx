import { notFound } from "next/navigation";
import { getIntersection } from "@/lib/api";
import { displayName, num } from "@/lib/format";
import { StatTile } from "@/components/StatTile";

export default async function CaseFilePage(
  props: PageProps<"/intersection/[id]">,
) {
  const { id } = await props.params;
  const x = await getIntersection(id);
  if (!x) notFound();

  const facts = x.facts;
  const text = x.case_file;
  const fix = facts?.countermeasures.find(
    (c) => c.id === text?.recommended_fix?.countermeasure_id,
  );
  const years = Object.entries(x.crashes.by_year);

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <header>
        <p className="text-sm opacity-60">Rank #{x.rank} citywide</p>
        <h1 className="text-3xl font-semibold">{displayName(x.name)}</h1>
        {text ? (
          <p className="mt-2 text-lg">{text.verdict}</p>
        ) : (
          <p className="mt-2 opacity-70">
            Fewer than 5 crashes since 2022: no detailed case file.
          </p>
        )}
        {facts?.confidence === "low" && (
          <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
            Low confidence: {facts.confidence_reasons.join("; ")}
          </p>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile
          value={num(x.crashes.crashes)}
          label="crashes"
          note="since 2022"
        />
        <StatTile value={`#${x.rank}`} label="citywide rank" />
        <StatTile
          value={
            facts?.crash_rate
              ? `${facts.crash_rate.times_similar_corners}×`
              : "n/a"
          }
          label="crash rate vs. similar corners"
          note="per million entering vehicles"
        />
        <StatTile
          value={
            facts?.screening
              ? num(facts.screening.excess_crashes_per_year)
              : "n/a"
          }
          label="excess crashes a year"
          note="above similar corners, since 2022"
        />
      </section>

      {/* TODO: satellite + Street View, live from Google Maps (imagery isn't in the repo) */}
      <section className="flex h-64 items-center justify-center rounded-lg bg-black/5 text-sm opacity-60 dark:bg-white/5">
        Satellite and Street View go here
        {facts?.imagery_dates && ` · imagery ${facts.imagery_dates}`}
      </section>

      {/* TODO: Recharts bar charts for by-year and by-hour */}
      <section>
        <h2 className="font-semibold">Crashes by year</h2>
        <ul className="mt-2 flex gap-4 text-sm tabular-nums">
          {years.map(([year, n]) => (
            <li key={year}>
              {year}: {n}
            </li>
          ))}
        </ul>
      </section>

      {facts && facts.distinctive_crash_types.length > 0 && (
        <section>
          <h2 className="font-semibold">Distinctive crash types</h2>
          <ul className="mt-2 space-y-3">
            {facts.distinctive_crash_types.map((d) => {
              const why = text?.factor_explanations.find(
                (e) => e.factor === d.type,
              );
              return (
                <li key={d.type} className="text-sm">
                  <span className="font-medium capitalize">{d.type}</span>:{" "}
                  {d.crashes} crashes vs. {d.expected_at_similar_corners}{" "}
                  expected at similar corners ({d.period ?? "2015-2018 (FDOT)"})
                  {why && <p className="mt-1 opacity-70">{why.explanation}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {fix && (
        <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
          <h2 className="font-semibold">Recommended fix: {fix.name}</h2>
          <p className="text-sm opacity-60">Cost: {fix.cost}</p>
          <ul className="mt-2 text-sm">
            {fix.fhwa_effects.map((e) => (
              <li key={e}>FHWA: {e}</li>
            ))}
          </ul>
          {text?.recommended_fix && (
            <p className="mt-2 text-sm opacity-80">{text.recommended_fix.why}</p>
          )}
        </section>
      )}

      {facts?.gainesville_precedent && (
        <section className="rounded-lg border border-black/10 p-4 dark:border-white/15">
          <h2 className="font-semibold">
            Gainesville precedent: {facts.gainesville_precedent.intersection}
          </h2>
          <p className="mt-1 text-sm">{facts.gainesville_precedent.change}</p>
          <p className="mt-1 text-sm font-medium">
            {facts.gainesville_precedent.effect}
          </p>
        </section>
      )}
    </div>
  );
}
