import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useDdragonReady } from "@/hooks/useDdragonVersion";
import { api } from "@/lib/tauri";
import type { Rank } from "@/types";

/**
 * Fetches the highest win-rate meta build for a champion+role from the Rust-side u.gg cache
 * (Tier B, PROJECT_SPEC §3.5). Query-pull based — no event needed; the Rust side caches once
 * per champion at game start.
 *
 * Gated on useDdragonReady so it never fires (and never caches a null) before DDragon data
 * exists. Uses `keepPreviousData` so role-toggle switches don't flash a blank/skeleton state
 * while the new role key resolves — the panel keeps showing the last build.
 *
 * Returns the MetaBuild or null when unavailable, plus loading/error state.
 */
export function useMetaBuild(
  champion: string | null,
  role: string | null,
  rank: Rank,
) {
  const ready = useDdragonReady();

  return useQuery({
    queryKey: ["meta-build", champion, role, rank] as const,
    queryFn: () => api.getMetaBuild(champion as string, role, rank),
    enabled: ready && champion != null && champion.length > 0,
    staleTime: Infinity,
    retry: false,
    placeholderData: keepPreviousData,
  });
}
