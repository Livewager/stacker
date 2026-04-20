"use client";

/**
 * Real scannable QR for the LTC watch address. Unlike QRPlaceholder
 * (decorative), this renders an actual `litecoin:` BIP-21 URI so a
 * phone camera or LTC wallet can open it directly.
 *
 * Still labeled DEMO — the underlying address is the demo watch
 * string, not a real mainnet address — so scanning won't credit
 * anything real. The QR itself is functional; the address is not.
 *
 * Uses the already-installed `qrcode` package (same dep as
 * PrincipalQR). Canonical dark-on-white fill: while scanners
 * nominally handle inverted schemes, outdoor phone-camera auto-
 * exposure on a shiny screen + the canonical calibration of iOS
 * Camera / LTC wallet scanners means dark-on-light lands a scan
 * first-try more reliably. The parent card provides the dark
 * frame around it (p-3 + bg-white/[0.02]) so the page theme
 * integrity holds.
 */

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Props = {
  address: string;
  size?: number;
  className?: string;
};

export function WatchAddressQR({ address, size = 224, className = "" }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    setError(null);
    // BIP-21 URI so mobile wallets open directly to "send" prefilled
    // with this address. The label hints the UX to the wallet app.
    const uri = `litecoin:${address}?label=LiveWager%20Demo%20Watch`;
    QRCode.toDataURL(uri, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: size * 2, // render at 2x for crisp retina; <img> scales down
      color: {
        // Canonical dark-on-light: matches what every LTC wallet +
        // iOS Camera is calibrated against, scans robustly under
        // sunlight / high ambient light. #0a0a0a instead of pure
        // #000000 keeps the black from reading as a punch-out
        // rectangle against a bright white field.
        dark: "#0a0a0a",
        light: "#ffffff",
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
  }, [address, size]);

  return (
    <div
      className={className}
      style={{ width: size, height: size }}
      aria-label={`QR code encoding Litecoin address ${address}`}
      role="img"
    >
      {error ? (
        <div className="w-full h-full grid place-items-center text-xs text-red-300 text-center px-3 rounded-xl bg-[#020b18]">
          Couldn&apos;t generate QR: {error}
        </div>
      ) : dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={dataUrl}
          alt=""
          width={size}
          height={size}
          style={{ display: "block", imageRendering: "pixelated" }}
          className="rounded-xl"
        />
      ) : (
        <div className="w-full h-full animate-pulse bg-white/5 rounded-xl" />
      )}
    </div>
  );
}
