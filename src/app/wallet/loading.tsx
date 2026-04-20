import {
  SkeletonBlock,
  SkeletonCard,
  SkeletonLine,
  SkeletonPage,
} from "@/components/ui/Skeleton";

export default function WalletLoading() {
  return (
    <SkeletonPage>
      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <div className="space-y-6">
          {/* Balance hero. POLISH-313: no animate-pulse on this
              outer card — every SkeletonBlock inside already has
              its own animate-pulse, and a pulse on the parent
              compounds with the children's pulses to create a
              double-time flicker (parent opacity + child opacity
              modulate independently). Every *other* skeleton card
              in wallet/loading.tsx already follows this rule
              (SkeletonCard, the tokens list, the activity feed
              strip below). This one was the outlier. */}
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <SkeletonLine className="w-24" />
                <SkeletonBlock className="h-14 mt-3 w-2/3 max-w-sm" />
                <SkeletonLine className="mt-3 w-12" />
              </div>
              <div className="hidden md:block text-right">
                <SkeletonLine className="w-16 mb-2 ml-auto" />
                <SkeletonLine className="w-40 ml-auto" />
              </div>
            </div>
            <div className="mt-6 grid grid-cols-4 gap-2 md:gap-3">
              {Array.from({ length: 4 }, (_, i) => (
                <SkeletonBlock key={i} className="h-[72px] rounded-xl" />
              ))}
            </div>
          </div>

          {/* Action tab panel placeholder */}
          <SkeletonCard>
            <div className="flex items-center justify-between mb-3">
              <div className="flex-1">
                <SkeletonLine className="w-20" />
                <SkeletonBlock className="h-5 mt-2 w-40" />
              </div>
              <SkeletonBlock className="h-6 w-14 rounded-full" />
            </div>
            <SkeletonBlock className="h-10 mt-4 mb-3 w-full rounded-md" />
            <SkeletonBlock className="h-11 w-full rounded-xl" />
          </SkeletonCard>

          {/* Tokens list */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02]">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
              <SkeletonLine className="w-16" />
              <SkeletonLine className="w-28" />
            </div>
            <ul className="divide-y divide-white/5">
              {Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-4">
                  <SkeletonBlock className="h-10 w-10 rounded-xl" />
                  <div className="flex-1">
                    <SkeletonLine className="w-16" />
                    <SkeletonLine className="w-28 mt-2" />
                  </div>
                  <SkeletonLine className="w-20" />
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right column — activity feed */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <SkeletonLine className="w-32" />
            <SkeletonLine className="w-14" />
          </div>
          <ul className="divide-y divide-white/5">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="px-4 py-3 flex items-start gap-3">
                <SkeletonBlock className="h-8 w-8 rounded-lg" />
                <div className="flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <SkeletonLine className="w-28" />
                    <SkeletonLine className="w-10" />
                  </div>
                  <div className="flex items-baseline justify-between gap-2 mt-2">
                    <SkeletonLine className="w-16" />
                    <SkeletonLine className="w-20" />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SkeletonPage>
  );
}
