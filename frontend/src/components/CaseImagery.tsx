"use client";

import { useEffect, useRef, useState } from "react";
import {
  APIProvider,
  Map,
  useMapsLibrary,
} from "@vis.gl/react-google-maps";

// Imagery loads live from Google in the browser: the cached images can't be
// redistributed (Maps Platform terms), so they're never stored or proxied.
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
      <p className="text-sm opacity-60">
        Set NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY to show satellite and Street View.
      </p>
    );
  }
  const center = { lat, lng: lon };
  return (
    <APIProvider apiKey={apiKey}>
      <div className="grid gap-4 md:grid-cols-2">
        <figure>
          <div className="aspect-[8/5] overflow-hidden rounded-md">
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
          <figcaption className="mt-1 text-xs opacity-60">
            Satellite imagery from Google
          </figcaption>
        </figure>
        <StreetView center={center} name={name} />
      </div>
    </APIProvider>
  );
}

function StreetView({
  center,
  name,
}: {
  center: google.maps.LatLngLiteral;
  name: string;
}) {
  const { lat, lng } = center;
  const streetView = useMapsLibrary("streetView");
  const geometry = useMapsLibrary("geometry");
  const ref = useRef<HTMLDivElement>(null);
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
        const heading = geometry.spherical.computeHeading(
          data.location.latLng,
          new google.maps.LatLng(target),
        );
        new streetView.StreetViewPanorama(el, {
          pano: data.location.pano,
          pov: { heading, pitch: 0 },
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

  return (
    <figure>
      <div
        ref={ref}
        role="img"
        aria-label={`Street View of ${name}`}
        className="flex aspect-[8/5] items-center justify-center overflow-hidden rounded-md bg-black/5 text-sm dark:bg-white/5"
      >
        {state.status === "loading" && <span className="opacity-60">Loading Street View…</span>}
        {state.status === "none" && (
          <span className="opacity-60">No Street View within 60 m of this corner.</span>
        )}
      </div>
      <figcaption className="mt-1 text-xs opacity-60">
        Street View from Google
        {state.status === "ok" && state.date && `, captured ${state.date}`}
      </figcaption>
    </figure>
  );
}
