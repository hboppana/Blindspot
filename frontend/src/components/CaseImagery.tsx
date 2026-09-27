"use client";

import { useEffect, useRef, useState } from "react";
import { APIProvider, Map, useMapsLibrary } from "@vis.gl/react-google-maps";

// Imagery loads live from Google in the browser: the cached images can't be
// redistributed (Maps Platform terms), so they're never stored or proxied.
// Two camera angles: straight down, and from the street, where the viewer can
// turn to face the intersection or look along each compass direction.
export function CaseImagery({
  apiKey,
  lat,
  lon,
  name,
}: {
  apiKey: string | undefined;
  lat: number;
  lon: number;
  name: string;
}) {
  if (!apiKey) {
    return (
      <p className="text-sm text-muted">
        Set NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY to show satellite and Street View.
      </p>
    );
  }
  const center = { lat, lng: lon };
  return (
    <APIProvider apiKey={apiKey}>
      <div className="grid gap-4 md:grid-cols-2">
        <figure>
          <div className="aspect-[4/3] overflow-hidden rounded-2xl border border-line">
            <Map
              defaultCenter={center}
              defaultZoom={20}
              mapTypeId="satellite"
              tilt={0}
              disableDefaultUI
              zoomControl
              gestureHandling="cooperative"
              className="h-full w-full"
              aria-label={`Satellite view of ${name}`}
            />
          </div>
          <figcaption className="mt-2 text-xs text-muted">From above. Satellite imagery from Google.</figcaption>
        </figure>
        <StreetView center={center} name={name} />
      </div>
    </APIProvider>
  );
}

type View = "face" | "N" | "E" | "S" | "W";
const COMPASS: Record<Exclude<View, "face">, number> = { N: 0, E: 90, S: 180, W: 270 };
const VIEWS: { view: View; label: string }[] = [
  { view: "face", label: "Face It" },
  { view: "N", label: "North" },
  { view: "E", label: "East" },
  { view: "S", label: "South" },
  { view: "W", label: "West" },
];

function StreetView({ center, name }: { center: google.maps.LatLngLiteral; name: string }) {
  const { lat, lng } = center;
  const streetView = useMapsLibrary("streetView");
  const geometry = useMapsLibrary("geometry");
  const ref = useRef<HTMLDivElement>(null);
  const pano = useRef<google.maps.StreetViewPanorama | null>(null);
  const facing = useRef(0);
  const [view, setView] = useState<View>("face");
  const [state, setState] = useState<
    { status: "loading" } | { status: "none" } | { status: "ok"; date: string | null }
  >({ status: "loading" });

  useEffect(() => {
    if (!streetView || !geometry || !ref.current) return;
    const el = ref.current;
    const target = { lat, lng };
    let cancelled = false;
    new streetView.StreetViewService()
      .getPanorama({
        location: target,
        radius: 60,
        source: streetView.StreetViewSource.OUTDOOR,
        preference: streetView.StreetViewPreference.NEAREST,
      })
      .then(({ data }) => {
        if (cancelled || !data.location?.latLng) return;
        // Face the intersection from wherever the nearest photo was taken.
        facing.current = geometry.spherical.computeHeading(data.location.latLng, new google.maps.LatLng(target));
        pano.current = new streetView.StreetViewPanorama(el, {
          pano: data.location.pano,
          pov: { heading: facing.current, pitch: 0 },
          addressControl: false,
          fullscreenControl: false,
          motionTracking: false,
          showRoadLabels: false,
        });
        setState({ status: "ok", date: data.imageDate ?? null });
      })
      .catch(() => !cancelled && setState({ status: "none" }));
    return () => {
      cancelled = true;
    };
  }, [streetView, geometry, lat, lng]);

  const turn = (v: View) => {
    setView(v);
    pano.current?.setPov({ heading: v === "face" ? facing.current : COMPASS[v], pitch: 0 });
  };

  return (
    <figure>
      <div
        ref={ref}
        role="img"
        aria-label={`Street View of ${name}`}
        className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl border border-line bg-surface text-sm"
      >
        {state.status === "loading" && <span className="text-muted">Loading Street View…</span>}
        {state.status === "none" && <span className="text-muted">No Street View within 60 m of this intersection.</span>}
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted">
          From the street. Street View from Google
          {state.status === "ok" && state.date && `, taken ${state.date}`}.
        </span>
        {state.status === "ok" && (
          <span role="group" aria-label="Turn the street view" className="flex gap-1 rounded-full bg-brand-soft p-1">
            {VIEWS.map((v) => (
              <button
                key={v.view}
                type="button"
                aria-pressed={view === v.view}
                onClick={() => turn(v.view)}
                className={`h-8 rounded-full px-3 text-xs font-bold transition-colors ${
                  view === v.view ? "bg-brand text-white" : "hover:bg-surface"
                }`}
              >
                {v.label}
              </button>
            ))}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
