import Image from "next/image";
import Link from "next/link";

/**
 * Minimal header + footer for the Dunk app. No auth, no nav dropdowns —
 * just the logo and a spacious dark shell so the game has the hero slot.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center px-5 py-3 md:px-8">
        <Link href="/dunk" aria-label="Dunk home" className="inline-flex items-center">
          <Image
            src="/assets/logo43.png"
            alt="Livewager"
            width={320}
            height={104}
            priority
            style={{ height: "auto", width: "auto", maxHeight: 104 }}
          />
        </Link>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/10 py-10">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-4 px-5 md:px-8">
        <Image
          src="/assets/logo43.png"
          alt="Livewager"
          width={440}
          height={144}
          style={{ height: "auto", width: "auto", maxHeight: 144, objectFit: "contain" }}
        />
        <div className="text-xs text-white/50">
          © {new Date().getFullYear()} Livewager · Dunk
        </div>
      </div>
    </footer>
  );
}
