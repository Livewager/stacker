"use client";

/**
 * Shared top nav for non-game routes (/account, /wallet, /deposit, …).
 * Carries the logo, primary-route tabs, and the live wallet pill.
 *
 * Notes:
 *  - /dunk has its own in-page hero nav; this component is not mounted
 *    there. Check each route's page for whether it renders <AppHeader/>.
 *  - Active tab = exact pathname match OR prefix match (so /deposit?via=x
 *    and /wallet/any-subroute still highlight).
 *  - Focus rings: every interactive element uses ring-cyan-300 on focus
 *    to match the rest of the theme.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletNav } from "@/components/dunk/WalletNav";

type Tab = { href: string; label: string };

const TABS: Tab[] = [
  { href: "/play", label: "Play" },
  { href: "/wallet", label: "Wallet" },
  { href: "/deposit", label: "Deposit" },
  { href: "/send", label: "Send" },
  { href: "/withdraw", label: "Withdraw" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/account", label: "Account" },
];

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}

export default function AppHeader() {
  const pathname = usePathname() || "";
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 md:px-8">
        <Link
          href="/dunk"
          aria-label="Livewager · Dunk home"
          className="inline-flex items-center shrink-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/logo43.png"
            alt="Livewager · Dunk"
            width={200}
            height={64}
            style={{ height: 40, width: "auto", objectFit: "contain" }}
          />
        </Link>

        <nav
          aria-label="Primary"
          className="hidden md:flex items-stretch gap-1 ml-4 text-sm"
        >
          {TABS.map((t) => {
            const active = isActive(pathname, t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={[
                  "relative inline-flex items-center rounded-md px-3 py-1.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70",
                  active
                    ? "text-white"
                    : "text-gray-300 hover:text-white hover:bg-white/5",
                ].join(" ")}
              >
                {t.label}
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-3 right-3 -bottom-[7px] h-[2px] rounded-full"
                    style={{ background: "linear-gradient(90deg,#22d3ee,#0891b2)" }}
                  />
                )}
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
