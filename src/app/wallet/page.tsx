"use client";

/**
 * /wallet — redirect to /account.
 *
 * The wallet UI was merged into /account so we have one canonical
 * "your money + your principal + your activity" page rather than
 * two overlapping ones. This page stays as a redirect so old
 * bookmarks, in-app links from cards/banners, and any external
 * references don't 404.
 *
 * Static-export friendly: useEffect window.location.replace runs
 * client-side after mount, so the assets canister doesn't need a
 * runtime redirect rule. A visible link beneath gives the user a
 * manual fallback if JS is disabled or the redirect is blocked.
 */

import { useEffect } from "react";
import Link from "next/link";
import { ROUTES } from "@/lib/routes";

export default function WalletRedirect() {
  useEffect(() => {
    window.location.replace(ROUTES.account);
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-gray-400 text-sm">
      <Link href={ROUTES.account} className="underline underline-offset-2">
        Continue to /account
      </Link>
    </div>
  );
}
