import type { Metadata } from "next";

const TITLE = "Play";
const DESC =
  "Play Stacker. Slide, tap, lock — reach the top floor for a 3× demo prize. Non-custodial LWP wallet, ICRC-1 on the Internet Computer.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/play" },
  openGraph: {
    title: `${TITLE} · Stacker`,
    description: DESC,
    url: "/play",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} · Stacker`,
    description: DESC,
    images: ["/opengraph-image"],
  },
};

export default function PlayLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
