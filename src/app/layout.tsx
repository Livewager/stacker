import "@/css/satoshi.css";
import "@/css/style.css";
import type { Metadata } from "next";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Dunk",
  description: "Steady Pour — a 20-second tilt game.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, user-scalable=no" />
      </head>
      <body className="bg-background text-white antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
