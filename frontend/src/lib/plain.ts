// Plain-language lines for cards: what keeps happening at an intersection,
// and what a fix actually does, in words a resident would use.
import type { Factor } from "./types";

export const CRASH_STORY: Record<Factor, string> = {
  rear_end: "Cars running into the car ahead, mostly in stop-and-go traffic at the light.",
  angle: "Cars crossing paths and hitting side-on, often on a late light.",
  left_turn: "Drivers turning left into oncoming traffic.",
  right_turn: "Drivers turning right into cars, bikes or people.",
  sideswipe: "Cars clipping each other while changing lanes.",
  pedestrian: "Drivers hitting people on foot.",
  bicycle: "Drivers hitting people on bikes.",
  other: "A mix of crash types, none of them dominant.",
};

export const crashStory = (f: Factor | null) => (f ? CRASH_STORY[f] : CRASH_STORY.other);

// Keyed by the countermeasure's name as the API returns it.
const FIX_STORY: Record<string, string> = {
  "Dedicated left-turn lanes": "Give left-turning cars their own lane, out of the through traffic.",
  "Dedicated right-turn lanes": "Give right-turning cars their own lane, out of the through traffic.",
  "Reduced left-turn conflict intersection (RCUT / MUT)":
    "Replace risky left turns across traffic with a U-turn a short way down the road.",
  Roundabout: "Swap the signal for a roundabout, where crashes are slower and glancing.",
  "Appropriate yellow change intervals": "Retime the yellow lights so drivers have time to stop.",
  "Signal backplates with retroreflective borders": "Frame the signals so drivers see them sooner.",
  "Leading pedestrian interval": "Give people on foot a head start before cars get a green.",
  "Crosswalk visibility enhancements (high-visibility crosswalks, lighting, advance yield/stop markings)":
    "Make the crosswalks impossible to miss: bold paint, lighting and stop lines.",
  "Medians and pedestrian refuge islands": "Add a median island so people cross one direction at a time.",
  "Pedestrian hybrid beacon": "Add a signal people on foot can call to stop traffic.",
  "Rectangular rapid flashing beacon": "Add flashing lights that warn drivers someone is crossing.",
  "Bicycle lanes (separated with flexible posts)": "Give bikes their own lane, separated by posts.",
  "Intersection lighting": "Light the intersection so crashes after dark drop.",
  "Road diet (4 lanes to 3)": "Trade two travel lanes for a turn lane, calming the traffic.",
  "Speed safety cameras": "Use cameras to bring speeds down.",
  "Systemic low-cost countermeasures at stop-controlled intersections":
    "Make the stop signs and markings far easier to see.",
  "Corridor access management (fewer driveways)":
    "Close or combine driveways so fewer cars pull in and out mid-block.",
};

export const fixStory = (name: string) =>
  name.startsWith("review needed")
    ? "No single standard fix fits; an engineer needs to look at it."
    : (FIX_STORY[name] ?? name);

/** "Corridor access management (fewer driveways)" -> "Corridor access management" */
export const shortFixName = (name: string) =>
  name.startsWith("review needed") ? "Engineer's review" : name.replace(/\s*\(.*\)\s*$/, "");
