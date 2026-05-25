import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/tauri";

/**
 * Fetches the bundled changelog Markdown string. Cached for the session (staleTime = Infinity)
 * since the changelog only changes when the app is updated.
 */
export function useChangelog() {
  return useQuery({
    queryKey: ["changelog"],
    queryFn: api.getChangelog,
    staleTime: Infinity,
    retry: false,
    // Don't auto-fetch — load lazily when the dialog opens.
    enabled: false,
  });
}
