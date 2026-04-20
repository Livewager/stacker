/**
 * Tiny server-component-safe skeleton primitives.
 *
 * No client hooks, no motion libs — just Tailwind's built-in
 * `animate-pulse` on a muted bg. Consistent radius / tints across
 * every loading.tsx so the whole app's loading state looks like
 * one thing, not fourteen things.
 *
 * Reduced motion
 * --------------
 * The pulse is frozen to a static dim tint when either the OS
 * prefers-reduced-motion query matches, or the in-app "Reduce motion"
 * pref is on (mirrored onto html.lw-reduce-motion via AppShell). Rule
 * lives in src/css/style.css so these primitives stay hook-free and
 * SSR-friendly.
 *
 * Usage in a loading.tsx:
 *   <SkeletonCard><SkeletonLine className="w-1/3" /></SkeletonCard>
 */

import type { HTMLAttributes } from "react";

function cn(...parts: Array<string | false | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function SkeletonBlock({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-white/5",
        className,
      )}
      {...rest}
    />
  );
}

/** Single text line — pair with w-* to control width. */
export function SkeletonLine({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return <SkeletonBlock className={cn("h-3", className)} {...rest} />;
}

/** Section card wrapper that matches the real card styling everywhere. */
export function SkeletonCard({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "rounded-2xl border border-white/10 bg-white/[0.02] p-5 md:p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Circular avatar-ish shape. */
export function SkeletonAvatar({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <SkeletonBlock
      className={cn("rounded-full", className)}
      style={{ width: size, height: size }}
    />
  );
}

/** Stand-in for the shared AppHeader — matches its height so the
 *  jump from skeleton → real page is invisible. */
export function SkeletonHeader() {
  return (
    <header
      aria-hidden
      className="sticky top-0 z-40 border-b border-white/10 bg-background/85 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2.5 md:px-8">
        <SkeletonBlock className="h-10 w-32" />
        <div className="hidden md:flex items-center gap-1 ml-4">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonBlock key={i} className="h-6 w-16" />
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <SkeletonBlock className="h-8 w-24 rounded-full" />
          <SkeletonBlock className="h-8 w-24 rounded-lg" />
        </div>
      </div>
    </header>
  );
}

/** Page shell that stacks header + title + children; use on any
 *  loading.tsx that lives inside AppHeader-using routes. */
export function SkeletonPage({
  eyebrowWidth = "w-24",
  titleWidth = "w-2/3 max-w-md",
  children,
}: {
  eyebrowWidth?: string;
  titleWidth?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SkeletonHeader />
      {/* Plain <div>, not <main>. AppShell already emits the single
          document-level <main id="content"> (the SkipLink target);
          skeletons render inside that via Suspense/loading.tsx, so
          a nested <main> would both invalidate the HTML (spec: one
          non-hidden <main> per document) and — worse — shadow the
          outer <main>'s id resolution in some accessibility tree
          implementations. POLISH-276 audit found this across two
          sites (Skeleton + ErrorScaffold); both switched to div. */}
      <div className="mx-auto max-w-6xl px-4 md:px-8 py-8 md:py-12">
        <div className="mb-8">
          <SkeletonBlock className={cn("h-3", eyebrowWidth)} />
          <SkeletonBlock className={cn("h-9 mt-3", titleWidth)} />
          <SkeletonLine className="w-1/2 mt-3" />
        </div>
        {children}
      </div>
    </>
  );
}
