import {
  SkeletonBlock,
  SkeletonCard,
  SkeletonLine,
  SkeletonPage,
} from "@/components/ui/Skeleton";

export default function DepositLoading() {
  return (
    <SkeletonPage titleWidth="w-1/2 max-w-sm">
      {/* Tab rail */}
      <div className="mb-5 flex gap-2">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonBlock key={i} className="h-10 w-32 rounded-xl" />
        ))}
      </div>

      {/* LTC panel fallback shape */}
      <SkeletonCard className="p-5 md:p-7">
        <div className="grid gap-6 md:grid-cols-[260px_1fr]">
          {/* QR */}
          <div className="flex flex-col items-center gap-3">
            <SkeletonBlock className="h-[230px] w-[230px] rounded-xl" />
            <SkeletonLine className="w-40" />
          </div>
          {/* Fields */}
          <div className="space-y-4">
            <div>
              <SkeletonLine className="w-28" />
              <SkeletonBlock className="h-10 mt-2 w-full rounded-md" />
            </div>
            <div>
              <SkeletonLine className="w-40" />
              <SkeletonBlock className="h-10 mt-2 w-full rounded-md" />
              <SkeletonLine className="mt-2 w-3/4" />
            </div>
            <SkeletonBlock className="h-20 w-full rounded-xl" />
            <SkeletonBlock className="h-11 w-full rounded-xl" />
            <SkeletonBlock className="h-20 w-full rounded-xl" />
          </div>
        </div>
      </SkeletonCard>

      {/* Trust strip */}
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonCard key={i} className="p-3">
            <SkeletonLine className="w-24" />
            <SkeletonLine className="w-full mt-2" />
            <SkeletonLine className="w-3/4 mt-1.5" />
          </SkeletonCard>
        ))}
      </div>
    </SkeletonPage>
  );
}
