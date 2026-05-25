import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { api } from "@/lib/tauri";
import type { Settings } from "@/types";

export const SETTINGS_KEY = ["settings"] as const;

/**
 * TanStack Query hook for user settings (PROJECT_SPEC §6.6).
 *
 * `useQuery` seeds from `get_settings`. The mutation calls `set_settings` and writes back the
 * *sanitized* settings Rust returns (poll interval is clamped to 2–5, etc.). Components stay
 * presentational; all logic lives here.
 */
export function useSettings() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: api.getSettings,
    staleTime: Infinity,
  });

  const mutation = useMutation({
    mutationFn: (settings: Settings) => api.setSettings(settings),
    // Reflect the change in the UI immediately, then reconcile with the Rust-sanitized value (or
    // roll back on failure) — so a control like the theme switch flips at once even though
    // `set_settings` may kick off a locale re-download before it resolves.
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: SETTINGS_KEY });
      const previous = queryClient.getQueryData<Settings>(SETTINGS_KEY);
      queryClient.setQueryData<Settings>(SETTINGS_KEY, next);
      return { previous };
    },
    onError: (_err, _next, context) => {
      // Restore the pre-mutation value and tell the user, rather than silently reverting.
      if (context?.previous) {
        queryClient.setQueryData<Settings>(SETTINGS_KEY, context.previous);
      }
      toast.error("Couldn't save settings", {
        description: "Your change was reverted. Please try again.",
      });
    },
    onSuccess: (sanitized) => {
      // Adopt the Rust-sanitized value — never trust our local merge blindly.
      queryClient.setQueryData<Settings>(SETTINGS_KEY, sanitized);
    },
  });

  /**
   * Merges a partial update onto the current settings and persists it. The cache updates
   * optimistically (see the mutation's `onMutate`); a failed write rolls back and toasts.
   */
  function update(partial: Partial<Settings>) {
    const current = queryClient.getQueryData<Settings>(SETTINGS_KEY);
    if (!current) return;
    mutation.mutate({ ...current, ...partial });
  }

  return {
    ...query,
    mutation,
    update,
  };
}
