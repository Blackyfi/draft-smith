import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { MATCH_HISTORY_KEY } from "@/hooks/useMatchHistory";
import { api } from "@/lib/tauri";
import type { MatchRecord } from "@/types";

/**
 * One recorded match in full by id (Part A — Match Detail), or `null` if it no longer exists.
 * `id` may be `null` while nothing is selected, in which case the query stays idle.
 */
export function useMatch(id: string | null) {
  return useQuery<MatchRecord | null>({
    queryKey: ["match", id],
    queryFn: () => (id ? api.getMatch(id) : Promise.resolve(null)),
    enabled: id != null,
    staleTime: Infinity,
  });
}

/**
 * Deletes a recorded match, then refreshes the history list. Returns the TanStack mutation so the
 * caller can disable the control / show pending state.
 */
export function useDeleteMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteMatch(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MATCH_HISTORY_KEY });
    },
  });
}
