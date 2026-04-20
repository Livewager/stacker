import {
  SkeletonBlock,
  SkeletonCard,
  SkeletonLine,
  SkeletonPage,
} from "@/components/ui/Skeleton";

/**
 * Mirrors /play's two-column game-card grid so hydration is a visual
 * no-op instead of a layout shift. Each placeholder card matches the
 * real card's header bar (accent stripe), eyebrow row, h2, tagline,
 * 3 bullet rows, and the trailing arrow affordance.
 */
export default function PlayLoading() {
  return (
    <SkeletonPage>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <SkeletonCard key={i} className="relative overflow-hidden p-5">
            <SkeletonBlock className="absolute inset-x-0 top-0 h-1" />
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <SkeletonLine className="w-20" />
                <SkeletonBlock className="h-5 w-12 rounded-full" />
              </div>
              <SkeletonBlock className="h-6 w-20 rounded-md" />
            </div>
            <SkeletonBlock className="h-9 mb-2 w-3/4 max-w-sm" />
            <SkeletonLine className="w-full mt-2" />
            <SkeletonLine className="w-5/6 mt-2" />
            <ul className="space-y-1.5 mt-4 mb-5">
              {Array.from({ length: 3 }, (_, j) => (
                <li key={j} className="flex items-start gap-2">
                  <SkeletonBlock className="h-1.5 w-1.5 rounded-full mt-1" />
                  <SkeletonLine className="flex-1" />
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between">
              <SkeletonLine className="w-12" />
              <SkeletonBlock className="h-8 w-8 rounded-full" />
            </div>
          </SkeletonCard>
        ))}
      </div>
    </SkeletonPage>
  );
}
