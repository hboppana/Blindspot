"""PDF audit report for one intersection (GET /intersections/{id}/report.pdf).

Built only from what GET /intersections/{id} returns, so the PDF can't say
anything the API doesn't. Uses fpdf2's core Helvetica font: every text field
in the data is Latin-1, and latin1() maps stray typographic characters.

No Google imagery is embedded (putting it in a downloadable file would be
redistribution); the report gives the capture dates and a Google Maps link.
"""

import re
from datetime import date

from fpdf import FPDF
from fpdf.enums import XPos, YPos

INK = (28, 29, 31)
MUTED = (98, 102, 109)
RULE = (220, 220, 215)
BAR = (60, 62, 66)
FDOT_PERIOD = "FDOT, 2015 to 2018"
VERDICT_BAND = {
    "main": "half or more of crashes",
    "leading": "40 to 50% of crashes",
    "mixed": "no single type dominates",
}
FACTOR_LABEL = {
    "rear_end": "Rear-end", "angle": "Angle", "left_turn": "Left turn", "sideswipe": "Sideswipe",
    "right_turn": "Right turn", "pedestrian": "Pedestrian", "bicycle": "Bicycle", "other": "Other",
}
TYPOGRAPHY = str.maketrans({"–": "-", "—": "-", "‘": "'", "’": "'",
                            "“": '"', "”": '"', "…": "...", "≈": "~"})
DIRECTIONS = {"N", "S", "E", "W", "NW", "NE", "SW", "SE", "SR", "US", "CR", "FL", "&"}


def latin1(text) -> str:
    return str(text).translate(TYPOGRAPHY).encode("latin-1", "replace").decode("latin-1")


def display_name(raw: str) -> str:
    """"NW 69TH TER & W NEWBERRY RD" -> "NW 69th Ter & W Newberry Rd" (as _display in build_hotspots.py)."""
    return " ".join(w if w in DIRECTIONS else w.lower() if w[:1].isdigit() else w.capitalize()
                    for w in raw.split())


def recent_period(period: str) -> str:
    """"2022-01-01 to 2026-07-23" -> "dataGNV, Jan 2022 to Jul 2026"."""
    months = re.findall(r"(\d{4})-(\d{2})", period)
    if len(months) != 2:
        return f"dataGNV, {period}"
    fmt = lambda y, m: date(int(y), int(m), 1).strftime("%b %Y")
    return f"dataGNV, {fmt(*months[0])} to {fmt(*months[1])}"


def _norm(s: str) -> str:
    return re.sub(r"[-\s]+", "_", s.lower()).removesuffix("s")


def _num(v, fmt="{:,.0f}") -> str:
    return "-" if v is None else fmt.format(v)


class Report(FPDF):
    def __init__(self, title: str):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.title_text = title
        self.set_margins(15, 15, 15)
        self.set_auto_page_break(True, margin=18)
        self.set_title(latin1(f"StreetSmart audit: {title}"))
        self.set_author("StreetSmart")

    def footer(self):
        self.set_y(-12)
        self.set_font("Helvetica", size=7.5)
        self.set_text_color(*MUTED)
        self.cell(0, 5, latin1(f"StreetSmart · Gainesville · {self.title_text}"))
        self.set_x(self.l_margin)
        self.cell(0, 5, f"Page {self.page_no()} of {{nb}}", align="R")

    # Layout helpers -------------------------------------------------------

    def ensure(self, height: float):
        """Start a new page if the next block wouldn't fit."""
        if self.get_y() + height > self.page_break_trigger:
            self.add_page()

    def para(self, body, size=9.5, style="", color=INK, h=4.6):
        self.set_font("Helvetica", style, size)
        self.set_text_color(*color)
        self.multi_cell(0, h, latin1(body), align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    def heading(self, title, period=None, need=30):
        self.ensure(need)
        self.ln(3)
        y = self.get_y()
        self.set_draw_color(*RULE)
        self.line(self.l_margin, y, self.w - self.r_margin, y)
        self.ln(2.5)
        self.set_font("Helvetica", "B", 11.5)
        self.set_text_color(*INK)
        self.cell(0, 6, latin1(title))
        if period:
            self.set_x(self.l_margin)
            self.set_font("Helvetica", size=7.5)
            self.set_text_color(*MUTED)
            self.cell(0, 6, latin1(period), align="R")
        self.ln(8)

    def label_value(self, label, value, label_w=38):
        self.set_font("Helvetica", size=9)
        self.set_text_color(*MUTED)
        self.cell(label_w, 5, latin1(label))
        self.set_text_color(*INK)
        self.cell(0, 5, latin1(value), new_x=XPos.LMARGIN, new_y=YPos.NEXT)


# Sections -----------------------------------------------------------------

def header(pdf: Report, x: dict):
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 5, "STREETSMART INTERSECTION AUDIT")
    pdf.set_x(pdf.l_margin)
    pdf.set_font("Helvetica", size=8)
    pdf.cell(0, 5, latin1(date.today().strftime("%B %d, %Y").replace(" 0", " ")), align="R")
    pdf.ln(7)
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(*INK)
    pdf.multi_cell(0, 9, latin1(x["name"]), align="L", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    chips = []
    if x["screening_rank"] is not None:
        chips.append(f"Rank {x['screening_rank']} citywide")
    if x["fix_list_rank"] is not None:
        chips.append(f"Fix list #{x['fix_list_rank']}")
    if x["confidence"]:
        chips.append("Evidence: solid" if x["confidence"] == "ok" else "Evidence: limited")
    if chips:
        pdf.ln(1)
        pdf.para("  ·  ".join(chips), size=9, style="B", color=MUTED)


def verdict(pdf: Report, x: dict):
    cf = x["case_file"]
    line = cf["case_file"]["verdict"] if cf else f"{x['crashes_since_2022']} crashes since 2022. No case file for this intersection."
    pdf.ln(3)
    pdf.para(line, size=12, h=6)


def key_numbers(pdf: Report, x: dict, period: str):
    excess = x["excess_per_year"]
    boxes = [
        (_num(x["crashes_since_2022"]), "crashes since 2022"),
        (_num(x["predicted"]), "predicted for a similar corner"),
        ("-" if excess is None else f"{'+' if round(excess) > 0 else ''}{round(excess)}", "crashes a year above similar corners"),
        (_num(x["crash_rate_vs_similar"], "{:.1f}x"), "crash rate vs similar corners"),
    ]
    pdf.ensure(30)
    pdf.ln(4)
    gap, top = 3, pdf.get_y()
    w = (pdf.epw - gap * 3) / 4
    pdf.set_draw_color(*RULE)
    for i, (value, label) in enumerate(boxes):
        left = pdf.l_margin + i * (w + gap)
        pdf.rect(left, top, w, 25)
        pdf.set_xy(left + 3, top + 3)
        pdf.set_font("Helvetica", "B", 16)
        pdf.set_text_color(*INK)
        pdf.cell(w - 6, 7, latin1(value))
        pdf.set_xy(left + 3, top + 11)
        pdf.set_font("Helvetica", size=8)
        pdf.multi_cell(w - 6, 3.6, latin1(label), align="L")
    pdf.set_xy(pdf.l_margin, top + 26.5)
    pdf.para(f"All four: {period}. \"Similar corner\" means one with the same traffic volume (or road class), "
             "signal and number of legs; see Sources and methods.", size=7.5, color=MUTED)


def crash_timing(pdf: Report, x: dict, period: str, end_year: int):
    profile = (x["case_file"] or {}).get("crash_profile")
    if not profile:
        return
    pdf.heading("When crashes happen", period, need=55)
    # Every year of the window, so a year with no crashes shows as 0 rather than vanishing.
    by_year = {int(y): n for y, n in profile["by_year"].items()}
    years = [(str(y), by_year.get(y, 0)) for y in range(2022, max([end_year, *by_year]) + 1)]
    top, chart_h, chart_w = pdf.get_y() + 4, 30, 80
    peak = max((n for _, n in years), default=1) or 1
    slot = chart_w / max(len(years), 1)
    for i, (year, n) in enumerate(years):
        h = chart_h * n / peak
        left = pdf.l_margin + i * slot + slot * 0.2
        pdf.set_fill_color(*BAR)
        pdf.rect(left, top + chart_h - h, slot * 0.6, h, style="F")
        pdf.set_font("Helvetica", size=7.5)
        pdf.set_text_color(*INK)
        pdf.set_xy(left - 2, top + chart_h - h - 4)
        pdf.cell(slot * 0.6 + 4, 4, str(n), align="C")
        pdf.set_text_color(*MUTED)
        pdf.set_xy(left - 2, top + chart_h + 1)
        pdf.cell(slot * 0.6 + 4, 4, f"{year}*" if year == years[-1][0] and year >= "2026" else year, align="C")
    pdf.set_draw_color(*RULE)
    pdf.line(pdf.l_margin, top + chart_h, pdf.l_margin + chart_w, top + chart_h)

    facts = (x["case_file"] or {}).get("facts") or {}
    right = pdf.l_margin + chart_w + 10
    pdf.set_xy(right, top)
    lines = [
        ("Busiest hours", ", ".join(facts.get("busiest_hours") or []) or "-"),
        ("Involving a pedestrian", f"{profile['pedestrian_share']:.0%}"),
        ("Involving a bicycle", f"{profile['bicycle_share']:.0%}"),
        ("Fatal crashes", str(profile["fatal_crashes"])),
    ]
    for label, value in lines:
        pdf.set_x(right)
        pdf.set_font("Helvetica", size=9)
        pdf.set_text_color(*MUTED)
        pdf.cell(42, 6, latin1(label))
        pdf.set_text_color(*INK)
        pdf.cell(0, 6, latin1(value), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_y(top + chart_h + 7)
    if years and years[-1][0] >= "2026":
        pdf.para(f"* {years[-1][0]} is a partial year.", size=7.5, color=MUTED)


def factors(pdf: Report, x: dict):
    cf = x["case_file"]
    distinctive = (cf.get("causes") or {}).get("distinctive_factors") or []
    pdf.heading("Contributing factors", FDOT_PERIOD, need=40)
    main = FACTOR_LABEL.get(x["main_factor"] or "", (x["main_factor"] or "none").replace("_", " "))
    band = VERDICT_BAND.get(x["verdict"] or "")
    pdf.para(f"Most common crash type: {main}" + (f" ({band})" if band else ""), size=9.5, style="B")
    pdf.ln(1.5)
    for f in cf["case_file"].get("factor_explanations") or []:
        d = next((d for d in distinctive if _norm(f["factor"]) in (_norm(d["type"]), _norm(d["label"]))), None)
        pdf.ensure(18)
        name = f["factor"].replace("_", " ")
        pdf.para(name[:1].upper() + name[1:], size=10, style="B")
        if d:
            pdf.para(f"{d['crashes']} crashes vs {d['expected_at_similar_corners']:.0f} expected, "
                     f"{d['vs_similar']:.2f}x similar corners", size=9, color=MUTED)
        pdf.para(f["explanation"], size=9.5)
        pdf.ln(1.5)
    pdf.para("Crash types come from FDOT police reports linked to this intersection. Contributing factors are "
             "associations with road design, not proof of cause.", size=7.5, color=MUTED)


def recommended_fix(pdf: Report, x: dict):
    measures = x["countermeasures"]
    if not measures:
        return
    cf = x["case_file"]
    m = measures[0]
    rec = next((r for r in (cf.get("recommendations") or {}).get("recommendations", []) if r["id"] == m["id"]), {})
    pdf.heading("Recommended fix", "FHWA Proven Safety Countermeasures", need=45)
    pdf.set_font("Helvetica", "B", 13)
    pdf.set_text_color(*INK)
    pdf.cell(0, 7, latin1(m["name"]))
    if rec.get("cost"):
        pdf.set_x(pdf.l_margin)
        pdf.set_font("Helvetica", size=9)
        pdf.set_text_color(*MUTED)
        pdf.cell(0, 7, latin1(f"Cost: {rec['cost']}"), align="R")
    pdf.ln(8)
    for e in m["effects"]:
        pdf.para(f"{e['value']} {e['measure']}", size=9.5, style="B")
    why = (cf["case_file"].get("recommended_fix") or {}).get("why")
    if why:
        pdf.ln(1.5)
        pdf.para(why, size=9.5)
    if m.get("note"):
        pdf.para(m["note"], size=8, color=MUTED)
    if m.get("url"):
        pdf.set_font("Helvetica", "U", 8)
        pdf.set_text_color(*MUTED)
        pdf.cell(0, 5, "FHWA countermeasure page", link=m["url"], new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    precedent = (cf.get("facts") or {}).get("gainesville_precedent")
    if precedent:
        pdf.ensure(28)
        pdf.ln(2)
        pdf.para("LOCAL PROOF", size=7.5, style="B", color=MUTED)
        pdf.para(f"{display_name(precedent['intersection'])}: {precedent['change']}", size=9)
        effect = precedent["effect"]
        pdf.para(effect[:1].upper() + effect[1:], size=9, style="B")
    if len(measures) > 1:
        pdf.ln(1.5)
        pdf.para("Also fits: " + ", ".join(o["name"] for o in measures[1:]) + ".", size=9, color=MUTED)


def road_design(pdf: Report, x: dict):
    pdf.heading("Road design", need=45)
    word = {"yes": "Yes", "no": "No"}
    for label, key in [("Traffic signal", "traffic_signal"), ("Marked crosswalk", "crosswalk"),
                       ("Left-turn lane", "left_turn_lane"), ("Median", "median")]:
        pdf.label_value(label, word.get(x[key], "Unknown"))
    pdf.label_value("Speed limit", f"{x['speed_limit']:.0f} mph" if x["speed_limit"] else "Unknown")
    pdf.label_value("Lanes (max)", _num(x["fdot_lanes_max"]) if x["fdot_lanes_max"] else "Unknown")
    pdf.label_value("Daily traffic", _num(x["daily_traffic_max"]) if x["daily_traffic_max"] else "Unknown")
    pdf.ln(1.5)
    if x["has_imagery_labels"] and x["imagery_from"]:
        source = (f"Features read by Gemini from Google Street View and satellite imagery captured "
                  f"{x['imagery_from']} to {x['imagery_to']}, checked against OpenStreetMap.")
    else:
        source = "No imagery labels for this corner; features from OpenStreetMap where mapped."
    pdf.para(source + " Speed, lanes and traffic from FDOT road records.", size=8, color=MUTED)
    url = f"https://www.google.com/maps/search/?api=1&query={x['lat']:.6f},{x['lon']:.6f}"
    pdf.set_font("Helvetica", "U", 8)
    pdf.set_text_color(*MUTED)
    pdf.cell(0, 5, "View this intersection on Google Maps", link=url, new_x=XPos.LMARGIN, new_y=YPos.NEXT)


def audit_summary(pdf: Report, x: dict):
    text = x["case_file"]["case_file"].get("audit_text")
    if not text:
        return
    pdf.heading("Audit summary", need=35)
    pdf.para(text, size=9.5)
    pdf.ln(1)
    pdf.para("Written by Gemini from the computed facts in this report; it may not add numbers.", size=7.5, color=MUTED)


def no_pattern(pdf: Report, x: dict):
    pdf.heading("Contributing factors", need=20)
    if x["crashes_since_2022"] == 0:
        pdf.para("No crashes here since 2022, so there is no pattern to report and no fix is named.", size=9.5)
    else:
        pdf.para("Too few crashes to identify a repeated pattern, so no contributing factor or fix is named.", size=9.5)


def sources(pdf: Report, period: str):
    pdf.heading("Sources and methods", need=30)
    pdf.para(
        f"Crashes: City of Gainesville traffic crashes (dataGNV), {period.removeprefix('dataGNV, ')}; FDOT State "
        "Safety Office crash reports, 2015 to 2018, for crash types. Road features: Gemini reading Google imagery, "
        "OpenStreetMap contributors, and FDOT road records. Countermeasures and their effects: FHWA Proven Safety "
        "Countermeasures.",
        size=8, color=MUTED,
    )
    pdf.ln(1)
    pdf.para(
        "Predicted crashes come from a safety performance function (Highway Safety Manual network screening) "
        "fitted to Gainesville intersections on traffic volume or road class, signal and number of legs; empirical "
        "Bayes blends that prediction with this corner's own count, and the excess ranks the city. Crash-type "
        "comparisons use intersections with the same major road class and signal status. \"Evidence: solid\" "
        "means at least 20 linked FDOT crashes, a crash pattern that held from 2015-2018 into 2022 onward, and "
        "consistent street names; otherwise the evidence is limited.",
        size=8, color=MUTED,
    )


def build_report(x: dict, period: str) -> bytes:
    """The audit report for one intersection, as PDF bytes. x is load_intersection()'s result."""
    recent = recent_period(period)
    end_year = int(period[-10:-6]) if re.search(r"\d{4}-\d{2}-\d{2}$", period) else date.today().year
    pdf = Report(x["name"])
    pdf.add_page()
    header(pdf, x)
    verdict(pdf, x)
    key_numbers(pdf, x, recent)
    crash_timing(pdf, x, recent, end_year)
    if x["has_gemini_description"] and x["case_file"]:
        factors(pdf, x)
        recommended_fix(pdf, x)
        road_design(pdf, x)
        audit_summary(pdf, x)
    else:
        no_pattern(pdf, x)
        road_design(pdf, x)
    sources(pdf, recent)
    return bytes(pdf.output())
