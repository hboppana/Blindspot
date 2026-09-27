// Response types for the StreetSmart API (docs/API.md, api/main.py).
// scripts/make-mocks.mjs builds mock responses in the same shapes.

export type Confidence = "ok" | "low";
export type YesNo = "yes" | "no" | null; // null: unknown

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
    period: string; // "2022-01-01 to 2026-07-23"
    intersections_investigated: number;
    with_road_design_from_imagery: number;
    with_repeat_crashes: number;
    above_predicted_for_similar_corners: number;
    with_clear_fixable_pattern: number;
    crashes_citywide_since_2022: number;
    crashes_at_intersections_since_2022: number;
    share_of_crashes_at_intersections_pct: number;
    fix_list_crashes_per_year: number;
    fix_list_excess_crashes_per_year: number;
    worst_intersection: string;
    worst_crash_rate_times_similar_corners: number;
  };
  definitions: Record<string, string>;
  audit_report: { text: string; problems?: string[] | null; model?: string };
}

// GET /city/trend
export interface TrendMonth {
  month: string; // "YYYY-MM"
  crashes: number;
  pedestrian_crashes: number;
  bicycle_crashes: number;
  fatal_crashes: number;
  fatalities: number;
  at_intersection_crashes: number;
}

// GET /fix-list
export interface FixListItem {
  id: string;
  name: string;
  rank: number;
  recommended_fix: string;
  crashes_per_year: number;
  excess_crashes_per_year: number;
  lat: number;
  lon: number;
  main_factor: Factor | null;
  has_gemini_description: boolean;
}

// GET /intersections
export interface IntersectionListItem {
  id: string;
  name: string;
  lat: number;
  lon: number;
  crashes_since_2022: number;
  excess_per_year: number | null;
  screening_rank: number | null; // null: not screened
  main_factor: Factor | null;
  confidence: Confidence | null;
  has_gemini_description: boolean;
  recommended_fix_name: string | null;
  pedestrian_crashes: number | null;
  bicycle_crashes: number | null;
  in_fix_list: boolean;
}

// GET /intersections/{id}
export interface IntersectionDetail extends IntersectionListItem {
  raw_name: string;
  crashes_all_years: number;
  fdot_crashes: number;
  observed: number | null;
  predicted: number | null;
  verdict: "main" | "leading" | "mixed" | null;
  crash_rate_vs_similar: number | null;
  recommended_fix_id: string | null;
  traffic_signal: YesNo;
  crosswalk: YesNo;
  left_turn_lane: YesNo;
  median: YesNo;
  speed_limit: number | null;
  fdot_lanes_max: number | null;
  daily_traffic_max: number | null;
  has_imagery_labels: boolean;
  osm_matched: boolean;
  imagery_from: string | null; // "YYYY-MM"
  imagery_to: string | null;
  fix_list_rank: number | null;
  case_file: CaseFile | null; // null for 594 intersections
  countermeasures: Countermeasure[]; // best first
}

export interface CaseFile {
  source: string; // "gemini-..." or "template"
  prompt_version: number | null;
  case_file: CaseFileText;
  facts: CaseFacts | null;
  causes: unknown;
  recommendations: unknown;
  crash_profile: CrashProfile | null;
  fdot_profile: unknown;
}

export interface CaseFileText {
  verdict: string;
  factor_explanations?: { factor: string; explanation: string }[];
  recommended_fix?: { countermeasure_id: string; why: string } | null;
  audit_text?: string;
}

// dataGNV crashes since 2022
export interface CrashProfile {
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
  url: string | null;
  effects: { value: string; measure: string }[];
  addresses: string[];
  applies_when: unknown;
  note: string | null;
}

export interface DistinctiveCrashType {
  type: string;
  period?: string;
  crashes: number;
  expected_at_similar_corners: number;
  imagery_shows: string[];
  road_records: string[];
}

// The computed facts a case file's text was written from.
export interface CaseFacts {
  crashes_since_2022: number;
  busiest_hours: string[];
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
  distinctive_crash_types: DistinctiveCrashType[];
  confidence: Confidence;
  confidence_reasons: string[];
  countermeasures: {
    id: string;
    name: string;
    cost: "low" | "medium" | "high";
    fhwa_effects: string[];
  }[];
  gainesville_precedent: {
    intersection: string;
    change: string;
    effect: string;
  } | null;
  imagery_dates: string | null;
}

// GET /backtest
export interface Backtest {
  top: number;
  flagged_in_top_10: number;
  flagged_in_top_20: number;
  flagged_in_top_50: number;
  rows: {
    id: string;
    name: string;
    rank_now: number;
    crashes_now: number;
    rank_before_2022: number | null;
  }[];
}

// GET /watch-list
// Intersections whose crashes are climbing, worst climb first.
export interface WatchList {
  through: string; // "2026-07-23": the last year is partial
  rows: {
    id: string;
    name: string;
    rank: number;
    by_year: { year: number; crashes: number; partial: boolean; pace: number }[];
    per_year_before: number; // 2022-23 average
    per_year_now: number; // last full year and this year's pace, averaged
  }[];
}

// GET /fix-plan/notes: the Fix Plan's text, written by Snowflake Cortex from the
// page's own figures (scripts/cortex_fix_plan.py). Absent until that has run.
export interface FixPlanNotes {
  source: string; // "snowflake-cortex-<model>"
  generated_at: string;
  plan: { summary: string } | null;
  // Keyed by the recommended fix's name, or by intersection id for a review case.
  letters: Record<string, { subject: string; body: string }>;
}
