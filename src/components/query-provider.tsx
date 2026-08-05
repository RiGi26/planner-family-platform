'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

/**
 * With a static export every fetch happens on the client, so caching is not an
 * optimisation here — it is the only thing standing between a tab switch and a full
 * refetch of the whole sheet.
 *
 * The client is created inside state rather than at module scope so it is never
 * shared across renders in a way that leaks one user's cache into another's session.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // The sheet changes when the user writes, not on its own. Refetching on
            // every window focus would spend requests to learn nothing.
            refetchOnWindowFocus: false,
            staleTime: 60_000,
            retry: 1,
          },
        },
      }),
  )

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}
