import type { Metadata } from "next";

const TITLE = "LiveWager · Dunk — Tilt. Pour. Don't spill.";
const DESC =
  "A 20-second skill game played with your phone's gyroscope. $3 per round. Top score on the hour drops the talent live, on camera. 10% feeds an hourly pot, 10% feeds a weekly progressive.";

export const metadata: Metadata = {
  metadataBase: new URL("https://livewager.io"),
  title: TITLE,
  description: DESC,
  robots: { index: false, follow: false },
  alternates: { canonical: "/dunk" },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "/dunk",
    siteName: "LiveWager",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
  },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "LiveWager · Dunk",
  url: "https://livewager.io/dunk",
  description: DESC,
  potentialAction: {
    "@type": "SearchAction",
    target: "https://livewager.io/dunk?q={search_term_string}",
    "query-input": "required name=search_term_string",
  },
};

export default function DunkLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      {children}
    </>
  );
}
