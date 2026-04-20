import {
  SkeletonBlock,
  SkeletonCard,
  SkeletonLine,
  SkeletonPage,
} from "@/components/ui/Skeleton";

export default function SettingsLoading() {
  return (
    <SkeletonPage titleWidth="w-1/3 max-w-[220px]">
      <div className="space-y-6">
        {/* Five section cards to match the real page */}
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonCard key={i}>
            <div className="mb-3">
              <SkeletonLine className="w-20" />
              <SkeletonBlock className="h-5 mt-2 w-40" />
              <SkeletonLine className="w-3/4 mt-2" />
            </div>
            <div className="flex items-center justify-between pt-2">
              <SkeletonLine className="w-40" />
              <SkeletonBlock className="h-6 w-11 rounded-full" />
            </div>
          </SkeletonCard>
        ))}
      </div>
    </SkeletonPage>
  );
}
