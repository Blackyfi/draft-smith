import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTauriEvent } from "@/hooks/useTauriEvent";
import type { GameStateSummary } from "@/types";

const KEY = ["game-state"] as const;

/**
 * The latest game-state summary (champion, clock, mode) for the header.
 *
 * Event-only: there's no command to fetch it — it arrives via `game-state-changed`, emitted when
 * the poll diff sees a meaningful change. Backed by the Query cache (read-through `queryFn`) so the
 * value is shared and survives re-renders without re-subscribing.
 */
export function useGameState() {
  const queryClient = useQueryClient();

  useTauriEvent("game-state-changed", (summary) => {
    queryClient.setQueryData<GameStateSummary>(KEY, summary);
  });

  // Clear the header summary when a game ends or the connection breaks, so the clock doesn't
  // freeze at its last value and a later game can't briefly show the prior one's champion. Mirrors
  // the reset in `useRecommendation` / `useBuildShiftToasts`.
  useTauriEvent("connection-status", (status) => {
    if (status === "no-game" || status === "error") {
      queryClient.setQueryData<GameStateSummary | null>(KEY, null);
    }
  });

  return useQuery({
    queryKey: KEY,
    queryFn: () => queryClient.getQueryData<GameStateSummary>(KEY) ?? null,
    staleTime: Infinity,
  });
}
