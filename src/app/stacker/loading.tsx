import {
  SkeletonBlock,
  SkeletonCard,
  SkeletonLine,
  SkeletonPage,
} from "@/components/ui/Skeleton";

/**
 * /stacker's real page renders its own header + title block, then
 * places the canvas game + wager side panel in a grid. The canvas
 * already has its own dynamic-import fallback (plain pulsing box),
 * but we can still reserve the wager/tips column so the whole page
 * doesn't jump when the client bundle boots.
 */
export default function StackerLoading() {
  return (
    <SkeletonPage>
      <div className="max-w-2xl mb-6">
        <SkeletonLine className="w-40" />
        <SkeletonBlock className="h-10 mt-3 w-3/4 max-w-sm" />
        <SkeletonLine className="w-full mt-3" />
        <SkeletonLine className="w-2/3 mt-2" />
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,560px)_1fr] items-start">
        {/* Game canvas reserve — matches aspect-[3/5] + max-w[560px]. */}
        <div className="mx-auto w-full max-w-[560px] aspect-[3/5] rounded-2xl border border-white/10 bg-white/[0.03] animate-pulse" />

        <div className="space-y-4">
          {/* Wager panel */}
          <SkeletonCard className="p-4 md:p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex-1">
                <SkeletonLine className="w-24" />
                <SkeletonLine className="w-full mt-2" />
                <SkeletonLine className="w-5/6 mt-1.5" />
              </div>
              <SkeletonBlock className="h-8 w-20 rounded-lg" />
            </div>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {Array.from({ length: 4 }, (_, i) => (
                <SkeletonBlock key={i} className="h-12 rounded-xl" />
              ))}
            </div>
            <div className="flex items-center justify-between">
              <SkeletonLine className="w-1/2" />
              <SkeletonBlock className="h-9 w-28 rounded-lg" />
            </div>
          </SkeletonCard>

          {/* Tip cards */}
          {Array.from({ length: 3 }, (_, i) => (
            <SkeletonCard key={i} className="p-4">
              <SkeletonLine className="w-24" />
              <SkeletonLine className="w-full mt-2" />
            </SkeletonCard>
          ))}
        </div>
      </div>
    </SkeletonPage>
  );
}
