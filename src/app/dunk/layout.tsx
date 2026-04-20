import type { Metadata } from "next";

const TITLE = "LiveWager · Dunk — Tilt. Pour. Don't spill.";
const DESC =
  "A 20-second skill game played with your phone's gyroscope. $3 per round. Top score on the hour drops the talent live, on camera. 10% feeds an hourly pot, 10% feeds a weekly progressive.";

// Page-level metadata. No metadataBase / robots override — those live
// on the root layout (env-driven SITE_URL + app-wide crawler block for
// the demo phase) so there's a single source of truth.
//
// `title.absolute` keeps the verbose TITLE intact for this headline
// route instead of going through the root's "%s · Dunk" template.
// Other routes use the bare string so the template fills in.
export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: "/dunk" },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "/dunk",
    siteName: "LiveWager",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESC,
    images: ["/opengraph-image"],
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
