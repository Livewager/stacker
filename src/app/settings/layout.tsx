import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
  description:
    "Device-local preferences: sound, haptics, reduced motion, session cap, data reset.",
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
