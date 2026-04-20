import type { Metadata } from "next";

const TITLE = "Stacker";
const DESC =
  "Fifteen rows. A sliding block. One tap to lock. Miss the window and the stack narrows. Reach the top for a 3× demo prize. Non-custodial LWP on the Internet Computer.";

// `title` uses the bare string so the root layout's "%s · Stacker"
// template fills in automatically. OG copy uses the full title for
// share previews where the template doesn't apply.
export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: "/stacker" },
  openGraph: {
    title: TITLE,
    description: DESC,
    url: "/stacker",
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

export default function StackerLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
