"use client";

/**
 * Wraps every route with the shared client-only providers:
 *   - ToastHost (custom toast stack)
 *   - WalletProvider (II session, balance, buy/deposit actions)
 *
 * Living in its own client component keeps the root layout a server
 * component, which keeps the HTML shell cacheable and lets us export
 * Metadata from route layouts without "use client" poisoning them.
 */

import type { ReactNode } from "react";
import { ToastHost } from "@/components/dunk/Toast";
import { WalletProvider } from "@/components/dunk/WalletContext";
import { BottomNav } from "@/components/BottomNav";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastHost>
      <WalletProvider>
        {children}
        <BottomNav />
      </WalletProvider>
    </ToastHost>
  );
}
