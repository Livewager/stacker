"use client";

/**
 * Last-resort error boundary. Invoked when the root layout itself
 * fails to render. This replaces the entire document, so we MUST
 * emit our own <html> and <body> and can't assume Tailwind loaded —
 * every style here is inline.
 *
 * Keep it dependency-free and tiny; anything fancy risks also
 * crashing and leaving the user on a blank page.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[stacker] global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#020b18",
          color: "#f5f5f5",
          fontFamily:
            "Satoshi, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: 540 }}>
          <div
            aria-hidden
            style={{
              width: 80,
              height: 80,
              margin: "0 auto 20px",
              borderRadius: 999,
              background:
                "radial-gradient(circle at 40% 40%, rgba(248,113,113,0.35), rgba(248,113,113,0.1) 60%, transparent 70%)",
            }}
          />
          <div
            style={{
              fontSize: 11,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: "#f87171",
              marginBottom: 10,
            }}
          >
            Fatal · layout failure
          </div>
          <h1
            style={{
              fontSize: "clamp(28px, 4vw, 40px)",
              lineHeight: 1.1,
              fontWeight: 900,
              margin: "0 0 10px",
              letterSpacing: "-0.01em",
            }}
          >
            The app couldn&apos;t boot.
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#c9d1d9",
              margin: "0 auto 24px",
              maxWidth: 440,
              lineHeight: 1.5,
            }}
          >
            Something crashed in the layout. Your ledger balance and Internet
            Identity are unaffected. Try reloading.
          </p>
          <div
            style={{
              display: "inline-flex",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <button
              onClick={() => reset()}
              style={{
                background: "linear-gradient(90deg,#22d3ee,#0891b2)",
                color: "#000",
                fontWeight: 800,
                border: 0,
                borderRadius: 12,
                padding: "10px 18px",
                cursor: "pointer",
              }}
            >
              Reload
            </button>
            <a
              href="/stacker"
              style={{
                color: "#e5e7eb",
                border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 12,
                padding: "10px 16px",
                textDecoration: "none",
              }}
            >
              Go home
            </a>
          </div>
          {(error.message || error.digest) && (
            <pre
              style={{
                marginTop: 24,
                fontFamily: "ui-monospace, Menlo, monospace",
                fontSize: 11,
                color: "#9ca3af",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                paddingTop: 16,
                textAlign: "left",
              }}
            >
              {error.message ? `message: ${error.message}\n` : ""}
              {error.digest ? `digest: ${error.digest}` : ""}
            </pre>
          )}
        </div>
      </body>
    </html>
  );
}
