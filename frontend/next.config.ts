import type { NextConfig } from "next";

// The Maps browser key comes only from NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY in
// frontend/.env.local. Never fall back to the repo-root GOOGLE_MAPS_API_KEY:
// NEXT_PUBLIC_ values are inlined into the browser bundle, and that key is the
// unrestricted server key used by the imagery scripts.
const nextConfig: NextConfig = {
  // Pages that were renamed: old links still land on them. The ten worst
  // intersections were the "fix list", then the "Wreck List" (now the Red
  // List); the Fix Plan is now the Road Map.
  redirects() {
    return [
      { source: "/fix-list", destination: "/red-list", permanent: false },
      { source: "/fix-plan", destination: "/road-map", permanent: false },
    ];
  },
};

export default nextConfig;
