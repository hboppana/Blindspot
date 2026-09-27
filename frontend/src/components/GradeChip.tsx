import { type Grade, GRADES, UNGRADED, gradeInfo } from "@/lib/grade";
import { SIZE_BANDS } from "@/lib/dotSize";

// The letter always travels with its colour, so the grade never rests on colour alone.
const DIMS = {
  sm: "size-5 rounded-md text-[11px]",
  md: "size-7 rounded-md text-sm",
  lg: "size-10 rounded-md text-xl",
  hero: "size-16 rounded-xl text-4xl",
  xl: "size-24 rounded-2xl text-6xl sm:size-28 sm:text-7xl",
};

export function GradeChip({ grade, size = "md" }: { grade: Grade | null; size?: keyof typeof DIMS }) {
  const dims = DIMS[size];
  const g = grade ? gradeInfo(grade) : null;
  return (
    <span
      className={`inline-grid shrink-0 place-items-center font-extrabold ${dims}`}
      style={{ background: g?.color ?? UNGRADED.color, color: g?.ink ?? "#1f2226" }}
      aria-label={grade ? `Grade ${grade}` : "Not graded"}
    >
      {grade ?? "-"}
    </span>
  );
}

export function GradeLegend({ className = "" }: { className?: string }) {
  return (
    <div className={className}>
      <p className="font-bold">Intersection grade</p>
      <p className="mb-2 text-muted">Crashes a year compared with similar intersections</p>
      <ul className="space-y-1">
        {GRADES.map((g) => (
          <li key={g.grade} className="flex items-center gap-2">
            <GradeChip grade={g.grade} size="sm" />
            {g.range}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <GradeChip grade={null} size="sm" />
          Not graded
        </li>
      </ul>
      <p className="mt-3 font-bold">Crashes since 2022</p>
      {/* Drawn at the map's exact dot sizes. */}
      <ul className="mt-1.5 flex items-end justify-between">
        {[...SIZE_BANDS].reverse().map((b) => (
          <li key={b.label} className="flex flex-col items-center gap-1">
            <span
              className="rounded-full border border-white bg-muted"
              style={{ width: b.r * 2, height: b.r * 2 }}
            />
            <span className="text-muted">{b.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex items-center gap-2 text-muted">
        <span className="inline-block size-3 rounded-full border-2 border-foreground" />
        Ringed: on the Red List
      </p>
    </div>
  );
}
