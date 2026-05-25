import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/tauri";
import type { UpdateInfo } from "@/types";

export type UpdateStatus = "checking" | "up-to-date" | "available" | "error";

export interface UseUpdateCheckResult {
  /** The update info when available, null when up-to-date, undefined while loading. */
  update: UpdateInfo | null | undefined;
  status: UpdateStatus;
  /** Refetch the update check (for the "Retry" button). */
  refetch: () => void;
}

/**
 * Checks whether a newer release exists. Runs once at app start (staleTime = 1 hour).
 *
 * - isLoading → "checking"
 * - isError   → "error" (network / no release yet)
 * - data null → "up-to-date"
 * - data object → "available"
 *
 * The query is shared across all callers via the same query key, so the badge in Header and the
 * section in SettingsDialog both react to the same state without extra fetches.
 */
export function useUpdateCheck(): UseUpdateCheckResult {
  const query = useQuery<UpdateInfo | null>({
    queryKey: ["update-check"],
    queryFn: api.checkForUpdate,
    staleTime: 60 * 60 * 1000, // 1 hour
    retry: false,
  });

  let status: UpdateStatus;
  if (query.isLoading) {
    status = "checking";
  } else if (query.isError) {
    status = "error";
  } else if (query.data == null) {
    status = "up-to-date";
  } else {
    status = "available";
  }

  return {
    update: query.data,
    status,
    refetch: () => void query.refetch(),
  };
}
