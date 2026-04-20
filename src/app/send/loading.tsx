import {
  SkeletonBlock,
  SkeletonCard,
  SkeletonLine,
  SkeletonPage,
} from "@/components/ui/Skeleton";

/**
 * Loading shell for the 3-stage send flow. The real page starts on
 * the Compose stage; the skeleton mirrors that one — swapping to the
 * review / sent cards would only show on the first paint of a deep
 * link, which is unusual. Keep it aligned to the common case.
 */
export default function SendLoading() {
  return (
    <SkeletonPage titleWidth="w-1/3 max-w-[220px]">
      <SkeletonCard className="p-5 md:p-7">
        {/* From/balance strip */}
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
        {/* Recipient field */}
        <div className="mt-5">
          <SkeletonLine className="w-40" />
          <SkeletonBlock className="h-10 mt-2 w-full rounded-md" />
          <SkeletonLine className="w-3/4 mt-2" />
        </div>
        {/* Amount */}
        <div className="mt-5">
          <SkeletonLine className="w-20" />
          <div className="flex items-center gap-2 mt-2">
            <SkeletonBlock className="h-10 flex-1 rounded-md" />
            <SkeletonBlock className="h-10 w-10 rounded-md" />
            <SkeletonBlock className="h-10 w-16 rounded-md" />
          </div>
          <SkeletonLine className="w-1/2 mt-2" />
        </div>
        {/* Memo */}
        <div className="mt-5">
          <SkeletonLine className="w-32" />
          <SkeletonBlock className="h-10 mt-2 w-full rounded-md" />
        </div>
        {/* Footer actions */}
        <div className="mt-6 flex items-center justify-between">
          <SkeletonLine className="w-24" />
          <SkeletonBlock className="h-10 w-28 rounded-xl" />
        </div>
      </SkeletonCard>
    </SkeletonPage>
  );
}
