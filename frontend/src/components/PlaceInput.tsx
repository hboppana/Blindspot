"use client";

import { useEffect, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { GAINESVILLE } from "@/lib/format";

export interface PickedPlace {
  name: string;
  location: google.maps.LatLngLiteral;
}

// Google's address search box (Places API (New)), biased to Gainesville.
export function PlaceInput({
  label,
  placeholder,
  onPick,
}: {
  label: string;
  placeholder: string;
  onPick: (place: PickedPlace | null) => void;
}) {
  const places = useMapsLibrary("places");
  const box = useRef<HTMLDivElement>(null);
  const pick = useRef(onPick);
  useEffect(() => {
    pick.current = onPick;
  });

  useEffect(() => {
    if (!places || !box.current) return;
    const el = new places.PlaceAutocompleteElement({
      includedRegionCodes: ["us"],
      locationBias: { center: GAINESVILLE, radius: 20_000 },
      placeholder,
    });
    el.setAttribute("aria-label", label);
    el.style.width = "100%";
    el.style.colorScheme = "light";

    const onSelect = async (e: Event) => {
      const place = (e as google.maps.places.PlacePredictionSelectEvent).placePrediction.toPlace();
      await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
      if (!place.location) return pick.current(null);
      pick.current({
        name: place.displayName ?? place.formattedAddress ?? "Selected place",
        location: place.location.toJSON(),
      });
    };
    el.addEventListener("gmp-select", onSelect);
    box.current.replaceChildren(el);
    return () => {
      el.removeEventListener("gmp-select", onSelect);
      el.remove();
    };
  }, [places, label, placeholder]);

  return (
    <label className="block text-sm">
      <span className="mb-1 block font-semibold">{label}</span>
      <div ref={box} className="min-h-10">
        {!places && <div className="h-10 rounded-md border border-line bg-surface" />}
      </div>
    </label>
  );
}
