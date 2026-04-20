import type { Metadata } from "next";

const TITLE = "Play";
const DESC =
  "Pick a game. Tilt Pour (gyroscope) or Stacker (arcade). Non-custodial LWP wallet across both, ICRC-1 on the Internet Computer.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/play" },
  openGraph: {
    title: `${TITLE} · Dunk`,
    description: DESC,
    url: "/play",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} · Dunk`,
    description: DESC,
    images: ["/opengraph-image"],
  },
};

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
