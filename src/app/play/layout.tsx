import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Play",
  description:
    "Pick a game. Tilt Pour (gyroscope) or Stacker (arcade). Non-custodial LWP across both.",
};

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
