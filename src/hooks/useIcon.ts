import { useQuery } from "@tanstack/react-query";

import { useDdragonReady } from "@/hooks/useDdragonVersion";
import { api } from "@/lib/tauri";

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
