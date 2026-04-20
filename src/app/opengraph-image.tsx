/**
 * Auto-generated OG preview card.
 * Served at `/opengraph-image.png` by Next's file-based metadata API.
 * Matches the app's dark/cyan theme; no remote assets so it's cache-
 * friendly at any edge.
 */

import { ImageResponse } from "next/og";

// Node runtime: more forgiving on local dev than edge, and ImageResponse
// is fully supported in Node 18+. Switch to edge later for prod caching.
export const runtime = "nodejs";
export const alt = "Stacker — stack to the top.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          backgroundColor: "#020b18",
          backgroundImage:
            "radial-gradient(1200px 700px at 10% 10%, rgba(34,211,238,0.22), rgba(2,11,24,0)), radial-gradient(900px 600px at 100% 100%, rgba(251,146,60,0.28), rgba(2,11,24,0))",
          fontFamily: "Inter, system-ui, -apple-system, Segoe UI, sans-serif",
          color: "#f5f5f5",
        }}
      >
        {/* Top: eyebrow */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: "#22d3ee",
            fontSize: 18,
            fontWeight: 700,
          }}
        >
          <span
            style={{
              display: "flex",
              width: 10,
              height: 10,
              borderRadius: 10,
              background: "#22d3ee",
              boxShadow: "0 0 18px #22d3ee",
            }}
          />
          Livewager · Stacker
        </div>

        {/* Middle: headline + subtitle */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "baseline",
              gap: 20,
              fontSize: 112,
              fontWeight: 900,
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
            }}
          >
            <span style={{ display: "flex" }}>Stack</span>
            <span style={{ display: "flex" }}>to the</span>
            <span
              style={{
                display: "flex",
                backgroundImage: "linear-gradient(90deg,#22d3ee,#fdba74,#facc15)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              top.
            </span>
          </div>
          <div
            style={{
              fontSize: 28,
              color: "#c9d1d9",
              maxWidth: 900,
              lineHeight: 1.35,
            }}
          >
            A 30-second arcade skill game. Non-custodial points on the
            Internet Computer. ICRC-1 + ICRC-2 + ICRC-3.
          </div>
        </div>

        {/* Bottom: badges row */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {[
            "Internet Identity",
            "ICRC-1/2/3",
            "Litecoin rail",
            "7 × 15 grid",
          ].map((b) => (
            <div
              key={b}
              style={{
                display: "flex",
                alignItems: "center",
                padding: "10px 18px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.04)",
                color: "#e5e7eb",
                fontSize: 20,
                fontWeight: 600,
                letterSpacing: 0.4,
              }}
            >
              {b}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
