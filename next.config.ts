import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // Local assets live in /public/assets.
    formats: ["image/avif", "image/webp"],
  },
  async redirects() {
    return [
      // Root → games hub. Single-game site, but /play is the shared
      // onboarding surface and keeps the "pick a game" affordance
      // open for when we add a second mechanic.
      { source: "/", destination: "/play", permanent: false },
    ];
  },
};

export default nextConfig;
