-- StreetSmart database schema (Tiger Data / TimescaleDB).
--
-- Dropped and recreated on every load: scripts/load_db.py runs this file,
-- then reloads everything from data/derived/ and data/reference/.

DROP MATERIALIZED VIEW IF EXISTS crashes_monthly CASCADE;
DROP TABLE IF EXISTS crashes, countermeasures, city_summary, case_files, intersections CASCADE;

-- One row per intersection: what the map, ranked list and filters need.
CREATE TABLE intersections (
    id                      text PRIMARY KEY,   -- slug, e.g. sw-34th-st-sw-archer-rd
    name                    text NOT NULL,      -- display name
    raw_name                text NOT NULL,      -- normalized pair from build_hotspots.py
    lat                     double precision NOT NULL,
    lon                     double precision NOT NULL,

    crashes_since_2022      integer NOT NULL,
    crashes_all_years       integer NOT NULL,
    fdot_crashes            integer NOT NULL,   -- FDOT 2015 to 2019
    pedestrian_crashes      integer,            -- since 2022; null without a crash profile
    bicycle_crashes         integer,

    -- True only for case files Gemini wrote; template ones ("too few crashes") don't count.
    has_gemini_description  boolean NOT NULL,

    -- causes.json: network screening and contributing factors
    screening_rank          integer,
    observed                double precision,
    predicted               double precision,
    excess_per_year         double precision,
    main_factor             text,
    verdict                 text,               -- main / leading / mixed
    confidence              text,               -- ok / low
    crash_rate_vs_similar   double precision,

    -- recommendations.json: first recommended countermeasure
    recommended_fix_id      text,
    recommended_fix_name    text,

    -- road_features.csv: yes / no / null (unknown)
    traffic_signal          text,
    crosswalk               text,
    left_turn_lane          text,
    median                  text,
    speed_limit             double precision,
    fdot_lanes_max          double precision,
    daily_traffic_max       double precision,
    has_imagery_labels      boolean NOT NULL,   -- Gemini read the imagery (road_features.csv has_gemini)
    osm_matched             boolean NOT NULL,
    imagery_from            text,               -- YYYY-MM
    imagery_to              text,

    in_fix_list             boolean NOT NULL,
    fix_list_rank           integer
);

CREATE INDEX ON intersections (screening_rank);
CREATE INDEX ON intersections (main_factor);
CREATE INDEX ON intersections (crashes_since_2022);

-- Case file content, passed through to the API as JSON.
CREATE TABLE case_files (
    intersection_id  text PRIMARY KEY REFERENCES intersections (id) ON DELETE CASCADE,
    source           text NOT NULL,   -- gemini-3.7-flash or template
    prompt_version   integer,
    case_file        jsonb NOT NULL,  -- verdict, factor_explanations, recommended_fix, audit_text
    facts            jsonb,           -- the computed facts the text was written from
    causes           jsonb,           -- causes.json entry
    recommendations  jsonb,           -- recommendations.json entry
    crash_profile    jsonb,           -- hotspots.json "crashes": by year, hour, weekday, shares
    fdot_profile     jsonb            -- hotspots.json "causes_fdot"
);

CREATE TABLE city_summary (
    id            integer PRIMARY KEY CHECK (id = 1),
    summary       jsonb NOT NULL,
    definitions   jsonb NOT NULL,
    fix_list      jsonb NOT NULL,
    audit_report  jsonb NOT NULL
);

CREATE TABLE countermeasures (
    id            text PRIMARY KEY,
    name          text NOT NULL,
    url           text,
    effects       jsonb NOT NULL,
    addresses     text[] NOT NULL,
    applies_when  jsonb,
    note          text
);

-- Every dataGNV crash since 2015, not linked to intersections: citywide trends only.
CREATE TABLE crashes (
    crash_time           timestamptz NOT NULL,
    case_number          text,
    street               text,
    cross_street         text,
    latitude             double precision,
    longitude            double precision,
    at_intersection      boolean,
    vehicles             integer,
    pedestrians          integer,
    bicycles             integer,
    mopeds               integer,
    motorcycles          integer,
    fatalities           integer,
    involves_pedestrian  boolean,
    involves_bicycle     boolean
);

-- 1-year chunks: ~5k crashes a year, so the 7-day default would make ~600 tiny chunks.
SELECT create_hypertable('crashes', by_range('crash_time', INTERVAL '1 year'));

CREATE MATERIALIZED VIEW crashes_monthly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 month', crash_time, 'America/New_York') AS month,
    count(*)                                          AS crashes,
    count(*) FILTER (WHERE involves_pedestrian)       AS pedestrian_crashes,
    count(*) FILTER (WHERE involves_bicycle)          AS bicycle_crashes,
    count(*) FILTER (WHERE fatalities > 0)            AS fatal_crashes,
    coalesce(sum(fatalities), 0)                      AS fatalities,
    count(*) FILTER (WHERE at_intersection)           AS at_intersection_crashes
FROM crashes
GROUP BY month
WITH NO DATA;
