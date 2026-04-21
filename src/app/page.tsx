"use client";

/**
 * Root page. On Vercel / dev the next.config redirect sends "/" to
 * "/play" before this ever renders. Under IC static export that
 * redirect is gone (assets canister can't run it), so this client
 * component handles the jump instead.
 *
 * Kept intentionally minimal — no data, no layout — so the bounce
 * is instant on slow connections.
 */
import { useEffect } from "react";
import Link from "next/link";

export default function RootPage() {
  useEffect(() => {
    window.location.replace("/play");
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-gray-400 text-sm">
      <Link href="/play" className="underline underline-offset-2">
        Continue to /play
      </Link>
    </div>
  );
}
