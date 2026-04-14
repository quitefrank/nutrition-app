"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
            networkMode: "online", // explicit: pauses background fetches when offline (AC2)
          },
        },
      })
  );

  const [persister] = useState(() => {
    if (typeof window === "undefined") return undefined;
    // Wrap localStorage so a QuotaExceededError on setItem degrades gracefully
    // (keeps serving from in-memory cache) rather than crashing the render pipeline.
    const safeStorage: Storage = {
      getItem: (k) => window.localStorage.getItem(k),
      removeItem: (k) => window.localStorage.removeItem(k),
      clear: () => window.localStorage.clear(),
      key: (i) => window.localStorage.key(i),
      get length() { return window.localStorage.length; },
      setItem(k, v) {
        try {
          window.localStorage.setItem(k, v);
        } catch (e) {
          // Swallow quota and blocked-storage errors — keep serving from in-memory
          // cache rather than crashing. Any other exception re-throws.
          if (
            e instanceof DOMException &&
            (e.name === "QuotaExceededError" || e.name === "SecurityError")
          ) return;
          throw e;
        }
      },
    };
    return createSyncStoragePersister({
      storage: safeStorage,
      key: "plately-query-cache",
      // Throttle serialisation writes to avoid blocking the main thread
      // on rapid successive cache updates (e.g., enrichment phase)
      throttleTime: 1000,
    });
  });

  // P3: guard against SSR / test environments where window is unavailable.
  // PersistQueryClientProvider requires a real persister; fall back to a plain
  // QueryClientProvider when localStorage is not accessible.
  if (!persister) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: PERSIST_MAX_AGE_MS,
        // Persist only explicitly whitelisted collection-level query keys.
        // Single-record detail queries are intentionally excluded to prevent
        // localStorage bloat and stale detail records being restored on next launch.
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const [key, sub] = query.queryKey as [string, string | undefined];
            // useGroceryItems() → ['grocery-items']
            if (key === "grocery-items") return true;
            // useRestaurants() → ['restaurants']
            // useRestaurantsWithRecipes() → ['restaurants', 'with-recipes']
            // Excluded: useRestaurant(id) → ['restaurants', id] (detail, avoid stale data)
            if (key === "restaurants") return sub === undefined || sub === "with-recipes";
            // useRecipes() → ['recipes']
            // useKeptRecipes() → ['recipes', 'kept']
            // useRecipesByRestaurant(id) → ['recipes', 'restaurant', id]
            // Excluded: useRecipe(id) → ['recipes', uuid] (detail, avoid stale data)
            if (key === "recipes") {
              if (sub === undefined) return true;    // ['recipes']
              if (sub === "kept") return true;       // ['recipes', 'kept']
              if (sub === "restaurant") return true; // ['recipes', 'restaurant', id]
              return false;                          // ['recipes', uuid] — detail
            }
            return false;
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
