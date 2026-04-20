"use client";

/**
 * QR scanner for the recipient principal on /send. Opens a
 * BottomSheet with a live camera preview and polls BarcodeDetector
 * a few times a second until it sees a QR; the decoded text is
 * piped back via onResult and the sheet closes.
 *
 * Hard requirements kept minimal:
 *  - BarcodeDetector must exist (Chrome/Edge/Samsung; Safari 17+).
 *    Safari pre-17 and Firefox fall through to a graceful toast.
 *  - camera permission must be granted. If denied we surface a
 *    contextual error and keep the sheet open so the user can retry.
 *
 * Nothing is uploaded. The video element renders locally; we only
 * push back the decoded string.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/shared/Toast";

// BarcodeDetector isn't in lib.dom yet on older TS targets. Narrow
// the surface we need here so strict mode is happy.
type BarcodeDetectorConstructor = new (opts?: {
  formats?: string[];
}) => {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>;
};

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor };
  return w.BarcodeDetector ?? null;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onResult: (value: string) => void;
};

export function PrincipalScanner({ open, onClose, onResult }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setScanning(false);
  }, []);

  useEffect(() => {
    if (!open) {
      stop();
      return;
    }

    const Ctor = getBarcodeDetector();
    if (!Ctor) {
      setError(
        "Your browser doesn't ship the BarcodeDetector API yet. Paste the principal manually for now.",
      );
      toast.push({
        kind: "warning",
        title: "Scanner unsupported",
        description: "Paste the principal manually — we'll wire a JS fallback later.",
      });
      return;
    }

    let cancelled = false;
    setError(null);

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play().catch(() => {
            /* some browsers require interaction; playsInline handles most */
          });
        }
        setScanning(true);

        const detector = new Ctor({ formats: ["qr_code"] });
        let lastCheck = 0;

        const tick = (t: number) => {
          if (cancelled) return;
          if (!videoRef.current || videoRef.current.readyState < 2) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
          // Throttle detections to ~5 Hz so we don't cook the decoder
          // on a 120Hz display.
          if (t - lastCheck > 180) {
            lastCheck = t;
            detector
              .detect(videoRef.current)
              .then((codes) => {
                const hit = codes.find((c) => c.rawValue && c.rawValue.length > 0);
                if (hit) {
                  onResult(hit.rawValue.trim());
                  stop();
                }
              })
              .catch(() => {
                /* transient detector failure; keep scanning */
              });
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        const msg = (e as Error).message || "camera unavailable";
        setError(`Camera access denied: ${msg}`);
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
    // Intentionally only rerun on `open`; onResult/stop/toast are stable enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Scan recipient QR"
      description="Aim the back camera at a principal QR. Nothing is uploaded — we only read the code and paste it for you."
    >
      <div className="relative aspect-square rounded-xl overflow-hidden border border-white/10 bg-black">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          muted
          playsInline
          aria-label="Back camera QR scanner preview"
        />
        {/* Corner reticle to suggest framing */}
        <svg
          viewBox="0 0 100 100"
          aria-hidden
          className="absolute inset-0 w-full h-full pointer-events-none"
          preserveAspectRatio="xMidYMid slice"
        >
          {[
            [6, 6, 16, 6, 6, 16],
            [94, 6, 84, 6, 94, 16],
            [6, 94, 16, 94, 6, 84],
            [94, 94, 84, 94, 94, 84],
          ].map(([x, y, x2, y2, x3, y3], i) => (
            <path
              key={i}
              d={`M ${x2} ${y2} L ${x} ${y} L ${x3} ${y3}`}
              fill="none"
              stroke="rgba(34,211,238,0.85)"
              strokeWidth={1.2}
              strokeLinecap="round"
            />
          ))}
        </svg>
        {scanning && (
          <div className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-[10px] uppercase tracking-widest text-cyan-300 font-mono backdrop-blur">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-300 animate-pulse" />
            Scanning
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {error}
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </BottomSheet>
  );
}
