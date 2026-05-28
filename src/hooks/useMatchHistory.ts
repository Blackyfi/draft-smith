import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTauriEvent } from "@/hooks/useTauriEvent";
import { api } from "@/lib/tauri";
import type { MatchSummary } from "@/types";

export const MATCH_HISTORY_KEY = ["match-history"] as const;

/**
 * The list of recorded matches (Part A), newest first.
 *
 * Seeded from `get_match_history`, then kept fresh by the `match-saved` event the poller emits when
 * a finished game is flushed to disk — so a game that ends while the window is open appears without
 * a manual refresh. Server-state lives in TanStack Query, never component state (`.claude/frontend.md`).
 */
export function useMatchHistory() {
  const queryClient = useQueryClient();

  useTauriEvent("match-saved", () => {
    void queryClient.invalidateQueries({ queryKey: MATCH_HISTORY_KEY });
  });

  return useQuery<MatchSummary[]>({
    queryKey: MATCH_HISTORY_KEY,
    queryFn: api.getMatchHistory,
    staleTime: Infinity,
  });
}
