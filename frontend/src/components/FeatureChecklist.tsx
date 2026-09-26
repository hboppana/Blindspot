import type { IntersectionDetail, YesNo } from "@/lib/types";
import { num } from "@/lib/format";

const yesNo = (v: YesNo) => (v === "yes" ? "Yes" : v === "no" ? "No" : "Unknown");

export function FeatureChecklist({ x }: { x: IntersectionDetail }) {
  const rows: [string, string][] = [
    ["Traffic signal", yesNo(x.traffic_signal)],
    ["Marked crosswalk", yesNo(x.crosswalk)],
    ["Left-turn lane", yesNo(x.left_turn_lane)],
    ["Median", yesNo(x.median)],
    ["Speed limit", x.speed_limit ? `${x.speed_limit} mph` : "Unknown"],
    ["Most lanes (FDOT)", x.fdot_lanes_max ? String(x.fdot_lanes_max) : "Unknown"],
    [
      "Daily traffic, busiest road",
      x.daily_traffic_max ? num(x.daily_traffic_max) : "Unknown",
    ],
  ];
  return (
    <div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="opacity-70">{label}</dt>
            <dd className={value === "Unknown" ? "opacity-50" : "font-medium"}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs opacity-60">
        {x.has_imagery_labels && x.imagery_from
          ? `Read by Gemini from imagery captured ${x.imagery_from} to ${x.imagery_to}; speed, lanes and traffic from FDOT road records.`
          : "No imagery labels for this corner; values from OpenStreetMap and FDOT road records."}
      </p>
    </div>
  );
}
