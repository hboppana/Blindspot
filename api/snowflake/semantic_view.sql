-- Ask StreetSmart: what Cortex Analyst answers questions from.
-- Run by scripts/snowflake_load.py after it loads the tables.

CREATE OR REPLACE SEMANTIC VIEW STREETSMART.DATA.ASK_STREETSMART
  TABLES (
    crashes AS STREETSMART.DATA.CRASHES
      PRIMARY KEY (CRASH_ROW)
      WITH SYNONYMS ('wrecks', 'accidents', 'collisions', 'crash reports')
      COMMENT = 'Every crash reported in the City of Gainesville, Florida (dataGNV), January 2015 to July 23 2026. One row per crash. 2026 is a partial year.',
    intersections AS STREETSMART.DATA.INTERSECTIONS
      PRIMARY KEY (ID)
      WITH SYNONYMS ('corners', 'junctions', 'crossroads')
      COMMENT = 'Every Gainesville intersection with a crash record, with StreetSmart''s figures: crashes since 2022, the grade, the Red List and Watch List, the recommended fix and the road''s features.',
    places AS STREETSMART.DATA.PLACES
      PRIMARY KEY (NAME)
      WITH SYNONYMS ('landmarks', 'locations')
      COMMENT = 'Well-known Gainesville places, as approximate centre points, for questions about crashes near somewhere.'
  )
  RELATIONSHIPS (
    crash_at_intersection AS crashes (INTERSECTION_ID) REFERENCES intersections
  )
  FACTS (
    crashes.crash_id AS CRASH_ROW
      COMMENT = 'One per crash; count it to count crashes.',
    crashes.fatality_count AS FATALITIES
      COMMENT = 'People killed in the crash.',
    crashes.pedestrian_flag AS IFF(INVOLVES_PEDESTRIAN, 1, 0),
    crashes.bicycle_flag AS IFF(INVOLVES_BICYCLE, 1, 0),
    crashes.fatal_flag AS IFF(IS_FATAL, 1, 0)
  )
  DIMENSIONS (
    crashes.crash_date AS CRASH_DATE
      WITH SYNONYMS ('date', 'day')
      COMMENT = 'The date of the crash.',
    crashes.crash_time AS CRASH_AT
      COMMENT = 'Local date and time of the crash.',
    crashes.crash_year AS CRASH_YEAR
      WITH SYNONYMS ('year')
      COMMENT = 'Year of the crash. 2026 runs only to July 23.',
    crashes.crash_month AS CRASH_MONTH
      COMMENT = 'Month of the crash, 1 to 12.',
    crashes.crash_hour AS CRASH_HOUR
      WITH SYNONYMS ('time of day', 'hour')
      COMMENT = 'Hour of the day, 0 (midnight) to 23 (11 PM).',
    crashes.day_of_week AS DAY_OF_WEEK
      WITH SYNONYMS ('weekday')
      COMMENT = 'Day of the week, spelled out: Monday to Sunday.',
    crashes.street AS STREET
      WITH SYNONYMS ('road')
      COMMENT = 'The street the crash was reported on, in capitals, e.g. SW ARCHER RD, W UNIVERSITY AVE, NW 13TH ST.',
    crashes.cross_street AS CROSS_STREET
      COMMENT = 'The nearest cross street, in capitals.',
    crashes.at_intersection AS AT_INTERSECTION
      COMMENT = 'True if the crash was coded as at an intersection.',
    crashes.involves_pedestrian AS INVOLVES_PEDESTRIAN
      WITH SYNONYMS ('pedestrian crash', 'walker', 'person walking')
      COMMENT = 'True if someone on foot was involved.',
    crashes.involves_bicycle AS INVOLVES_BICYCLE
      WITH SYNONYMS ('bike crash', 'cyclist', 'bicyclist')
      COMMENT = 'True if someone on a bicycle was involved.',
    crashes.is_fatal AS IS_FATAL
      WITH SYNONYMS ('deadly', 'fatal crash')
      COMMENT = 'True if anyone was killed.',
    crashes.crash_intersection_id AS INTERSECTION_ID
      COMMENT = 'The intersection the crash belongs to, or null if it was not at or near one.',
    crashes.crash_nearby_places AS NEARBY_PLACES
      WITH SYNONYMS ('near', 'around', 'close to')
      COMMENT = 'Landmarks within 1 km of the crash, separated by "; ", e.g. University of Florida; Ben Hill Griffin Stadium. Null if none.',
    crashes.crash_latitude AS LATITUDE,
    crashes.crash_longitude AS LONGITUDE,

    intersections.intersection_id AS ID
      COMMENT = 'The intersection''s id, used in its report link.',
    intersections.intersection_name AS NAME
      WITH SYNONYMS ('intersection', 'corner name')
      COMMENT = 'The intersection''s name, e.g. SW 34th St & SW Archer Rd.',
    intersections.report_url AS REPORT_URL
      COMMENT = 'Link to the intersection''s StreetSmart report.',
    intersections.latitude AS LAT,
    intersections.longitude AS LON,
    intersections.intersection_nearby_places AS NEARBY_PLACES
      WITH SYNONYMS ('near', 'around', 'close to')
      COMMENT = 'Landmarks within 1 km of the intersection, separated by "; ". Null if none.',
    intersections.crashes_since_2022 AS CRASHES_SINCE_2022
      COMMENT = 'Crashes at the intersection from January 2022 to July 2026.',
    intersections.crashes_per_year AS CRASHES_PER_YEAR
      COMMENT = 'Crashes a year at the intersection, averaged since 2022.',
    intersections.similar_crashes_per_year AS SIMILAR_CRASHES_PER_YEAR
      WITH SYNONYMS ('expected crashes', 'predicted crashes')
      COMMENT = 'Crashes a year an intersection with the same traffic and layout would be expected to have.',
    intersections.extra_crashes_per_year AS EXTRA_CRASHES_PER_YEAR
      WITH SYNONYMS ('excess crashes', 'crashes above similar')
      COMMENT = 'Crashes a year above what a similar intersection sees. Negative means safer than similar ones.',
    intersections.grade AS GRADE
      WITH SYNONYMS ('safety grade', 'letter grade')
      COMMENT = 'A to F from crashes a year above similar intersections: F 8 or more, D 4 to 8, C 1 to 4, B 0 to 1, A fewer than similar. Null when too few crashes to compare.',
    intersections.main_crash_type AS MAIN_CRASH_TYPE
      COMMENT = 'The most common kind of crash: rear-end, angle, left-turn, right-turn, sideswipe, pedestrian, bicycle or other.',
    intersections.pedestrian_crashes AS PEDESTRIAN_CRASHES
      COMMENT = 'Crashes since 2022 involving someone on foot.',
    intersections.bicycle_crashes AS BICYCLE_CRASHES
      COMMENT = 'Crashes since 2022 involving someone on a bike.',
    intersections.red_list_rank AS RED_LIST_RANK
      WITH SYNONYMS ('red list', 'most dangerous', 'worst intersections', 'fix list', 'wreck list')
      COMMENT = 'Rank 1 to 10 on the Red List, Gainesville''s 10 most dangerous intersections; null if not on it.',
    intersections.watch_list_rank AS WATCH_LIST_RANK
      WITH SYNONYMS ('watch list', 'getting worse', 'rising')
      COMMENT = 'Rank 1 to 10 on the Watch List of intersections where crashes are climbing; null if not on it.',
    intersections.crashes_per_year_2022_23 AS CRASHES_PER_YEAR_2022_23
      COMMENT = 'For Watch List intersections: crashes a year in 2022 and 2023.',
    intersections.crashes_per_year_recent AS CRASHES_PER_YEAR_RECENT
      COMMENT = 'For Watch List intersections: crashes a year lately (2025 and this year''s pace).',
    intersections.recommended_fix AS RECOMMENDED_FIX
      WITH SYNONYMS ('fix', 'countermeasure', 'solution')
      COMMENT = 'The federally proven safety fix that fits the intersection''s crash pattern, if one does.',
    intersections.traffic_signal AS TRAFFIC_SIGNAL
      COMMENT = 'True if the intersection has a traffic signal.',
    intersections.crosswalk AS CROSSWALK
      COMMENT = 'True if it has a marked crosswalk.',
    intersections.left_turn_lane AS LEFT_TURN_LANE,
    intersections.median AS MEDIAN,
    intersections.speed_limit_mph AS SPEED_LIMIT_MPH
      COMMENT = 'Speed limit on the busiest road, in mph.',
    intersections.lanes AS LANES
      COMMENT = 'Most lanes on the widest road.',
    intersections.cars_per_day AS CARS_PER_DAY
      WITH SYNONYMS ('traffic', 'daily traffic', 'AADT')
      COMMENT = 'Cars a day on the busiest road.',

    places.place_name AS NAME
      WITH SYNONYMS ('place', 'landmark')
      COMMENT = 'e.g. University of Florida, UF Health Shands Hospital, Downtown Gainesville, Butler Plaza, The Oaks Mall.',
    places.also_called AS ALSO_CALLED
      COMMENT = 'Other names people use for the place, e.g. UF, the Swamp, the mall.',
    places.place_latitude AS LAT,
    places.place_longitude AS LON
  )
  METRICS (
    crashes.crash_count AS COUNT(crashes.crash_id)
      WITH SYNONYMS ('number of crashes', 'how many crashes', 'total crashes')
      COMMENT = 'Number of crashes.',
    crashes.pedestrian_crash_count AS SUM(crashes.pedestrian_flag)
      WITH SYNONYMS ('pedestrian crashes')
      COMMENT = 'Crashes involving someone on foot.',
    crashes.bicycle_crash_count AS SUM(crashes.bicycle_flag)
      WITH SYNONYMS ('bike crashes', 'bicycle crashes', 'cyclist crashes')
      COMMENT = 'Crashes involving someone on a bike.',
    crashes.fatal_crash_count AS SUM(crashes.fatal_flag)
      WITH SYNONYMS ('fatal crashes', 'deadly crashes')
      COMMENT = 'Crashes in which someone was killed.',
    crashes.people_killed AS SUM(crashes.fatality_count)
      WITH SYNONYMS ('deaths', 'fatalities', 'people killed')
      COMMENT = 'People killed.'
  )
  COMMENT = 'StreetSmart: crashes and intersections in Gainesville, Florida'
  AI_SQL_GENERATION 'Answer about Gainesville, Florida crash data. Street names in CRASHES are upper case, so match them with ILIKE and wildcards, e.g. STREET ILIKE ''%ARCHER%''; intersection names in INTERSECTIONS are title case, also match with ILIKE. For "near" or "around" a place, filter NEARBY_PLACES with ILIKE on the place''s official name (University of Florida, UF Health Shands Hospital, Ben Hill Griffin Stadium, Downtown Gainesville, Depot Park, Butler Plaza, The Oaks Mall, Santa Fe College, Gainesville Regional Airport, Midtown); map nicknames such as UF, Shands, the Swamp or the mall to those names using PLACES.ALSO_CALLED. "Last year" means 2025. "Since 2022" or "recent" means CRASH_YEAR >= 2022. 2026 is a partial year (to July 23): say so when comparing years. When listing intersections, include NAME and REPORT_URL and order by the figure asked about, limit 10 unless asked otherwise. Round averages to one decimal. Never invent columns or values that are not in the data, and never answer with constant text or placeholder columns: if the data cannot answer the question, say so and suggest questions it can answer. The data has no weather, road surface, lighting, injury severity, vehicle type, driver or cause fields: never suggest questions about them. Suggest only questions about where, when, how many, pedestrians, bikes, deaths, grades, the Red List, the Watch List, fixes and road features.'
  AI_QUESTION_CATEGORIZATION 'Only questions about traffic crashes and intersections in Gainesville, Florida can be answered. Politely decline anything else, and anything asking to change, delete or add data.'
;
