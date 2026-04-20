import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // Local assets live in /public/assets.
    formats: ["image/avif", "image/webp"],
  },
  async redirects() {
    return [
      // DUNK-04: root redirects to the canonical game route.
      { source: "/", destination: "/dunk", permanent: false },
    ];
  },
};

export default nextConfig;
