import type { Metadata } from "next";
import { WalletProvider } from "@/components/dunk/WalletContext";
import { ToastHost } from "@/components/dunk/Toast";

export const metadata: Metadata = {
  title: "Stacker — Livewager",
  description: "Tap to stack. Perfect stacks unlock the top.",
};

export default function StackerLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastHost>
      <WalletProvider>{children}</WalletProvider>
    </ToastHost>
  );
}
