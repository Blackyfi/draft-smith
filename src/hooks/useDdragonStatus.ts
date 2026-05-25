import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useTauriEvent } from "@/hooks/useTauriEvent";
import type { DdragonStatus } from "@/types";

const KEY = ["ddragon-status"] as const;

/**
 * Data Dragon lifecycle status (`checking → updating? → ready | offline`), driven by the
 * `ddragon-status` event from the startup bootstrap / `force_refresh_ddragon`. Used for the
 * "offline, using cached patch" footer note (PROJECT_SPEC §6.4). Defaults to `checking` until the
 * first event lands; there is no fetch command for this.
 */
export function useDdragonStatus() {
  const queryClient = useQueryClient();

  useTauriEvent("ddragon-status", (status) => {
    queryClient.setQueryData<DdragonStatus>(KEY, status);
  });

  return useQuery({
    queryKey: KEY,
    queryFn: () =>
      queryClient.getQueryData<DdragonStatus>(KEY) ??
      ("checking" as DdragonStatus),
    staleTime: Infinity,
  });
}
