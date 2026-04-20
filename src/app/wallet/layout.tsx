import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Wallet",
  description:
    "Your non-custodial ICRC-1 points balance, buy + deposit rails, and recent ledger activity.",
};

export default function WalletLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
