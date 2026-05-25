import { useQueryClient } from "@tanstack/react-query";

import { useTauriEvent } from "@/hooks/useTauriEvent";

const KEY = ["last-updated"] as const;

/**
 * Tracks the timestamp of the most recent `recommendation-updated` or `game-state-changed` event.
 * Returns the stored timestamp (or `null` before any event). Used by the Footer to show "updated
 * Ns ago" while in-game. The value is stored in the Query cache (no Zustand — it's derived server
 * state) as a plain `number` (epoch ms).
 */
export function useLastUpdated(): Date | null {
  const queryClient = useQueryClient();

  useTauriEvent("recommendation-updated", () => {
    queryClient.setQueryData<number>(KEY, Date.now());
  });

  useTauriEvent("game-state-changed", () => {
    queryClient.setQueryData<number>(KEY, Date.now());
  });

  const ts = queryClient.getQueryData<number>(KEY);
  return ts != null ? new Date(ts) : null;
}
