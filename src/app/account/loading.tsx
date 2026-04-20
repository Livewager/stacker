import {
  SkeletonAvatar,
  SkeletonBlock,
  SkeletonCard,
  SkeletonLine,
  SkeletonPage,
} from "@/components/ui/Skeleton";

export default function AccountLoading() {
  return (
    <SkeletonPage>
      <div className="grid gap-6 md:grid-cols-[1fr_1.25fr]">
        <div className="space-y-5">
          {/* Profile card */}
          <SkeletonCard>
            <div className="flex items-start gap-4">
              <SkeletonAvatar size={64} />
              <div className="flex-1 min-w-0">
                <SkeletonLine className="w-20" />
                <SkeletonLine className="w-full mt-2" />
                <div className="mt-3 flex gap-2">
                  <SkeletonBlock className="h-7 w-16 rounded-md" />
                  <SkeletonBlock className="h-7 w-20 rounded-md" />
                </div>
              </div>
            </div>
          </SkeletonCard>

          {/* Balance tile */}
          <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[0.04] p-5 md:p-6">
            <SkeletonLine className="w-20" />
            <SkeletonBlock className="h-12 mt-3 w-2/3 max-w-xs" />
            <SkeletonLine className="mt-3 w-10" />
            <div className="mt-4 flex gap-2">
              <SkeletonBlock className="h-8 w-24 rounded-lg" />
              <SkeletonBlock className="h-8 w-28 rounded-lg" />
            </div>
          </div>

          {/* Session stats */}
          <SkeletonCard>
            <SkeletonLine className="w-28 mb-3" />
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i}>
                  <SkeletonLine className="w-16 mb-2" />
                  <SkeletonLine className="w-24" />
                </div>
              ))}
            </div>
          </SkeletonCard>
        </div>

        {/* Activity feed */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02]">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <SkeletonLine className="w-32" />
            <SkeletonLine className="w-14" />
          </div>
          <ul className="divide-y divide-white/5">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="px-4 py-3 flex items-start gap-3">
                <SkeletonBlock className="h-8 w-8 rounded-lg" />
                <div className="flex-1">
                  <SkeletonLine className="w-28" />
                  <SkeletonLine className="w-16 mt-2" />
                </div>
                <SkeletonLine className="w-20" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </SkeletonPage>
  );
}
