import { BarChart3, ChevronRight, Gamepad2, History } from "lucide-react";

import { useMatchHistory } from "@/hooks/useMatchHistory";
import { useUiStore } from "@/store/ui";

/**
 * The idle (no-game) launcher (PROJECT_SPEC §6.4): a friendly empty state plus option cards for the
 * non-game features. Live coaching takes over automatically when a game starts (App routes by
 * connection status), so this is purely the "between games" home.
 *
 * Cards: Match History (live) and Stats & KPIs (coming soon — disabled). Color is never the only
 * signal; each card pairs an icon + title + description.
 */
export function IdleHome() {
  const setIdleView = useUiStore((s) => s.setIdleView);
  // Saved-match count for the at-a-glance badge on the Match History card.
  const { data: matches } = useMatchHistory();
  const matchCount = matches?.length ?? 0;

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted">
          <Gamepad2
            className="size-7 text-muted-foreground"
            aria-hidden="true"
          />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            No game running
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Launch a game and I&apos;ll start coaching live. Meanwhile, review
            your past matches.
          </p>
        </div>
      </div>

      <div className="grid w-full max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setIdleView("history")}
          className="group flex flex-col items-start gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-1.5">
              <History className="size-5 text-primary" aria-hidden="true" />
              {matchCount > 0 && (
                <span
                  className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[11px] font-semibold text-primary tabular-nums"
                  aria-label={`${matchCount} saved ${matchCount === 1 ? "match" : "matches"}`}
                >
                  {matchCount}
                </span>
              )}
            </div>
            <ChevronRight
              className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </div>
          <span className="text-sm font-semibold">Match History</span>
          <span className="text-[11px] text-muted-foreground">
            Browse every game DraftSmith recorded — builds, skill order, and a
            full event timeline.
          </span>
        </button>

        <button
          type="button"
          onClick={() => setIdleView("stats")}
          className="group flex flex-col items-start gap-2 rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <div className="flex w-full items-center justify-between">
            <BarChart3
              className="size-5 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              Soon
            </span>
          </div>
          <span className="text-sm font-semibold">Stats &amp; KPIs</span>
          <span className="text-[11px] text-muted-foreground">
            Trends and performance metrics across your recorded matches. In
            development.
          </span>
        </button>
      </div>
    </div>
  );
}
