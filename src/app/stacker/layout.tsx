import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stacker — Livewager",
  description: "Tap to stack. Perfect stacks unlock the top.",
};

export default function StackerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
