"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUp, CaretRight, Snowflake, Sparkle, X } from "@phosphor-icons/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { AskAnswer } from "@/lib/types";

// Ask StreetSmart: a question box in the corner of every page. Snowflake Cortex
// Analyst reads the question, writes the SQL, and /api/ask runs it on the
// crash data; the answer comes back as one big number, a ranked list or a
// small table, whichever reads clearest.

const STARTERS = [
  "Which intersections had the most bike crashes since 2022?",
  "How many crashes were there near UF last year?",
  "Is SW Archer Rd getting worse year by year?",
  "What hour of the day has the most crashes?",
  "Which F-grade intersections have no traffic signal?",
];

type Turn =
  | { id: number; question: string; state: "loading" }
  | { id: number; question: string; state: "done"; answer: AskAnswer }
  | { id: number; question: string; state: "error"; error: string };

export function AskStreetSmart() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const busy = turns.some((t) => t.state === "loading");
  // The map keeps its legend bottom right, so there the button sits top right.
  const onMap = pathname.startsWith("/map");

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const id = ++nextId.current;
    setDraft("");
    setTurns((t) => [...t, { id, question: q, state: "loading" }]);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const body = await res.json();
      setTurns((t) =>
        t.map((x) =>
          x.id !== id
            ? x
            : res.ok
              ? { id, question: q, state: "done", answer: body as AskAnswer }
              : { id, question: q, state: "error", error: body.error ?? "Something went wrong." },
        ),
      );
    } catch {
      setTurns((t) =>
        t.map((x) => (x.id === id ? { id, question: q, state: "error", error: "Couldn't reach StreetSmart." } : x)),
      );
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger
        className={`group fixed right-4 z-40 flex h-14 items-center gap-0 rounded-full bg-brand pr-4 pl-4 text-white shadow-[0_12px_32px_-8px_rgb(15_17_19/0.6)] ring-1 ring-white/15 transition-[gap,padding,transform] duration-300 ease-out hover:-translate-y-0.5 hover:gap-2.5 hover:pr-5 focus-visible:gap-2.5 focus-visible:pr-5 sm:right-6 print:hidden ${
          onMap ? "top-[116px] sm:top-[140px]" : "bottom-5 sm:bottom-6"
        }`}
        aria-label="Ask StreetSmart a question about Gainesville crashes"
      >
        <span className="grid size-7 place-items-center rounded-full bg-accent text-[#1f2226]">
          <Sparkle weight="fill" className="size-4" aria-hidden />
        </span>
        {/* The label slides out on hover, so the resting button stays small. */}
        <span className="max-w-0 overflow-hidden font-bold whitespace-nowrap transition-[max-width] duration-300 ease-out group-hover:max-w-40 group-focus-visible:max-w-40">
          Ask StreetSmart
        </span>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#0f1113]/40 sm:bg-transparent" />
        <DialogPrimitive.Content
          className="fixed inset-x-2 bottom-2 z-50 flex h-[min(82dvh,680px)] flex-col overflow-hidden rounded-3xl border border-line bg-background text-foreground shadow-[0_24px_64px_-12px_rgb(15_17_19/0.55)] outline-none data-[state=open]:animate-[dialog-in_200ms_cubic-bezier(0.16,1,0.3,1)] sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[440px]"
          aria-describedby={undefined}
        >
          {/* Header, on asphalt with the lane line, like the site's. */}
          <div className="bg-brand text-white">
            <div className="flex items-center gap-3 px-5 py-4">
              <span className="grid size-9 place-items-center rounded-full bg-accent text-[#1f2226]">
                <Sparkle weight="fill" className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="text-lg leading-tight font-extrabold">Ask StreetSmart</DialogPrimitive.Title>
                <p className="text-xs text-white/60">Questions about Gainesville crashes, answered from the data</p>
              </div>
              <DialogPrimitive.Close
                className="grid size-9 place-items-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X weight="bold" className="size-4" aria-hidden />
              </DialogPrimitive.Close>
            </div>
            <div className="lane-line" aria-hidden />
          </div>

          <div ref={scroller} className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5" aria-live="polite">
            {turns.length === 0 && (
              <div>
                <p className="text-sm text-muted">
                  Ask about any street, intersection, time or kind of crash in Gainesville. Try one of these:
                </p>
                <ul className="mt-3 flex flex-col gap-2">
                  {STARTERS.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onClick={() => ask(s)}
                        className="group flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-left text-sm font-semibold transition-colors hover:border-muted"
                      >
                        {s}
                        <CaretRight weight="bold" className="size-4 shrink-0 text-muted group-hover:text-foreground" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {turns.map((t) => (
              <div key={t.id} className="space-y-2.5">
                <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand px-3.5 py-2 text-sm font-semibold text-white">
                  {t.question}
                </p>
                {t.state === "loading" && <Thinking />}
                {t.state === "error" && (
                  <p className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm">{t.error}</p>
                )}
                {t.state === "done" && <AnswerCard answer={t.answer} onAsk={ask} onNavigate={() => setOpen(false)} />}
              </div>
            ))}
          </div>

          <form
            className="border-t border-line bg-surface p-3"
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
          >
            <div className="flex items-end gap-2 rounded-2xl border border-line bg-background p-1.5 pl-3.5 focus-within:border-muted">
              <label htmlFor="ask-input" className="sr-only">
                Your question
              </label>
              <textarea
                id="ask-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    ask(draft);
                  }
                }}
                rows={1}
                maxLength={300}
                placeholder="Ask about a street, corner or time of day"
                className="max-h-28 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-muted"
              />
              <button
                type="submit"
                disabled={!draft.trim() || busy}
                className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-[#1f2226] transition-colors hover:bg-[#ffd633] disabled:bg-brand-soft disabled:text-muted"
                aria-label="Ask"
              >
                <ArrowUp weight="bold" className="size-4" aria-hidden />
              </button>
            </div>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-muted">
              <Snowflake weight="bold" className="size-3.5 text-[#29b5e8]" aria-hidden />
              Answered by Snowflake Cortex Analyst from StreetSmart&apos;s data
            </p>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Thinking() {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3.5" aria-busy="true">
      <p className="text-sm text-muted">Reading the crash records…</p>
      <div className="mt-3 space-y-2">
        <div className="h-2.5 w-3/4 rounded-full bg-line/80 motion-safe:animate-pulse" />
        <div className="h-2.5 w-1/2 rounded-full bg-line/80 motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- answers

const HIDDEN = new Set(["REPORT_URL", "ID", "INTERSECTION_ID", "LAT", "LON", "LATITUDE", "LONGITUDE", "CRASH_ROW"]);
const NUMERIC = new Set(["FIXED", "REAL", "NUMBER", "FLOAT", "DECIMAL"]);

const label = (name: string) => {
  const s = name.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
};

function formatValue(v: string | null, type: string) {
  if (v === null) return "–";
  if (NUMERIC.has(type.toUpperCase())) {
    const n = Number(v);
    if (Number.isFinite(n)) return Number.isInteger(n) ? n.toLocaleString("en-US") : n.toLocaleString("en-US", { maximumFractionDigits: 1 });
  }
  if (type.toUpperCase() === "BOOLEAN") return v === "true" ? "Yes" : "No";
  return v;
}

function AnswerCard({
  answer,
  onAsk,
  onNavigate,
}: {
  answer: AskAnswer;
  onAsk: (q: string) => void;
  onNavigate: () => void;
}) {
  const { columns, rows } = answer;
  const shown = columns.map((c, i) => ({ ...c, i })).filter((c) => !HIDDEN.has(c.name.toUpperCase()));
  const urlCol = columns.findIndex((c) => c.name.toUpperCase() === "REPORT_URL");
  const numeric = shown.filter((c) => NUMERIC.has(c.type.toUpperCase()));
  const text = shown.filter((c) => !NUMERIC.has(c.type.toUpperCase()));
  const single = rows.length === 1 && shown.length === 1;
  const ranked = rows.length > 1 && rows.length <= 15 && text.length === 1 && numeric.length >= 1 && shown.length <= 3;

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      {answer.interpretation && (
        <p className="border-b border-line px-4 py-3 text-xs leading-relaxed text-muted">{answer.interpretation}</p>
      )}

      <div className="px-4 py-4">
        {!answer.sql && answer.suggestions.length === 0 && <p className="text-sm">No answer for that one. Try asking it another way.</p>}

        {answer.sql && rows.length === 0 && <p className="text-sm">Nothing in the data matches that.</p>}

        {single && (
          <div>
            <p className="text-4xl leading-none font-extrabold tracking-tight tabular-nums">
              {formatValue(rows[0][shown[0].i], shown[0].type)}
            </p>
            <p className="mt-1.5 text-sm text-muted">{label(shown[0].name)}</p>
          </div>
        )}

        {ranked && <RankedList answer={answer} name={text[0]} value={numeric[0]} extra={numeric[1]} urlCol={urlCol} onNavigate={onNavigate} />}

        {!single && !ranked && rows.length > 0 && (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs text-muted">
                  {shown.map((c) => (
                    <th key={c.name} className="px-4 py-2 font-semibold whitespace-nowrap">
                      {label(c.name)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 25).map((r, k) => (
                  <tr key={k} className="border-b border-line/60 last:border-0">
                    {shown.map((c, j) => (
                      <td
                        key={c.name}
                        className={`px-4 py-2 ${NUMERIC.has(c.type.toUpperCase()) ? "text-right tabular-nums" : ""}`}
                      >
                        {j === 0 && urlCol >= 0 && r[urlCol] ? (
                          <Link href={r[urlCol]!} onClick={onNavigate} className="font-semibold hover:underline">
                            {formatValue(r[c.i], c.type)}
                          </Link>
                        ) : (
                          formatValue(r[c.i], c.type)
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {(rows.length > 25 || answer.truncated) && (
              <p className="px-4 pt-2 text-xs text-muted">Showing the first 25 rows.</p>
            )}
          </div>
        )}

        {answer.suggestions.length > 0 && (
          <div className={answer.sql ? "mt-4" : ""}>
            <p className="text-xs font-bold text-muted">{answer.sql ? "You could also ask" : "Did you mean"}</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {answer.suggestions.slice(0, 4).map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => onAsk(s)}
                    className="w-full rounded-lg border border-line px-3 py-2 text-left text-sm font-semibold transition-colors hover:border-muted"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {answer.sql && (
        <details className="group border-t border-line">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-muted hover:text-foreground">
            <CaretRight weight="bold" className="size-3 transition-transform group-open:rotate-90" aria-hidden />
            Show the SQL
          </summary>
          <pre className="max-h-48 overflow-auto bg-brand-soft px-4 py-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">
            {answer.sql}
          </pre>
        </details>
      )}
    </div>
  );
}

// A label column and a number: bars in the order Cortex returned them.
function RankedList({
  answer,
  name,
  value,
  extra,
  urlCol,
  onNavigate,
}: {
  answer: AskAnswer;
  name: { name: string; i: number; type: string };
  value: { name: string; i: number; type: string };
  extra?: { name: string; i: number; type: string };
  urlCol: number;
  onNavigate: () => void;
}) {
  const nums = answer.rows.map((r) => Number(r[value.i] ?? 0));
  const max = Math.max(...nums.map(Math.abs), 1);
  return (
    <div>
      <p className="mb-3 text-xs font-bold text-muted">{label(value.name)}</p>
      <ol className="space-y-3">
        {answer.rows.map((r, k) => {
          const title = formatValue(r[name.i], name.type);
          const url = urlCol >= 0 ? r[urlCol] : null;
          return (
            <li key={k}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                {url ? (
                  <Link href={url} onClick={onNavigate} className="min-w-0 truncate font-semibold hover:underline">
                    {title}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate font-semibold">{title}</span>
                )}
                <span className="shrink-0 font-extrabold tabular-nums">
                  {formatValue(r[value.i], value.type)}
                  {extra && (
                    <span className="ml-1.5 text-xs font-semibold text-muted">
                      {formatValue(r[extra.i], extra.type)} {label(extra.name).toLowerCase()}
                    </span>
                  )}
                </span>
              </div>
              <div
                className="mt-1 h-2 origin-left rounded-full bg-[var(--series-1)] motion-safe:animate-[grow-x_600ms_cubic-bezier(0.16,1,0.3,1)_both]"
                style={{ width: `${(Math.abs(nums[k]) / max) * 100}%`, animationDelay: `${k * 40}ms` }}
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}
