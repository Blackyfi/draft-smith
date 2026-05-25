import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/tauri";

/**
 * Resolves an item icon to a webview-loadable URL (downloaded lazily on a cache miss by the Rust
 * side). Cached forever per id: icons are immutable within a patch. Returns `null` when DDragon
 * data hasn't loaded or the item is unknown, so the card can fall back to a placeholder.
 */
export function useItemIcon(itemId: number) {
  return useQuery({
    queryKey: ["item-icon", itemId],
    queryFn: () => api.getItemIconUrl(itemId),
    staleTime: Infinity,
    retry: false,
  });
}

/** Resolves a champion icon to a webview-loadable URL by display name; see {@link useItemIcon}. */
export function useChampionIcon(name: string | null | undefined) {
  return useQuery({
    queryKey: ["champion-icon", name],
    queryFn: () => api.getChampionIconUrl(name as string),
    enabled: name != null && name.length > 0,
    staleTime: Infinity,
    retry: false,
  });
}
