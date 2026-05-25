import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTauriEvent } from "@/hooks/useTauriEvent";
import { api } from "@/lib/tauri";
import type { Recommendation } from "@/types";

const KEY = ["recommendation"] as const;

/**
 * The latest engine recommendation, or `null` when there's no live game.
 *
 * Seeded from `get_current_recommendation`, then driven by the `recommendation-updated` event the
 * poller emits whenever the enemy build (and thus the engine output) changes — this is the live
 * re-rank (PROJECT_SPEC §5.2 step 7). The FE never recomputes; the engine lives in Rust
 * (`.claude/frontend.md`). When the game ends the poller stops emitting and flips the connection
 * status to `no-game`, so we clear the stale recommendation off that signal.
 */
export function useRecommendation() {
  const queryClient = useQueryClient();

  useTauriEvent("recommendation-updated", (rec) => {
    queryClient.setQueryData<Recommendation | null>(KEY, rec);
  });

  // Leaving a game invalidates the recommendation; clear it so the dashboard never shows a build
  // from a finished match.
  useTauriEvent("connection-status", (status) => {
    if (status === "no-game" || status === "error") {
      queryClient.setQueryData<Recommendation | null>(KEY, null);
    }
  });

  return useQuery({
    queryKey: KEY,
    queryFn: api.getCurrentRecommendation,
    staleTime: Infinity,
  });
}
