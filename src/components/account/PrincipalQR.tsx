"use client";

/**
 * Opt-in QR view for a principal. Renders the raw principal string as
 * a QR code so another Stacker/Dunk user can point their camera at it
 * to paste it into /send without typing.
 *
 * Uses the `qrcode` package (MIT, ~30KB gzipped). The QR is rendered
 * client-side into an <img> data-URL; no asset file generated.
 *
 * Collapsed by default — the principal is not itself sensitive, but
 * pocket-cameras don't need to see it unless asked. Toggle opens the
 * panel with an animation and regenerates the QR on open.
 */

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/Button";
import { shortenPrincipal } from "@/lib/principal";

type Props = {
  principal: string;
};

export function PrincipalQR({ principal }: Props) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  // Generate an SVG string fresh on click, wrap in a Blob, and trigger
  // a download via a synthesized <a>. Kept outside the render effect
  // so it only runs when the user actually asks — saves a second
  // encoder call on every panel open. Filename includes a short
  // principal prefix so multiple saves stay distinguishable.
  //
  // iOS Safari caveat: <a download> on blob URLs is ignored on iOS
  // ≤ 15 and inconsistent on 16+ for SVG (often navigates to the
  // blob URL, stranding the user). Detect iOS and open in a new tab
  // instead — the user then long-presses to "Save to Files" or
  // "Save Image". Desktop + Android keep the native-download fast
  // path, which is one tap.
  const downloadSvg = async () => {
    if (!principal || downloading) return;
    setDownloading(true);
    try {
      const svg = await QRCode.toString(principal, {
        type: "svg",
        errorCorrectionLevel: "M",
        margin: 1,
        width: 512,
        color: {
          dark: "#0a0a0a", // darker for print — the dark-on-dark UI theme
          light: "#ffffff", // would be illegible on paper.
        },
      });
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      // Identity tag for the filename. Uses shortenPrincipal's
      // head/tail shape (xkwrr-q77fr…-qaaaq-cai → "xkwrr-q77fr-aaaq-cai")
      // so the file is recognisable on disk even when a user has
      // saved QRs from multiple identities. ASCII-safe: principals
      // are already [a-z0-9-] so no filesystem escaping needed; just
      // swap the ellipsis for a plain dash separator.
      //
      // POLISH-386 audit: full filename is `livewager-principal-${tag}.svg`
      // = 21 + 11 + 4 = 36 chars. iOS Safari's share-sheet preview
      // truncates at ~32 chars, so on iPhone this could mid-ellipsis.
      // But the iOS branch below (isIOS) uses window.open not
      // <a download>, so iOS never reads this filename — the user
      // long-presses the rendered SVG and the OS uses its own
      // default name. The filename only ships to desktop + Android,
      // both of which handle 36 chars cleanly in Finder / Files
      // preview. If a future refactor unifies the paths, shrink
      // the tag to head:4 tail:3 (30 chars total) before that lands.
      const tag = shortenPrincipal(principal, { head: 6, tail: 4, ellipsis: "-" });
      // iOS / iPadOS / iPhone detection. Modern iPads identify as Mac
      // in userAgent, so also probe for maxTouchPoints > 1 — the
      // idiomatic "iPad in desktop mode" sniff.
      const ua = navigator.userAgent || "";
      const isIOS =
        /iPhone|iPad|iPod/.test(ua) ||
        (ua.includes("Mac") &&
          typeof navigator.maxTouchPoints === "number" &&
          navigator.maxTouchPoints > 1);
      if (isIOS) {
        // Open in a new tab; user long-presses the rendered SVG to
        // save. _blank + noopener so we don't leak window.opener.
        window.open(url, "_blank", "noopener,noreferrer");
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const a = document.createElement("a");
        a.href = url;
        a.download = `livewager-principal-${tag}.svg`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Revoke after a beat so the browser can actually fetch the href.
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    if (!principal) return;
    let cancelled = false;
    setError(null);
    QRCode.toDataURL(principal, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 240,
      color: {
        // Light-on-dark to match the app theme. QR scanners handle it.
        dark: "#e6f6fb",
        light: "#020b18",
      },
    })
      .then((url: string) => {
        if (!cancelled) setDataUrl(url);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, principal]);

  if (!principal) return null;

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="principal-qr-panel"
      >
        {open ? "Hide QR" : "Show QR"}
      </Button>

      {open && (
        // POLISH-290 mobile width. Container math on a 320px viewport:
        // page px-4 (32) → max-w-3xl card (288) → profile p-5 (40)
        // → 248 inner → this panel's p-3 (24) → 224 inner. A fixed
        // 240×240 QR + 240-wide principal text box used to overflow
        // that budget by ~16–24px. Fix: size the QR wrapper to
        // min(240px, 100%) so the cam-needed pixels stay close to
        // 240 on viewports that have room, and shrink gracefully
        // on narrow ones. Drop panel padding 4→3 to reclaim 8px
        // of width for the QR itself. Principal caption matches
        // the wrapper width so the break-all wrapping respects
        // the same envelope.
        <div
          id="principal-qr-panel"
          className="lw-reveal mt-3 rounded-xl border border-white/10 bg-black/40 p-3 flex flex-col items-center"
        >
          <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-3">
            Scan to send
          </div>
          <div
            className="rounded-lg overflow-hidden border border-white/10 bg-[#020b18] w-full aspect-square"
            style={{ maxWidth: 240 }}
          >
            {error ? (
              <div className="w-full h-full grid place-items-center text-xs text-red-300 text-center px-3">
                Couldn&apos;t generate QR: {error}
              </div>
            ) : dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dataUrl}
                alt={`QR code for ${principal}`}
                width={240}
                height={240}
                style={{
                  display: "block",
                  width: "100%",
                  height: "100%",
                  imageRendering: "pixelated",
                }}
              />
            ) : (
              <div className="w-full h-full animate-pulse bg-white/5" />
            )}
          </div>
          <div
            className="mt-3 text-[11px] font-mono text-gray-400 break-all text-center"
            style={{ maxWidth: 240, width: "100%" }}
          >
            {principal}
          </div>
          <div className="mt-2 text-[10px] uppercase tracking-widest text-gray-500">
            Raw principal · safe to share
          </div>
          {/* SVG download — vector so it scales without artifacts for
              print/handoff, 512×512 viewbox, dark-on-light so it
              remains legible on paper. */}
          <div className="mt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={downloadSvg}
              disabled={downloading}
              aria-label="Download QR as SVG"
            >
              {downloading ? "Generating…" : "Download SVG"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
