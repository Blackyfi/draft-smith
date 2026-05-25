import { QueryClient } from "@tanstack/react-query";

/**
 * Shared TanStack Query client. Server/game state (the Live Client polling lifecycle) lives
 * here, not in component state. Polling cadence is configured per-query as the poller lands (M2).
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
