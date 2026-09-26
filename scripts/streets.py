"""Normalize dataGNV street names so the same road gets the same name.

The raw names mix route numbers and local names in many spellings:
"SR 24 (SW ARCHER RD)", "SR24(SW ARCHER RD)", "SW ARCHER RD (SR 24)",
"SR 24 / SW ARCHER RD" and "SW ARCHER ROAD" all mean SW ARCHER RD.

Rules, in order:
  1. Non-streets return None: parking lots, driveways, ramps, I-75,
     house addresses ("3525 SW ARCHER RD"), bare numbers, "2400 BLOCK".
  2. Split on brackets and slashes; drop route-number pieces (SR 24, US 441,
     CR 232, "SW 121"). The local name wins because route numbers in the
     data are sometimes wrong ("SR 26 (SW ARCHER RD)"). A string that is
     only a route number keeps it ("SR 121"); the coordinate merge sorts
     those out later.
  3. Standardize directions (WEST -> W), suffixes (ROAD -> RD, AV -> AVE),
     ordinals ("SE 10 AVE" -> "SE 10TH AVE") and a few known typos.
  4. Directions are kept: NW 8TH AVE and SW 8TH AVE are different streets.
     FDOT puts them last ("35TH BLVD SW"); they move to the front.
     A name with no direction ("ARCHER RD") stays as is; the coordinate
     merge joins it to "SW ARCHER RD".
  5. Look-alikes stay separate: SW 34TH TER is not SW 34TH ST, and
     OLD ARCHER RD is not SW ARCHER RD.

Usage: python scripts/streets.py   (prints a check on the crash data)
"""

import re

NOT_A_STREET = re.compile(
    r"PARKING|\bP\s?LOT\b|\bPKNG\b|\bLOT\b|DRIVEWAY|\bRAMP\b|\bI-?\s?75\b|INTERSTATE"
    r"|\bBLOCK\b|^\d+\s|^\d+$|^UNK$"
)

# A piece made only of route words, numbers and single letters is a route
# number, not a name: "SR 24", "SR - 121", "SR 24 A", "US S HWY 441",
# "STATE ROAD 24", "NE SR 24", and the typo form "SW 121".
ROUTE_WORDS = {"SR", "US", "CR", "FL", "HWY", "STATE", "ROAD", "ST", "RD",
               "NW", "NE", "SW", "SE", "-"}
ROUTE_TOKEN = re.compile(r"^(?:\d+[A-Z]?|[A-Z]|[A-Z]{2}-?\d+[A-Z]?)$")  # 24, 24A, A, SR24, SR-24
ROUTE = r"(?:(?:STATE\s+ROAD|ST\s+RD|US\s+HWY|U\s?S|SR|CR|FL|HWY)\s*-?\s*\d+[A-Z]?)"
ROUTE_ANYWHERE = re.compile(rf"(?:\b[NSEW]{{1,2}}\s+)?\b{ROUTE}\b")


def _is_route(piece):
    return all(t in ROUTE_WORDS or ROUTE_TOKEN.match(t) for t in piece.split())

DIRECTIONS = {
    "NORTHWEST": "NW", "NORTHEAST": "NE", "SOUTHWEST": "SW", "SOUTHEAST": "SE",
    "NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W",
}
SUFFIXES = {
    "ROAD": "RD", "STREET": "ST", "AVENUE": "AVE", "AV": "AVE",
    "BOULEVARD": "BLVD", "BLV": "BLVD", "TERRACE": "TER", "TERR": "TER",
    "PLACE": "PL", "LANE": "LN", "DRIVE": "DR", "COURT": "CT",
    "CIRCLE": "CIR", "PARKWAY": "PKWY", "HIGHWAY": "HWY",
}
SUFFIX_SET = set(SUFFIXES.values()) | {"WAY", "LOOP", "TRL", "RUN", "PATH"}

TYPOS = {
    "ARCHR": "ARCHER", "ARCHERD": "ARCHER",
    "WILLSITON": "WILLISTON", "WILISTON": "WILLISTON", "WILLISTION": "WILLISTON",
    "NEWBERYRD": "NEWBERRY RD", "NEWBERY": "NEWBERRY", "RD0": "RD",
    "EUNIVERSITY": "E UNIVERSITY", "WUNIVERSITY": "W UNIVERSITY", "2NSD": "2ND",
    # OSM spells some out: "Southwest Second Avenue"
    "FIRST": "1ST", "SECOND": "2ND", "THIRD": "3RD", "FOURTH": "4TH", "FIFTH": "5TH",
    "SIXTH": "6TH", "SEVENTH": "7TH", "EIGHTH": "8TH", "NINTH": "9TH", "TENTH": "10TH",
}

# Main roads often written without a suffix ("SW ARCHER", "W UNIVERSITY").
DEFAULT_SUFFIX = {
    "ARCHER": "RD", "UNIVERSITY": "AVE", "WILLISTON": "RD", "NEWBERRY": "RD",
    "WALDO": "RD", "HAWTHORNE": "RD",
}


def _ordinal(n):
    n = int(n)
    if 10 <= n % 100 <= 20:
        return f"{n}TH"
    return f"{n}{ {1: 'ST', 2: 'ND', 3: 'RD'}.get(n % 10, 'TH') }"


def _clean_piece(piece):
    words = piece.split()
    if not words:
        return ""
    words = [TYPOS.get(w, w) for w in " ".join(words).split()]
    words = " ".join(words).split()  # a typo fix may add a word
    if words[0] in DIRECTIONS:
        words[0] = DIRECTIONS[words[0]]
    words = [SUFFIXES.get(w, w) for w in words]
    # FDOT sometimes adds a side-of-road marker: "40TH BLVD SW L", "62ND ST NW R".
    if len(words) > 2 and words[-1] in {"L", "R"} and (
            words[-2] in DIRECTIONS.values() or words[-2] in SUFFIX_SET):
        words.pop()
    # Direction after the suffix. FDOT writes "35TH BLVD SW" for SW 35TH BLVD,
    # so move it to the front. If there is already one in front
    # ("W UNIVERSITY AV E"), the trailing one is noise.
    if len(words) > 2 and words[-1] in DIRECTIONS.values() and words[-2] in SUFFIX_SET:
        trailing = words.pop()
        if words[0] not in DIRECTIONS.values():
            words.insert(0, trailing)
    # "SE 10 AVE" -> "SE 10TH AVE"
    for i in range(len(words) - 1):
        if words[i].isdigit() and words[i + 1] in SUFFIX_SET:
            words[i] = _ordinal(words[i])
    if words[-1] in DEFAULT_SUFFIX:
        words.append(DEFAULT_SUFFIX[words[-1]])
    return " ".join(words)


def normalize_street(name):
    """Return a canonical street name, or None if it isn't a street."""
    if not isinstance(name, str):
        return None
    s = name.upper().replace("`", "").replace(".", " ")
    s = re.sub(r"\s+", " ", s).strip()
    if not s or NOT_A_STREET.search(s):
        return None

    s = re.sub(r"\b(NW|NE|SW|SE)(\d)", r"\1 \2", s)  # "SW34TH ST"
    pieces = [p.strip() for p in re.split(r"[()/]|\s-\s", s) if p.strip()]
    local = [p for p in pieces if not _is_route(p)]
    if not local:
        # Only a route number, e.g. "SR 121". Keep it in one spelling.
        m = re.search(r"(SR|US|CR|FL)\D*(\d+)", s)
        return f"{m.group(1)} {m.group(2)}" if m else None

    # "SR 24 SW ARCHER RD", "SW ARCHER RD SR24": route glued on without brackets.
    best = ROUTE_ANYWHERE.sub(" ", local[0]).strip()
    if re.match(r"^\d+\s", best):  # house address inside brackets
        return None
    best = _clean_piece(best)
    return best or None


ROUTE_NAME = re.compile(r"^(SR|US|CR|FL) \d+$")  # what normalize_street returns for a bare route


def street_base(street):
    """Street name without its direction: "SW ARCHER RD" -> "ARCHER RD"."""
    words = street.split()
    return " ".join(words[1:]) if len(words) > 1 and words[0] in DIRECTIONS.values() else street


def pair_key(a, b):
    """Order-independent key for an intersection of two normalized names."""
    if not isinstance(a, str) or not isinstance(b, str) or not a or not b or a == b:
        return None
    return " & ".join(sorted((a, b)))


if __name__ == "__main__":
    from pathlib import Path

    import pandas as pd

    root = Path(__file__).resolve().parent.parent
    d = pd.read_csv(root / "data" / "processed" / "gnv_crashes_clean.csv", low_memory=False)

    raw = pd.concat([d.street, d.cross_street]).dropna()
    mapping = {name: normalize_street(name) for name in raw.unique()}
    norm = raw.map(mapping)
    print(f"distinct names: {raw.nunique()} raw -> {norm.nunique()} normalized")
    print(f"not a street: {norm.isna().sum()} of {len(raw)} name values")

    for road in ["ARCHER", "34TH", "UNIVERSITY", "13TH ST"]:
        hit = raw[raw.str.contains(road)]
        print(f"\n{road}: {hit.nunique()} raw variants ->")
        print(hit.map(mapping).value_counts(dropna=False).head(8).to_string())

    recent = d[d.year >= 2022]
    keys = [pair_key(mapping.get(a), mapping.get(b)) for a, b in zip(recent.street, recent.cross_street)]
    print("\nTop 30 pairs, 2022 onward (any offset):")
    print(pd.Series(keys).value_counts().head(30).to_string())
