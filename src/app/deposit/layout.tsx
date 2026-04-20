import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deposit",
  description:
    "Fund your non-custodial LWP balance. Litecoin is live in demo mode; card + bank rails arriving.",
};

export default function DepositLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
