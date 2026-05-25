import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/tauri";

/**
 * Returns the installed app version string (e.g. "0.1.3"). Cached for the session — it can only
 * change on relaunch. Shared query key so Header and SettingsDialog read the same value.
 */
export function useAppVersion() {
  return useQuery({
    queryKey: ["app-version"],
    queryFn: api.getAppVersion,
    staleTime: Infinity,
    retry: false,
  });
}
