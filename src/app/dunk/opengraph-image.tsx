import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "LiveWager · Dunk — Tilt. Pour. Don't spill.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 80,
          backgroundColor: "#05070d",
          backgroundImage:
            "radial-gradient(circle at 15% 5%, rgba(34,211,238,0.35), transparent 55%), radial-gradient(circle at 90% 95%, rgba(96,165,250,0.28), transparent 50%), radial-gradient(circle at 50% 50%, rgba(167,139,250,0.18), transparent 60%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        {/* Top row: brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 900,
              fontSize: 32,
              color: "white",
              backgroundImage: "linear-gradient(135deg, #22d3ee, #2563eb)",
            }}
          >
            L
          </div>
          <div style={{ fontSize: 34, fontWeight: 900, letterSpacing: -0.5, display: "flex" }}>
            LiveWager
            <span style={{ color: "#22d3ee" }}>·Dunk</span>
          </div>
        </div>

        {/* Middle: headline + chip */}
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              alignSelf: "flex-start",
              gap: 10,
              padding: "8px 16px",
              borderRadius: 999,
              backgroundColor: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(34,211,238,0.35)",
              fontSize: 18,
              letterSpacing: 2,
              textTransform: "uppercase",
              color: "#d1d5db",
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                backgroundColor: "#22d3ee",
                display: "flex",
              }}
            />
            Live · 20-second rounds · $3 each
          </div>

          <div
            style={{
              fontSize: 118,
              fontWeight: 900,
              lineHeight: 0.98,
              letterSpacing: -4,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ display: "flex" }}>Tilt.</div>
            <div
              style={{
                display: "flex",
                backgroundImage: "linear-gradient(135deg, #22d3ee, #60a5fa, #a78bfa)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              Pour.
            </div>
            <div style={{ display: "flex" }}>Don&apos;t spill.</div>
          </div>

          <div
            style={{
              display: "flex",
              fontSize: 22,
              color: "#cbd5e1",
              maxWidth: 820,
              lineHeight: 1.35,
            }}
          >
            Steadiest hand on the hour drops the talent. Live, on camera.
          </div>
        </div>

        {/* Bottom row: URL + rails */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            color: "#9ca3af",
          }}
        >
          <div style={{ display: "flex" }}>livewager.io/dunk</div>
          <div style={{ display: "flex", gap: 24 }}>Hourly drop · Weekly progressive</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
