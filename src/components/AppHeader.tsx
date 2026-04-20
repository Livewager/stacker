"use client";

/**
 * Shared top nav for non-game routes (/account, /wallet, /deposit, …).
 * Carries the logo, primary-route tabs, and the live wallet pill.
 * The /dunk route has its own in-page nav, so we don't use this there.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletNav } from "@/components/dunk/WalletNav";

const TABS: { href: string; label: string }[] = [
  { href: "/play", label: "Play" },
  { href: "/wallet", label: "Wallet" },
  { href: "/deposit", label: "Deposit" },
  { href: "/account", label: "Account" },
];

export default function AppHeader() {
  const pathname = usePathname() || "";
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 md:px-8">
        <Link href="/dunk" aria-label="Livewager · Dunk home" className="inline-flex items-center shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logo43.png"
            alt="Livewager · Dunk"
            width={320}
            height={104}
            style={{ height: 64, width: "auto", objectFit: "contain" }}
          />
        </Link>
        <nav
          aria-label="Primary"
          className="hidden md:flex items-center gap-1 ml-4 text-sm"
        >
          {TABS.map((t) => {
            const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-md px-3 py-1.5 transition ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-gray-300 hover:text-white hover:bg-white/5"
                }`}
                aria-current={active ? "page" : undefined}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto">
          <WalletNav />
        </div>
      </div>
    </header>
  );
}
