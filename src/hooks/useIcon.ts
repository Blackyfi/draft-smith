import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useDdragonReady } from "@/hooks/useDdragonVersion";
import { api } from "@/lib/tauri";
import type { ItemMeta } from "@/types";

/**
 * Resolves an item icon to a webview-loadable URL (downloaded lazily on a cache miss by the Rust
 * side). Cached forever per id: icons are immutable within a patch. Returns `null` when the item
 * is unknown, so the card can fall back to a placeholder. Gated on {@link useDdragonReady} so it
 * never runs — and caches a `null` — before DDragon data exists.
 */
export function useItemIcon(itemId: number) {
  const ready = useDdragonReady();
  return useQuery({
    queryKey: ["item-icon", itemId],
    queryFn: () => api.getItemIconUrl(itemId),
    enabled: ready,
    staleTime: Infinity,
    retry: false,
  });
}

/** Resolves a champion icon to a webview-loadable URL by display name; see {@link useItemIcon}. */
export function useChampionIcon(name: string | null | undefined) {
  const ready = useDdragonReady();
  return useQuery({
    queryKey: ["champion-icon", name],
    queryFn: () => api.getChampionIconUrl(name as string),
    enabled: ready && name != null && name.length > 0,
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * Resolves a champion's friendly display name ("Kai'Sa") from the Live Client id ("Kaisa").
 * Returns the original string until resolved, and as a permanent fallback when the champion is
 * unknown — so the UI always shows *something* sensible. Gated on {@link useDdragonReady}: until
 * DDragon is loaded it returns the id, then resolves to the friendly name once data exists.
 */
export function useChampionName(name: string | null | undefined): string {
  const ready = useDdragonReady();
  const { data } = useQuery({
    queryKey: ["champion-name", name],
    queryFn: () => api.getChampionDisplayName(name as string),
    enabled: ready && name != null && name.length > 0,
    staleTime: Infinity,
    retry: false,
  });
  return data ?? name ?? "";
}

/**
 * Resolves many champion ids → friendly display names at once, returned as a `Map<id, name>` that
 * always holds an entry for every requested id (falling back to the id itself until resolved or when
 * unknown). Shares the per-id query cache with {@link useChampionName} (same `["champion-name", id]`
 * key), so a roster already rendered via that hook resolves here for free. Used to annotate the
 * event log with each actor's champion. Gated on {@link useDdragonReady} for cache parity.
 */
export function useChampionNames(ids: string[]): Map<string, string> {
  const ready = useDdragonReady();
  // Stable, de-duplicated id list so the query set doesn't churn on re-render.
  const unique = useMemo(() => [...new Set(ids.filter((id) => id))], [ids]);
  const results = useQueries({
    queries: unique.map((id) => ({
      queryKey: ["champion-name", id],
      queryFn: () => api.getChampionDisplayName(id),
      enabled: ready,
      staleTime: Infinity,
      retry: false,
    })),
  });
  return useMemo(() => {
    const map = new Map<string, string>();
    unique.forEach((id, i) => map.set(id, results[i]?.data ?? id));
    return map;
  }, [unique, results]);
}

/**
 * Fetches DDragon metadata for an item by id, including name, cost, tags, plaintext, and the
 * stripped full description. Cached forever per id (DDragon data is immutable within a patch).
 * Returns `undefined` while loading, `null` when the item is unknown. Gated on DDragon readiness
 * so it never fires — or caches a `null` — before metadata exists.
 */
export function useItemMeta(itemId: number): {
  data: ItemMeta | null | undefined;
  isLoading: boolean;
} {
  const ready = useDdragonReady();
  return useQuery<ItemMeta | null>({
    queryKey: ["item-meta", itemId],
    queryFn: () => api.getItemMeta(itemId),
    enabled: ready,
    staleTime: Infinity,
    retry: false,
  });
}
