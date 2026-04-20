import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Send",
  description:
    "Peer-to-peer LWP transfer signed by your Internet Identity. Real ICRC-1 ledger call.",
};

export default function SendLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
