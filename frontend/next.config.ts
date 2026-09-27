import type { NextConfig } from "next";

// The Maps browser key comes only from NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY in
// frontend/.env.local. Never fall back to the repo-root GOOGLE_MAPS_API_KEY:
// NEXT_PUBLIC_ values are inlined into the browser bundle, and that key is the
// unrestricted server key used by the imagery scripts.
const nextConfig: NextConfig = {
  // The ten worst intersections were the "fix list", then the "Wreck List";
  // old links still land on the page.
  redirects() {
    return [{ source: "/fix-list", destination: "/red-list", permanent: false }];
  },
};

export default nextConfig;
