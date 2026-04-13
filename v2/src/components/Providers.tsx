"use client";

import { useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

// 24-hour persistence window — long enough for repeated daily use offline
const PERSIST_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 min — keep in-memory refresh cadence
            gcTime: PERSIST_MAX_AGE_MS, // must be >= maxAge for persister to work
            retry: 1,
          },
        },
      })
  );

  const [persister] = useState(() =>
    // Server-side guard: createSyncStoragePersister requires localStorage
    typeof window !== "undefined"
      ? createSyncStoragePersister({
          storage: window.localStorage,
          key: "plately-query-cache",
          // Throttle serialisation writes to avoid blocking the main thread
          // on rapid successive cache updates (e.g., enrichment phase)
          throttleTime: 1000,
        })
      : undefined
  );

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: persister!,
        maxAge: PERSIST_MAX_AGE_MS,
        // Only persist explicitly whitelisted query keys — never persist
        // ephemeral scan session data or in-flight enrichment state
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const key = query.queryKey[0];
            return (
              key === "recipes" ||
              key === "restaurants" ||
              key === "grocery"
            );
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
