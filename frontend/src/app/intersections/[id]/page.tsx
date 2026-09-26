import Link from "next/link";
import { notFound } from "next/navigation";
import { API_BASE_URL, getCitySummary, getIntersection } from "@/lib/api";
import { capitalize, displayName, monthYear, num, titleCase } from "@/lib/format";
import { FigureStrip } from "@/components/FigureStrip";
import { CaseImagery } from "@/components/CaseImagery";
import { FeatureChecklist } from "@/components/FeatureChecklist";
import { PrintButton } from "@/components/PrintButton";
import {
  CrashesByHour,
  CrashesByYear,
  CrashTypesVsSimilar,
} from "@/components/Charts";

export default async function CaseFilePage(
  props: PageProps<"/intersections/[id]">,
) {
  const { id } = await props.params;
  const [x, city] = await Promise.all([getIntersection(id), getCitySummary()]);
  if (!x) notFound();

  const periodEnd = city.summary.period.split(" to ")[1];
  const name = displayName(x.name);
  const cf = x.case_file;
  const text = cf?.case_file;
  const facts = cf?.facts ?? null;
  const profile = cf?.crash_profile ?? null;
  const gemini = x.has_gemini_description;
  const fix = x.countermeasures[0] ?? null;
  // cost lives in the facts' copy of the countermeasure
  const fixCost = facts?.countermeasures.find((c) => c.id === fix?.id)?.cost;
  const distinctive = gemini ? (facts?.distinctive_crash_types ?? []) : [];

  return (
    <article className="mx-auto max-w-5xl space-y-5 px-6 pt-5 pb-10 print:space-y-6 print:p-0">
      <header>
        <Link href="/" className="road-link text-sm font-semibold print:hidden">
          Back to the city map
        </Link>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-muted">
              {x.screening_rank ? `Ranked #${x.screening_rank} citywide` : "Not ranked"}
              {x.fix_list_rank && (
                <span className="text-accent-ink">, #{x.fix_list_rank} on the fix list</span>
              )}
            </p>
            <h1 className="mt-2 text-4xl leading-tight font-extrabold tracking-tight">{name}</h1>
          </div>
          <div className="flex gap-2 print:hidden">
            {API_BASE_URL ? (
              <a
                href={`/intersections/${x.id}/report`}
                target="_blank"
                className="rounded-md bg-brand px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover active:translate-y-px"
              >
                Download report (PDF)
              </a>
            ) : (
              <PrintButton />
            )}
          </div>
        </div>
        {text && <p className="mt-2 max-w-[65ch] text-lg">{text.verdict}</p>}
        {!cf && (
          <p className="mt-3 opacity-70">
            No case file: too few crashes to describe a pattern.
          </p>
        )}
        {gemini && x.confidence === "low" && facts && (
          <p className="mt-3 max-w-3xl rounded-md border border-accent/50 bg-accent-soft px-3 py-2 text-sm text-accent-ink">
            <span className="font-semibold">Low confidence:</span>{" "}
            {facts.confidence_reasons.join("; ")}
          </p>
        )}
      </header>

      <FigureStrip
        figures={[
          {
            value: num(x.crashes_since_2022),
            label: "Crashes",
            note: `January 2022 to ${monthYear(periodEnd)} (dataGNV)`,
          },
          {
            value: x.crash_rate_vs_similar ? `${x.crash_rate_vs_similar.toFixed(1)}×` : "n/a",
            label: "Crash rate vs. similar corners",
            note: facts?.crash_rate
              ? `${facts.crash_rate.per_million_entering_vehicles} vs. ${facts.crash_rate.similar_corners_median} per million entering vehicles`
              : "needs traffic volume data",
          },
          {
            value: x.predicted != null ? num(Math.round(x.predicted)) : "n/a",
            label: "Predicted for a similar corner",
            note: "crashes since 2022, same traffic, signal and legs",
          },
          {
            value: x.excess_per_year != null ? num(Math.round(x.excess_per_year)) : "n/a",
            label: "Excess crashes a year",
            note: "above what similar corners have",
            emphasis: x.excess_per_year != null && x.excess_per_year >= 1,
          },
        ]}
      />

      {gemini && (
        <section className="grid gap-x-10 gap-y-6 md:grid-cols-2 print:break-inside-avoid">
          <div className="rise rounded-md border border-line bg-surface p-6" style={{ "--i": 4 } as React.CSSProperties}>
            <p className="text-sm font-semibold text-accent-ink">Recommended fix</p>
            {fix ? (
              <>
                <h2 className="mt-1 text-3xl leading-tight font-extrabold tracking-tight">{fix.name}</h2>
                {fixCost && <p className="text-sm opacity-60">Cost: {fixCost}</p>}
                <ul className="mt-3 space-y-1 text-sm">
                  {fix.effects.map((e) => (
                    <li key={e.measure}>
                      <span className="rounded bg-accent-soft px-1.5 py-0.5 font-semibold text-accent-ink">
                        FHWA: {e.value}
                      </span>{" "}
                      {e.measure}
                    </li>
                  ))}
                </ul>
                {text?.recommended_fix && (
                  <p className="mt-3 text-sm opacity-80">{text.recommended_fix.why}</p>
                )}
                {fix.note && <p className="mt-2 text-xs opacity-60">{fix.note}</p>}
                {fix.url && (
                  <a
                    href={fix.url}
                    target="_blank"
                    rel="noreferrer"
                    className="road-link mt-3 inline-block text-sm font-semibold print:hidden"
                  >
                    Read the FHWA countermeasure guide
                  </a>
                )}
              </>
            ) : (
              <p className="mt-1">Mixed pattern: no single fixable cause stands out.</p>
            )}
          </div>

          {text?.audit_text && (
            <div className="rise md:py-6" style={{ "--i": 5 } as React.CSSProperties}>
              <h2 className="text-xl font-extrabold tracking-tight">Audit summary</h2>
              <p className="mt-2 max-w-[65ch] text-sm leading-relaxed">{text.audit_text}</p>
              <p className="mt-3 text-xs text-muted">Written by Gemini from the figures on this page.</p>
            </div>
          )}
        </section>
      )}

      {gemini && facts?.gainesville_precedent && (
        <section style={{ "--i": 6 } as React.CSSProperties} className="rise grid gap-x-8 gap-y-2 border-l-2 border-good-ink py-1 pl-5 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] print:break-inside-avoid">
          <div>
            <p className="text-sm font-semibold text-good-ink">Local proof</p>
            <h2 className="mt-1 text-xl font-extrabold tracking-tight">
              {titleCase(facts.gainesville_precedent.intersection)}
            </h2>
            <p className="mt-2 text-sm font-semibold text-good-ink">
              {facts.gainesville_precedent.effect}
            </p>
          </div>
          <p className="self-center text-sm opacity-80">{facts.gainesville_precedent.change}</p>
        </section>
      )}

      <section className="!mt-10">
        <h2 className="mb-3 text-xl font-extrabold tracking-tight">Imagery and road design</h2>
        <div className="print:hidden">
          <CaseImagery
            apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY}
            lat={x.lat}
            lon={x.lon}
            name={name}
          />
        </div>
        <div className="mt-4">
          <FeatureChecklist x={x} />
        </div>
      </section>

      {profile && (
        <section className="!mt-10 grid gap-8 md:grid-cols-2 print:break-inside-avoid">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Crashes by year</h2>
            <CrashesByYear byYear={profile.by_year} periodEnd={periodEnd} />
          </div>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight">Crashes by hour of day</h2>
            <CrashesByHour byHour={profile.by_hour} />
          </div>
          <p className="text-sm opacity-70 md:col-span-2">
            Since 2022: {num(x.pedestrian_crashes ?? 0)} involved a pedestrian,{" "}
            {num(x.bicycle_crashes ?? 0)} a bicycle
            {profile.fatal_crashes > 0 &&
              `, ${profile.fatal_crashes} were fatal`}
            .
          </p>
        </section>
      )}

      {distinctive.length > 0 && (
        <section className="!mt-10 print:break-inside-avoid">
          <h2 className="text-xl font-extrabold tracking-tight">Crash types above similar corners</h2>
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
          {text?.factor_explanations && text.factor_explanations.length > 0 && (
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


      <footer className="border-t border-line pt-3 text-xs opacity-60">
        Crashes since 2022: dataGNV. Crash types: FDOT 2015-2018. Fixes: FHWA
        Proven Safety Countermeasures. Text written by Gemini from computed
        facts only.
      </footer>
    </article>
  );
}
