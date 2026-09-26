/* eslint-disable @next/next/no-img-element --
   Google imagery must load straight from Google; next/image would proxy and cache it. */
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCitySummary, getIntersection } from "@/lib/api";
import { getImagery } from "@/lib/imagery";
import { capitalize, displayName, num, titleCase } from "@/lib/format";
import { StatTile } from "@/components/StatTile";
import {
  CrashesByHour,
  CrashesByYear,
  CrashTypesVsSimilar,
} from "@/components/Charts";

export default async function CaseFilePage(
  props: PageProps<"/intersection/[id]">,
) {
  const { id } = await props.params;
  const x = await getIntersection(id);
  if (!x) notFound();

  const [city, imagery] = await Promise.all([
    getCitySummary(),
    getImagery(x.lat, x.lon),
  ]);
  const periodEnd = city.summary.period.split(" to ")[1];

  const facts = x.facts;
  const text = x.case_file;
  const fix =
    facts?.countermeasures.find(
      (c) => c.id === text?.recommended_fix?.countermeasure_id,
    ) ?? null;
  const distinctive = facts?.distinctive_crash_types ?? [];

  return (
    <article className="mx-auto max-w-5xl space-y-10 p-6">
      <header>
        <Link href="/" className="text-sm opacity-60 hover:underline">
          ← City
        </Link>
        <p className="mt-4 text-sm opacity-60">Rank #{x.rank} citywide</p>
        <h1 className="text-3xl font-semibold">{displayName(x.name)}</h1>
        {text ? (
          <p className="mt-2 max-w-3xl text-lg">{text.verdict}</p>
        ) : (
          <p className="mt-2 opacity-70">
            Fewer than 5 crashes since 2022, so there is no detailed case file.
          </p>
        )}
        {facts?.confidence === "low" && (
          <p className="mt-3 text-sm">
            <span className="font-medium">⚠ Low confidence:</span>{" "}
            {facts.confidence_reasons.join("; ")}
          </p>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile value={num(x.crashes.crashes)} label="Crashes" note="since 2022" />
        <StatTile value={`#${x.rank}`} label="Citywide rank" note="by crashes since 2022" />
        <StatTile
          value={facts?.crash_rate ? `${facts.crash_rate.times_similar_corners}×` : "n/a"}
          label="Crash rate vs. similar corners"
          note={
            facts?.crash_rate
              ? `${facts.crash_rate.per_million_entering_vehicles} vs. ${facts.crash_rate.similar_corners_median} per million entering vehicles`
              : "no traffic volume data"
          }
        />
        <StatTile
          value={facts?.screening ? num(facts.screening.excess_crashes_per_year) : "n/a"}
          label="Excess crashes a year"
          note={
            facts?.screening
              ? `${num(facts.screening.observed_crashes)} observed vs. ${num(facts.screening.predicted_for_similar_corner)} predicted since 2022`
              : undefined
          }
        />
      </section>

      <section>
        <h2 className="font-semibold">Imagery</h2>
        {imagery ? (
          <div className="mt-3 grid gap-4 md:grid-cols-2">
            <figure>
              <img
                src={imagery.satelliteUrl}
                alt={`Satellite view of ${displayName(x.name)}`}
                className="aspect-[8/5] w-full rounded-lg object-cover"
              />
              <figcaption className="mt-1 text-xs opacity-60">
                Satellite · Google
                {facts?.imagery_dates && ` · imagery analyzed ${facts.imagery_dates}`}
              </figcaption>
            </figure>
            {imagery.streetView ? (
              <figure>
                <img
                  src={imagery.streetView.url}
                  alt={`Street View of ${displayName(x.name)}`}
                  className="aspect-[8/5] w-full rounded-lg object-cover"
                />
                <figcaption className="mt-1 text-xs opacity-60">
                  Street View · Google
                  {imagery.streetView.date && ` · captured ${imagery.streetView.date}`}
                </figcaption>
              </figure>
            ) : (
              <p className="text-sm opacity-60">No Street View at this corner.</p>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm opacity-60">
            Set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to show satellite and Street View.
          </p>
        )}
      </section>

      <section className="grid gap-8 md:grid-cols-2">
        <div>
          <h2 className="font-semibold">Crashes by year</h2>
          <CrashesByYear byYear={x.crashes.by_year} periodEnd={periodEnd} />
        </div>
        <div>
          <h2 className="font-semibold">Crashes by hour of day</h2>
          <CrashesByHour byHour={x.crashes.by_hour} />
        </div>
      </section>

      {distinctive.length > 0 && (
        <section>
          <h2 className="font-semibold">Crash types above similar corners</h2>
          <p className="text-sm opacity-60">
            {distinctive[0].period ?? "2015-2018 (FDOT)"}, the latest years with
            crash-type detail
          </p>
          <div className="mt-3">
            <CrashTypesVsSimilar
              types={distinctive.map((d) => ({
                type: d.type,
                crashes: d.crashes,
                expected: d.expected_at_similar_corners,
              }))}
            />
          </div>
          {text && text.factor_explanations.length > 0 && (
            <ul className="mt-4 space-y-3 text-sm">
              {text.factor_explanations.map((e) => (
                <li key={e.factor}>
                  <span className="font-medium">{capitalize(e.factor)}.</span>{" "}
                  <span className="opacity-80">{e.explanation}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-black/10 p-5 dark:border-white/15">
          <p className="text-sm opacity-60">Recommended fix</p>
          {fix ? (
            <>
              <h2 className="mt-1 text-xl font-semibold">{fix.name}</h2>
              <p className="text-sm opacity-60">Cost: {fix.cost}</p>
              <ul className="mt-3 space-y-1 text-sm">
                {fix.fhwa_effects.map((e) => (
                  <li key={e}>
                    <span className="font-medium">FHWA:</span> {e}
                  </li>
                ))}
              </ul>
              {text?.recommended_fix && (
                <p className="mt-3 text-sm opacity-80">{text.recommended_fix.why}</p>
              )}
            </>
          ) : (
            <p className="mt-1">
              Mixed pattern: no single fixable cause stands out.
            </p>
          )}
        </div>

        {facts?.gainesville_precedent && (
          <div className="rounded-lg border border-black/10 p-5 dark:border-white/15">
            <p className="text-sm opacity-60">Gainesville precedent</p>
            <h2 className="mt-1 text-xl font-semibold">
              {titleCase(facts.gainesville_precedent.intersection)}
            </h2>
            <p className="mt-3 text-sm font-medium">
              {facts.gainesville_precedent.effect}
            </p>
            <p className="mt-2 text-sm opacity-80">
              {facts.gainesville_precedent.change}
            </p>
          </div>
        )}
      </section>
    </article>
  );
}
