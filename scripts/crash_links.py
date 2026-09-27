"""Which intersection each dataGNV crash belongs to.

build_hotspots.py matches crashes to intersections in memory (street pair
within NEAR_FT, merged within MERGE_M, leftovers snapped within SNAP_M) but
only saves the per-intersection totals. Ask StreetSmart needs the crash-level
link to answer questions like "bike crashes at Archer Rd corners since 2023",
so this reruns that same matching, with the same functions, and saves it.
Nothing else in the pipeline is touched.

Output: data/derived/crash_intersections.csv  (crash_row, case_number, intersection_id)
        crash_row is the crash's 0-based row in gnv_crashes_clean.csv (a few
        case numbers repeat, so it is the key); intersection_id is the site's
        id (e.g. sw-34th-st-sw-archer-rd); crashes not at an intersection are
        left out.
Usage:  python scripts/crash_links.py
"""

from build_hotspots import DERIVED, SINCE_YEAR, _slug, load_intersection_crashes, merge_pairs, snap_leftovers

OUT = DERIVED / "crash_intersections.csv"


def main():
    d = load_intersection_crashes()
    inters = merge_pairs(d, SINCE_YEAR)
    snap_leftovers(d, inters, SINCE_YEAR)
    linked = d[d.intersection_id.notna()][["case_number", "intersection_id"]].copy()
    linked.insert(0, "crash_row", linked.index)
    linked["intersection_id"] = linked.intersection_id.map(_slug)
    linked.to_csv(OUT, index=False)  # load_intersection_crashes keeps the file's row order
    print(f"{len(linked)} of {len(d)} crashes linked to {linked.intersection_id.nunique()} intersections -> {OUT}")


if __name__ == "__main__":
    main()
