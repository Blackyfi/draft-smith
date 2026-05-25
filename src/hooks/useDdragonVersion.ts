import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/tauri";

/**
 * The cached Data Dragon patch version, or `null` until the Rust core has loaded its metadata.
 *
 * Resolved once on mount. If DDragon isn't loaded yet (the startup bootstrap reads/validates the
 * on-disk cache asynchronously, and a live game state can arrive first), this returns `null` — and
 * `useDdragonStatus` invalidates this query when the `ddragon-status` event reports `ready`/
 * `offline`, so it re-fetches and unblocks everything gated on readiness. This is the single
 * source of "is DDragon ready?" for the whole UI.
 */
export function useDdragonVersion() {
  return useQuery({
    queryKey: ["ddragon-version"],
    queryFn: () => api.getDdragonVersion(),
    staleTime: Infinity,
  });
}

/**
 * True once Data Dragon metadata is loaded. Icon and champion-name lookups gate on this so they
 * never fire (and cache a `null`) before the data they need exists.
 */
export function useDdragonReady(): boolean {
  return useDdragonVersion().data != null;
}
