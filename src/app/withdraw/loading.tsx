import {
  SkeletonBlock,
  SkeletonCard,
  SkeletonLine,
  SkeletonPage,
} from "@/components/ui/Skeleton";

export default function WithdrawLoading() {
  return (
    <SkeletonPage titleWidth="w-1/2 max-w-sm">
      <SkeletonCard className="p-5 md:p-7">
        <div className="flex items-center justify-between pb-3 border-b border-white/5">
          <div>
            <SkeletonLine className="w-12" />
            <SkeletonLine className="w-40 mt-2" />
          </div>
          <div className="text-right">
            <SkeletonLine className="w-16 ml-auto" />
            <SkeletonLine className="w-24 mt-2 ml-auto" />
          </div>
        </div>
        <div className="mt-5">
          <SkeletonLine className="w-48" />
          <SkeletonBlock className="h-10 mt-2 w-full rounded-md" />
          <SkeletonLine className="w-3/4 mt-2" />
        </div>
        <div className="mt-5">
          <SkeletonLine className="w-16" />
          <div className="flex items-center gap-2 mt-2">
            <SkeletonBlock className="h-10 flex-1 rounded-md" />
            <SkeletonBlock className="h-10 w-10 rounded-md" />
            <SkeletonBlock className="h-10 w-16 rounded-md" />
          </div>
          <SkeletonBlock className="h-10 mt-2 w-full rounded-lg" />
        </div>
        <div className="mt-6 flex items-center justify-between">
          <SkeletonLine className="w-24" />
          <SkeletonBlock className="h-10 w-28 rounded-xl" />
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
