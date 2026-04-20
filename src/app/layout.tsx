import "@/css/satoshi.css";
import "@/css/style.css";
import type { Metadata, Viewport } from "next";
import AppShell from "@/components/AppShell";

/**
 * Root metadata. `metadataBase` is required for relative OG/Twitter
 * image URLs to resolve to absolute URLs when a crawler visits.
 *
 * We don't yet know the production origin, so:
 *   - use NEXT_PUBLIC_SITE_URL when it's set (Vercel previews, prod)
 *   - fall back to the dev port locally so cURL + scrapers still get
 *     working absolute URLs
 */
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://stacker.local"
    : "http://localhost:3002");

const OG_TITLE = "Stacker · Stack to the top.";
const OG_DESCRIPTION =
  "A 30-second arcade skill game. Slide, tap, lock. Non-custodial LWP wallet, ICRC-1 points on the Internet Computer.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Stacker",
    // Each page's metadata.title ('Wallet', 'Account', ...) slots into
    // this template so the browser tab always reads "<page> · Stacker".
    template: "%s · Stacker",
  },
  description: OG_DESCRIPTION,
  applicationName: "Stacker",
  keywords: [
    "livewager",
    "stacker",
    "arcade",
    "skill game",
    "icp",
    "icrc-1",
    "internet computer",
    "lwp",
    "points",
  ],
  authors: [{ name: "Livewager" }],
  creator: "Livewager",
  publisher: "Livewager",
  // Block robots while we're in demo mode. Flip when a real deploy ships.
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Stacker",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    url: "/",
    locale: "en_US",
    // Next's file-based OG image (src/app/opengraph-image.tsx) is
    // auto-added here; keep explicit fallback for crawlers that prefer
    // an absolute asset URL.
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Stacker — stack to the top.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
    creator: "@livewager",
    images: ["/opengraph-image"],
  },
  icons: {
    icon: [{ url: "/assets/logo43.png", type: "image/png" }],
    apple: [{ url: "/assets/logo43.png", type: "image/png" }],
    shortcut: ["/assets/logo43.png"],
  },
  category: "games",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#020b18" },
    { media: "(prefers-color-scheme: light)", color: "#020b18" },
  ],
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  // NOTE: maximumScale + userScalable were previously 1/false to keep
  // the "app-like" feel on iOS. That's a WCAG 2.0 AA violation (1.4.4
  // Resize text — users with low vision need pinch-to-zoom). Dropped.
  // The Stacker canvas game is the only surface where zoom would be
  // awkward, and its touch-action: manipulation handler already
  // prevents gesture conflicts with double-tap-zoom.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-background text-white antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
