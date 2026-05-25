import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/tauri";

/**
 * Reads the connection / coaching status from the Rust core.
 *
 * M0: resolves to `"no-game"`. The real polling cadence (2–5s) is wired when the Live Client
 * poller lands (M2); consumers don't change when that happens.
 */
export function useConnectionStatus() {
  return useQuery({
    queryKey: ["connection-status"],
    queryFn: api.getStatus,
  });
}
