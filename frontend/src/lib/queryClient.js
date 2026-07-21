import { QueryClient } from '@tanstack/react-query'

// Enterprise-tuned query client.
//
// staleTime 60s  — avoids redundant refetches when 100K users switch tabs or
//                  re-mount components that share the same query key.
// gcTime   5 min — keeps unused query data in memory long enough for back-nav
//                  to feel instant without ballooning RAM.
// retry    3     — covers transient 503s from the Java backend under load; uses
//                  exponential backoff capped at 30s.
// refetchOnWindowFocus — re-validates stale data after a user returns from
//                        another tab (important for long-running HITL sessions).

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 3,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
      retryDelay: 1_000,
    },
  },
})
