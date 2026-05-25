import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTauriEvent } from "@/hooks/useTauriEvent";
import { api } from "@/lib/tauri";
import type { ConnectionStatus } from "@/types";

const KEY = ["connection-status"] as const;

/**
 * The Live Client connection / coaching status.
 *
 * Seeded once from `get_status` (so a mid-game mount hydrates immediately), then kept live by the
 * `connection-status` event the poller emits on every transition. The event is the source of
 * truth; we never poll this on an interval (TanStack Query owns the *server*-state lifecycle, but
 * the cadence lives in the Rust poller — `.claude/frontend.md`).
 */
export function useConnectionStatus() {
  const queryClient = useQueryClient();

  useTauriEvent("connection-status", (status) => {
    queryClient.setQueryData<ConnectionStatus>(KEY, status);
  });

  return useQuery({
    queryKey: KEY,
    queryFn: api.getStatus,
    staleTime: Infinity, // event-driven; no background refetch.
  });
}
