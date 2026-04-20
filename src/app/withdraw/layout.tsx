import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Withdraw",
  description:
    "Burn LWP on-ledger and queue an LTC payout. The burn is real; the Litecoin leg is mocked in demo mode.",
};

export default function WithdrawLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
