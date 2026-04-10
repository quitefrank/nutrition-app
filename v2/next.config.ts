import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Service worker must never be cached by the browser's HTTP cache.
        // The SW registration API handles its own versioning — stale SW files
        // cause very hard-to-debug update problems.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          // Allow the SW to control the full origin scope
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // manifest.json should revalidate frequently so icon/color changes
        // propagate to installed PWAs without a hard refresh.
        source: "/manifest.json",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
