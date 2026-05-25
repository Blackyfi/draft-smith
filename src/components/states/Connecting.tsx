import { Skeleton } from "@/components/ui/skeleton";

/**
 * Connecting / loading state (PROJECT_SPEC §6.4): skeleton placeholders that mirror the in-game
 * dashboard layout, so the transition into a live game doesn't flash blank. Shown while the first
 * connection status resolves or the poller is mid-probe.
 */
export function Connecting() {
  return (
    <div
      role="status"
      aria-label="Connecting to the live game"
      className="flex flex-col gap-5 p-3"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-20" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px] w-28 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2.5 py-1">
            <Skeleton className="size-8 rounded-md" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
