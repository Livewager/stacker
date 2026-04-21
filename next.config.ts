import type { NextConfig } from "next";

/**
 * Next config. Two deploy targets:
 *   - Vercel (SSR + API routes) — current production.
 *   - IC assets canister (static export) — for local dfx dev and
 *     eventual on-IC frontend hosting.
 *
 * IC_BUILD=1 switches to static-export mode:
 *   output: "export", trailingSlash, unoptimized images, no redirects
 *   (assets canister can't run runtime redirects — the root page
 *   uses a client-side redirect to /play instead).
 */
const isIcBuild = process.env.IC_BUILD === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    formats: ["image/avif", "image/webp"],
    unoptimized: isIcBuild,
  },
  ...(isIcBuild
    ? {
        output: "export" as const,
        trailingSlash: true,
      }
    : {
        async redirects() {
          return [
            { source: "/", destination: "/play", permanent: false },
          ];
        },
      }),
};

export default nextConfig;
