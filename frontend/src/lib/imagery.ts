import "server-only";

// Imagery is loaded live from Google (data/imagery is not redistributable).
// NEXT_PUBLIC_GOOGLE_MAPS_API_KEY goes into <img> URLs, so restrict it by HTTP
// referrer. Street View metadata is fetched server-side, which a
// referrer-restricted key can't do: set GOOGLE_MAPS_SERVER_KEY for that.
const PUBLIC_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
const SERVER_KEY = process.env.GOOGLE_MAPS_SERVER_KEY ?? PUBLIC_KEY;

export interface Imagery {
  satelliteUrl: string;
  streetView: { url: string; date: string | null } | null;
}

export async function getImagery(lat: number, lon: number): Promise<Imagery | null> {
  if (!PUBLIC_KEY) return null;
  const location = `${lat},${lon}`;

  const satellite = new URL("https://maps.googleapis.com/maps/api/staticmap");
  satellite.search = new URLSearchParams({
    center: location,
    zoom: "19",
    size: "640x400",
    scale: "2",
    maptype: "satellite",
    key: PUBLIC_KEY,
  }).toString();

  return {
    satelliteUrl: satellite.toString(),
    streetView: await getStreetView(location),
  };
}

async function getStreetView(location: string) {
  let date: string | null = null;
  if (SERVER_KEY) {
    try {
      const meta = new URL("https://maps.googleapis.com/maps/api/streetview/metadata");
      meta.search = new URLSearchParams({
        location,
        source: "outdoor",
        key: SERVER_KEY,
      }).toString();
      const res = await fetch(meta, { next: { revalidate: 86400 } });
      const body = await res.json();
      if (body.status === "ZERO_RESULTS") return null;
      if (body.status === "OK") date = body.date ?? null;
    } catch {
      // No date label; still try the image.
    }
  }
  // No heading: Google points the camera at `location` from the nearest pano.
  const image = new URL("https://maps.googleapis.com/maps/api/streetview");
  image.search = new URLSearchParams({
    location,
    size: "640x400",
    fov: "90",
    source: "outdoor",
    key: PUBLIC_KEY!,
  }).toString();
  return { url: image.toString(), date };
}
