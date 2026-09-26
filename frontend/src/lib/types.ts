// API contract between the frontend and the backend (docs/PLAN.md, workstream 7).
// Shapes follow data/derived; scripts/make-mocks.mjs builds mocks to match.

export type Confidence = "ok" | "low";

export type Factor =
  | "rear_end"
  | "angle"
  | "left_turn"
  | "right_turn"
  | "sideswipe"
  | "pedestrian"
  | "bicycle"
  | "other";

// GET /city/summary
export interface CitySummary {
  summary: {
    period: string;
    intersections_investigated: number;
    with_road_design_from_imagery: number;
    with_repeat_crashes: number;
    above_predicted_for_similar_corners: number;
    with_clear_fixable_pattern: number;
    crashes_citywide_since_2022: number;
    crashes_at_intersections_since_2022: number;
    fix_list_crashes_per_year: number;
    fix_list_excess_crashes_per_year: number;
    worst_intersection: string;
    worst_crash_rate_times_similar_corners: number;
    share_of_crashes_at_intersections_pct: number;
  };
  definitions: Record<string, string>;
  fix_list: FixListItem[];
  audit_report: { text: string };
}

// GET /fix-list
export interface FixListItem {
  id: string;
  name: string;
  rank: number;
  crashes_per_year: number;
  excess_crashes_per_year: number;
  recommended_fix: string;
}

// GET /intersections
export interface IntersectionListItem {
  id: string;
  name: string;
  rank: number;
  lat: number;
  lon: number;
  crashes_since_2022: number;
  pedestrian_or_bike_share: number;
  main_factor: Factor | null; // null: no clear factor
  confidence: Confidence | null; // null: no FDOT cause data
}

// GET /intersections/{id}
export interface IntersectionDetail {
  id: string;
  name: string;
  rank: number;
  lat: number;
  lon: number;
  crashes: CrashCounts;
  facts: CaseFacts | null;
  case_file: CaseFileText | null; // null for template (quieter) intersections
  source: string | null;
}

export interface CrashCounts {
  crashes: number;
  by_year: Record<string, number>;
  by_hour: number[]; // 24 entries, 0:00 to 23:00
  by_weekday: Record<string, number>;
  pedestrian_share: number;
  bicycle_share: number;
  fatal_crashes: number;
  fatalities: number;
}

export interface Countermeasure {
  id: string;
  name: string;
  cost: "low" | "medium" | "high";
  fhwa_effects: string[];
}

export interface DistinctiveCrashType {
  type: string;
  period?: string;
  crashes: number;
  expected_at_similar_corners: number;
  imagery_shows: string[];
  road_records: string[];
}

export interface CaseFacts {
  intersection: string;
  crashes_since_2022: number;
  crashes_by_year: Record<string, number>;
  pedestrian_crash_pct: number;
  bicycle_crash_pct: number;
  fatal_crashes: number;
  busiest_hours: string[];
  traffic_signal: string;
  screening: {
    citywide_rank: number;
    observed_crashes: number;
    predicted_for_similar_corner: number;
    excess_crashes_per_year: number;
  } | null;
  crash_rate: {
    per_million_entering_vehicles: number;
    similar_corners_median: number;
    times_similar_corners: number;
  } | null;
  crash_types_2015_2018: {
    fdot_crashes: number;
    pattern: string;
    top_types: { type: string; pct: number; similar_corners_pct: number }[];
  } | null;
  distinctive_crash_types: DistinctiveCrashType[];
  dark_crash_pct: number;
  confidence: Confidence;
  confidence_reasons: string[];
  countermeasures: Countermeasure[];
  gainesville_precedent: {
    intersection: string;
    change: string;
    effect: string;
  } | null;
  imagery_dates: string | null;
}

export interface CaseFileText {
  verdict: string;
  factor_explanations: { factor: string; explanation: string }[];
  recommended_fix: { countermeasure_id: string; why: string } | null;
  audit_text: string;
}
