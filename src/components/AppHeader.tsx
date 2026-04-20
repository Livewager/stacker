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
import Image from "next/image";
import { usePathname } from "next/navigation";
import { WalletNav } from "@/components/dunk/WalletNav";
import { ROUTES } from "@/lib/routes";

type Tab = { href: string; label: string };

const TABS: Tab[] = [
  { href: ROUTES.play, label: "Play" },
  { href: ROUTES.wallet, label: "Wallet" },
  { href: ROUTES.deposit, label: "Deposit" },
  { href: ROUTES.send, label: "Send" },
  { href: ROUTES.withdraw, label: "Withdraw" },
  { href: ROUTES.leaderboard, label: "Leaderboard" },
  { href: ROUTES.account, label: "Account" },
  { href: ROUTES.settings, label: "Settings" },
];

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  return pathname.startsWith(href + "/");
}

export default function AppHeader() {
  const pathname = usePathname() || "";
  // Mobile breadcrumb: first matching tab wins. Desktop shows the
  // full tab strip so this label stays hidden at md+.
  const activeTab = TABS.find((t) => isActive(pathname, t.href));
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 md:px-8">
        <Link
          href={ROUTES.dunk}
          aria-label="Livewager · Dunk home"
          className="inline-flex items-center shrink-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
        >
          <Image
            src="/assets/logo43.png"
            alt="Livewager · Dunk"
            width={200}
            height={64}
            priority
            sizes="200px"
            style={{ height: 40, width: "auto", objectFit: "contain" }}
          />
        </Link>

        {/* Mobile-only active-tab breadcrumb. Slash glyph + cyan label
            so the user always knows where they are without a visible
            tab strip. Desktop hides it (md:hidden) since the full
            tab row carries the same information. */}
        {activeTab && (
          <div
            className="md:hidden flex items-baseline gap-1.5 text-[11px] uppercase tracking-widest min-w-0 truncate"
            aria-hidden
          >
            <span className="text-gray-600">/</span>
            <span className="text-cyan-300 font-semibold truncate">
              {activeTab.label}
            </span>
          </div>
        )}

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
