import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Account",
  description:
    "Your Internet Identity profile, principal, balance and on-ledger activity.",
};

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
