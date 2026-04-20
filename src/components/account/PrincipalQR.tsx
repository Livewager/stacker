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
      const a = document.createElement("a");
      const tag = principal.slice(0, 6);
      a.href = url;
      a.download = `principal-${tag}.svg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after a beat so the browser can actually fetch the href.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
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
        <div
          id="principal-qr-panel"
          className="lw-reveal mt-3 rounded-xl border border-white/10 bg-black/40 p-4 flex flex-col items-center"
        >
          <div className="text-[10px] uppercase tracking-widest text-cyan-300 mb-3">
            Scan to send
          </div>
          <div className="rounded-lg overflow-hidden border border-white/10 bg-[#020b18]">
            {error ? (
              <div className="w-[240px] h-[240px] grid place-items-center text-xs text-red-300 text-center px-3">
                Couldn&apos;t generate QR: {error}
              </div>
            ) : dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={dataUrl}
                alt={`QR code for ${principal}`}
                width={240}
                height={240}
                style={{ display: "block", imageRendering: "pixelated" }}
              />
            ) : (
              <div className="w-[240px] h-[240px] animate-pulse bg-white/5" />
            )}
          </div>
          <div className="mt-3 text-[11px] font-mono text-gray-400 break-all max-w-[240px] text-center">
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
