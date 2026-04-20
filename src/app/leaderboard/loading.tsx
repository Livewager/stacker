import {
  SkeletonBlock,
  SkeletonCard,
  SkeletonLine,
  SkeletonPage,
} from "@/components/ui/Skeleton";

export default function LeaderboardLoading() {
  return (
    <SkeletonPage>
      {/* Hero-right: You pill + hour clock */}
      <div className="mb-8 flex items-end justify-end gap-3">
        <SkeletonBlock className="h-16 w-48 rounded-xl" />
        <SkeletonBlock className="h-16 w-36 rounded-xl" />
      </div>

      <div className="grid gap-6 md:grid-cols-[1.3fr_1fr]">
        {/* Live hour board */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
          <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
            <div>
              <SkeletonLine className="w-24" />
              <SkeletonLine className="w-40 mt-2" />
            </div>
            <SkeletonBlock className="h-8 w-28 rounded-lg" />
          </header>
          <ul className="divide-y divide-white/5">
            {Array.from({ length: 8 }, (_, i) => (
              <li
                key={i}
                className={`flex items-center gap-3 px-4 ${i < 3 ? "py-4" : "py-2.5"}`}
              >
                <SkeletonBlock
                  className={i < 3 ? "h-9 w-9 rounded-full" : "h-4 w-6 rounded"}
                />
                <div className="flex-1">
                  <SkeletonLine className="w-32" />
                  <SkeletonLine className="w-24 mt-2" />
                </div>
                <SkeletonLine
                  className={i < 3 ? "w-14 h-6" : "w-14"}
                />
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-6">
          <SkeletonCard>
            <SkeletonLine className="w-24" />
            <div className="mt-3 space-y-2">
              <SkeletonLine className="w-40" />
              <SkeletonBlock className="h-6 w-32" />
              <SkeletonLine className="w-56" />
            </div>
            <div className="mt-4 flex gap-1.5">
              {Array.from({ length: 5 }, (_, i) => (
                <SkeletonBlock key={i} className="h-1.5 flex-1 rounded-full" />
              ))}
            </div>
          </SkeletonCard>
          <SkeletonCard>
            <SkeletonLine className="w-32 mb-3" />
            <ul className="divide-y divide-white/5">
              {Array.from({ length: 2 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 py-3">
                  <div className="flex-1">
                    <SkeletonLine className="w-24" />
                    <SkeletonLine className="w-28 mt-2" />
                  </div>
                  <SkeletonLine className="w-10" />
                  <SkeletonBlock className="h-7 w-14 rounded-md" />
                </li>
              ))}
            </ul>
          </SkeletonCard>
        </div>
      </div>
    </SkeletonPage>
  );
}
