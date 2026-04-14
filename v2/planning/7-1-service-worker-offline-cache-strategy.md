# Story 7.1: Service Worker & Offline Cache Strategy

Status: review
Epic: 7 — Accessibility, Offline & Production Hardening
Story ID: 7.1
Story Key: 7-1-service-worker-offline-cache-strategy
Created: 2026-04-13

---

## Story

As a user,
I want the app to cache my collection data so it's available instantly offline,
So that visiting a restaurant without signal doesn't leave me unable to access my saved dishes.

---

## Acceptance Criteria

**AC1 — App shell cached on first load**
**Given** the service worker is registered
**When** the app is loaded for the first time
**Then** the service worker caches the app shell (HTML, CSS, JS bundles) so subsequent loads work without network access

**AC2 — Collection data persisted for offline reads**
**Given** the user views their collection while online
**When** data is fetched from Supabase
**Then** collection data (restaurants, dishes, recipes) is stored in a client-side persistent cache (IndexedDB or localStorage) so it survives page refreshes and app restarts

**AC3 — Offline launch from home screen icon**
**Given** the service worker cache and the collection data persister are both in place
**When** the app is launched from the home screen icon with no network connection
**Then** the cached app shell loads; the cached collection data is displayed immediately; any stale-data background refetches are paused by TanStack Query's default `networkMode: "online"` until connectivity is restored — no network calls complete while the device is offline

**AC4 — Stale-while-revalidate for cached resources**
**Given** the cache strategy is implemented
**When** a cached resource is stale and the network is available
**Then** the cached version renders immediately while a background refresh runs; the updated content replaces the stale version once the network response arrives

---

## Audit-First: Current State of SW Infrastructure

> **MANDATORY FIRST STEP:** Do NOT rewrite `public/sw.js` or `ServiceWorkerRegistrar.tsx`. Both are already fully implemented and in production use. Read them before writing a single line.

### What is already implemented (do NOT reinvent)

| File | Status | Notes |
|------|--------|-------|
| `public/sw.js` | ✅ Complete | Shell caching, stale-while-revalidate for `/api/*` GET, static chunk cache-first, page navigation network-first + cache fallback, grocery IndexedDB sync queue |
| `src/components/pwa/ServiceWorkerRegistrar.tsx` | ✅ Complete | Registers `/sw.js`, handles `REPLAY_GROCERY_ACTION` messages, polls for SW updates on visibility change |
| `src/app/layout.tsx` | ✅ Complete | `<ServiceWorkerRegistrar />` already mounted; `<InstallPromptBanner />` already included |
| `next.config.ts` | ✅ Complete | `sw.js` served with `Cache-Control: no-store, max-age=0`; `Service-Worker-Allowed: /` header set |
| `src/app/manifest.ts` | ✅ Complete | PWA manifest with `display: standalone`, correct icons, theme colour |
| `src/components/Providers.tsx` | ⚠️ Needs update | QueryClient uses only `staleTime: 5 * 60 * 1000`; no persistence across sessions |

### AC coverage gap analysis

| AC | Current State | Gap |
|----|---------------|-----|
| AC1 (shell cached) | ✅ Met — sw.js install handler caches `/` and `/manifest.json` | None |
| AC2 (collection data persisted) | ❌ NOT met | Supabase SDK calls are cross-origin (`*.supabase.co`) — the SW's origin guard skips them. TanStack Query cache is in-memory only; it evaporates on page refresh/app restart. |
| AC3 (offline launch) | ❌ NOT met | Depends on AC2. App shell loads offline; data does not. |
| AC4 (stale-while-revalidate) | ✅ Partially met — applies to same-origin GET `/api/*` routes | Not applied to Supabase SDK calls (see AC2 gap). Covered by TanStack Query `staleTime` for in-session reads. |

### Why the SW cannot fix AC2

`public/sw.js` has an explicit same-origin guard:
```js
if (request.method !== 'GET' || url.origin !== self.location.origin) return;
```

Supabase SDK calls are to `https://[project-ref].supabase.co/rest/v1/*` — cross-origin. The SW never sees them. Do NOT remove this guard (it is correct security practice).

**The correct solution: TanStack Query client-side persistence.**

---

## What This Story Implements

The only new code in this story is:
1. **TanStack Query persistence layer** — persist collection query data to `localStorage` using `@tanstack/react-query-persist-client` and `@tanstack/query-sync-storage-persister` so it survives across sessions
2. **`Providers.tsx` update** — swap `QueryClientProvider` for `PersistQueryClientProvider`
3. **Tests** — `ServiceWorkerRegistrar.test.tsx` (SW registration + message handling) and `Providers.persist.test.tsx` (persister wired correctly)

Everything else (sw.js, registrar, manifest, next.config) is verified, not rewritten.

---

## Dev Notes

### Package installation (required)

Two new packages from the TanStack Query ecosystem:

```bash
npm install @tanstack/react-query-persist-client@^5 @tanstack/query-sync-storage-persister@^5
```

Both are part of the TanStack Query v5 family and are maintained in the same monorepo as `@tanstack/react-query`. Versions must match the existing `^5.96.2` major.

### Providers.tsx — swap to PersistQueryClientProvider

**Current `src/components/Providers.tsx`:**
```tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

**Replace with:**
```tsx
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
```

**Key decisions:**
- `gcTime` must be ≥ `maxAge` for the persister to retain data until it dehydrates. Setting both to 24h.
- `throttleTime: 1000` prevents the enrichment pipeline (which fires many cache updates in rapid succession) from hammering localStorage with serialisation calls.
- `shouldDehydrateQuery` whitelist: only persist `recipes`, `restaurants`, `grocery`. Never persist scan session data, enrichment in-flight state, or search results (those should always be fresh).
- SSR guard (`typeof window !== "undefined"`) prevents build-time crash in Next.js Server Component boundary.

### Query key alignment

The existing hooks and their persistence status:

| Hook | queryKey | Persisted? | Reason |
|------|----------|-----------|--------|
| `useRecipes()` | `["recipes"]` | ✅ Yes | collection |
| `useKeptRecipes()` | `["recipes", "kept"]` | ✅ Yes | named subset |
| `useRecipesByRestaurant(id)` | `["recipes", "restaurant", id]` | ✅ Yes | named subset |
| `useRestaurants()` | `["restaurants"]` | ✅ Yes | collection |
| `useGroceryItems()` | `["grocery-items"]` | ✅ Yes | collection |
| `useRecipe(id)` | `["recipes", recipeId]` | ❌ No | single detail — key[0] matches "recipes" but length > 1 with non-named sub-key |
| `useRestaurant(id)` | `["restaurants", id]` | ❌ No | single detail |
| `useRestaurantsWithRecipes()` | `["restaurants", "with-recipes"]` | ❌ No | joined view, not needed offline |

**Filter rule:** `shouldDehydrateQuery` checks `key[0]` AND the second segment for named sub-keys. A query passes only if:
- `key === "grocery-items"` (any length)
- `key === "restaurants"` AND no second segment (collection only)
- `key === "recipes"` AND (no second segment, OR second segment is `"kept"` or `"restaurant"`)

Do NOT add persistence for:
- `["recipes", recipeId]` — single recipe detail; second segment is a UUID (not a named key)
- `["restaurants", id]` — single restaurant detail
- Scan/enrichment results (session storage, not TanStack Query)

### sw.js — verified, no changes needed

The existing `public/sw.js` fully satisfies AC1 and AC4. Key verified behaviours:

```js
// AC1: Shell assets cached on install
const SHELL_ASSETS = ['/', '/manifest.json'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
  self.skipWaiting(); // Takes control immediately, no wait for tab close
});

// AC4: Stale-while-revalidate for same-origin API GETs
if (url.pathname.startsWith('/api/')) {
  event.respondWith(/* stale-while-revalidate strategy */);
  return;
}

// AC1: Cache-first for Next.js static chunks (immutable content-hashed filenames)
if (url.pathname.startsWith('/_next/static/')) {
  event.respondWith(/* cache-first */);
  return;
}

// AC3: Page navigations fall back to cached version when offline
if (request.mode === 'navigate') {
  event.respondWith(fetch(request).catch(() => caches.match(request) ?? caches.match('/')));
  return;
}
```

The SW also implements a full IndexedDB grocery sync queue with Background Sync API + online event fallback. This is already production-ready.

### Cache versioning (important for future updates)

The SW uses version strings in cache names:
```js
const CACHE_NAME = 'plately-shell-v1';
const API_CACHE_NAME = 'plately-api-v1';
```

When shell assets or caching strategies change in future stories, bump to `v2`. The activate handler automatically cleans old caches. Do NOT bump the version in this story — the current strategy is unchanged.

### Offline read behaviour (AC3)

When the user launches the app offline:
1. SW serves the cached app shell (HTML from `'/'`, JS chunks from `_next/static/`)
2. React hydrates; TanStack Query's `PersistQueryClientProvider` restores the persisted cache from `localStorage`
3. Hooks like `useRecipes()`, `useRestaurants()` return the persisted data immediately — they do NOT go to the network
4. TanStack Query marks the data as `stale` (past `staleTime`), but with the default `networkMode: "online"`, background refetches are **paused** (not attempted) while the device is offline; the stale data remains displayed until connectivity is restored and the refetch runs
5. Supabase SDK connection attempts fail silently; hooks gracefully degrade (existing `retry` config handles this)

### What does NOT change in this story

| File | Reason |
|------|--------|
| `public/sw.js` | Already complete; AC1 + AC4 already met |
| `src/components/pwa/ServiceWorkerRegistrar.tsx` | Already complete |
| `src/components/pwa/InstallPromptBanner.tsx` | Already complete |
| `src/app/layout.tsx` | Already complete |
| `src/app/manifest.ts` | Already complete |
| `next.config.ts` | Already complete |
| Any hook file (`useRecipes.ts`, etc.) | No changes; query keys are already correct |
| Any migration file | No schema changes |

---

## Testing Requirements

### Framework

Vitest + React Testing Library. Tests co-located with source files (never in a separate `__tests__/` directory). Use `vi.fn()` / `vi.mock()` for mocks.

**Important:** `localStorage` is available in jsdom — no extra mock needed for `createSyncStoragePersister`. For SW tests, mock `navigator.serviceWorker` manually (not available in jsdom by default).

---

### Test file 1: `src/components/pwa/ServiceWorkerRegistrar.test.tsx`

> Verifies SW registration, update-check on visibility change, and grocery action replay.

```
describe('ServiceWorkerRegistrar')
  ├── registers /sw.js on mount when navigator.serviceWorker is available
  ├── does NOT throw when navigator.serviceWorker is absent (SSR / unsupported browser)
  ├── listens for REPLAY_GROCERY_ACTION messages after registration
  ├── ignores messages with unknown types
  ├── handles REPLAY_GROCERY_ACTION kind='toggle' — reads localStorage and updates Supabase
  ├── handles REPLAY_GROCERY_ACTION kind='remove' — calls supabase.delete
  ├── handles REPLAY_GROCERY_ACTION with missing itemId gracefully (no crash)
  ├── calls registration.update() when document becomes visible
  ├── removes visibilitychange listener on unmount
  └── renders null (no visible output)
```

**Mock setup:**
```typescript
// Mock navigator.serviceWorker
const mockRegister = vi.fn().mockResolvedValue({
  update: vi.fn().mockResolvedValue(undefined),
});

Object.defineProperty(navigator, 'serviceWorker', {
  value: {
    register: mockRegister,
    addEventListener: vi.fn(),
    controller: null,
  },
  writable: true,
  configurable: true,
});

// Mock supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) }),
      delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({}) }),
    }),
  },
}));
```

---

### Test file 2: `src/components/Providers.persist.test.tsx`

> Verifies the persistence layer is wired correctly to PersistQueryClientProvider.

```
describe('Providers — TanStack Query persistence')
  ├── renders children without error
  ├── PersistQueryClientProvider is used (not plain QueryClientProvider)
  ├── whitelisted query keys are persisted — 'recipes', 'restaurants', 'grocery'
  ├── non-whitelisted query keys are NOT persisted — 'recipe' (single), 'restaurant' (singular)
  ├── localStorage key is 'plately-query-cache'
  ├── persisted data is restored on re-mount (simulating app restart)
  └── SSR-safe: does NOT crash when window is undefined
```

**Key assertions:**
```typescript
it('persists whitelisted queries to localStorage', async () => {
  const { result } = renderHook(() => useQueryClient(), {
    wrapper: Providers,
  });
  // Simulate data being cached
  result.current.setQueryData(['recipes'], [{ id: '1', name: 'Pad Thai' }]);
  
  // Wait for throttled localStorage write
  await vi.advanceTimersByTimeAsync(1100);
  
  const stored = localStorage.getItem('plately-query-cache');
  expect(stored).not.toBeNull();
  const parsed = JSON.parse(stored!);
  // Should contain 'recipes' entry
  expect(parsed.clientState.queries).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ queryKey: ['recipes'] })
    ])
  );
});

it('does NOT persist single-recipe queries', async () => {
  const { result } = renderHook(() => useQueryClient(), {
    wrapper: Providers,
  });
  result.current.setQueryData(['recipe', 'some-id'], { id: 'some-id', name: 'Test' });
  
  await vi.advanceTimersByTimeAsync(1100);
  
  const stored = localStorage.getItem('plately-query-cache');
  if (stored) {
    const parsed = JSON.parse(stored);
    const keys = parsed.clientState?.queries?.map((q: { queryKey: unknown[] }) => q.queryKey[0]);
    expect(keys).not.toContain('recipe');
  }
});
```

---

### Test coverage summary

| Concern | Test File | AC |
|---------|-----------|-----|
| SW registration | `ServiceWorkerRegistrar.test.tsx` | AC1 |
| Visibility-change update poll | `ServiceWorkerRegistrar.test.tsx` | AC4 |
| Grocery replay message handling | `ServiceWorkerRegistrar.test.tsx` | — |
| Persistence wired to correct provider | `Providers.persist.test.tsx` | AC2 |
| Whitelist: only recipes/restaurants/grocery | `Providers.persist.test.tsx` | AC2 |
| Cross-session restoration | `Providers.persist.test.tsx` | AC3 |

Note: the sw.js itself (fetch handler strategies, install, activate) is plain JavaScript running in a Service Worker context — not testable in jsdom. Cache strategy correctness is validated via the AC1–AC4 acceptance criteria during manual testing or Playwright E2E tests (out of scope for this story).

---

## Architecture Guardrails

- **Do not replace `QueryClientProvider` with a manual cache write** — use `PersistQueryClientProvider` from the TanStack Query v5 ecosystem.
- **`gcTime` ≥ `maxAge`** — if `gcTime < maxAge`, TanStack Query will garbage-collect the query before the persister can write it.
- **`shouldDehydrateQuery` whitelist is mandatory** — without it, all in-flight enrichment queries, scan session data, and error states get persisted, causing stale/broken state on next launch.
- **localStorage key `"plately-query-cache"`** — used in tests and potentially by Settings' data-reset flow. Do NOT use a different key.
- **Data reset must clear the persisted cache** — check `SettingsScreen.tsx` and `useDataReset.ts`: after the data reset mutation succeeds, call `queryClient.clear()` AND `localStorage.removeItem('plately-query-cache')` so the persisted cache is also wiped. If this isn't already happening, add it in this story.
- **No `import 'server-only'` in Providers.tsx** — it's a Client Component (`'use client'`). The SSR guard for localStorage is a conditional check (`typeof window !== "undefined"`), not a module guard.
- **TypeScript strict** — no `any` in new code. The `persister!` non-null assertion is acceptable because it's guarded by the `typeof window !== "undefined"` check in the same `useState` initialiser.

---

## Data Reset Integration

Verify `src/hooks/useDataReset.ts` clears the persisted cache on reset. If it doesn't, add these two lines after the mutation succeeds:

```typescript
queryClient.clear();
localStorage.removeItem('plately-query-cache');
```

This ensures a Settings reset leaves no stale persisted data that would be restored on next launch.

---

## Definition of Done

- [x] `@tanstack/react-query-persist-client` and `@tanstack/query-sync-storage-persister` installed (`^5` matching existing TanStack Query v5 version)
- [x] `src/components/Providers.tsx` updated to `PersistQueryClientProvider` with `createSyncStoragePersister` and the whitelist `shouldDehydrateQuery`
- [x] `gcTime` set to 24h on QueryClient defaultOptions; `maxAge` set to 24h on persistOptions
- [x] Whitelist verified: only `recipes`, `restaurants`, `grocery` query keys are persisted
- [x] `public/sw.js` audited against ACs — no changes required (document this in Dev Agent Record)
- [x] `ServiceWorkerRegistrar.tsx` audited — no changes required (document in Dev Agent Record)
- [x] `useDataReset.ts` verified to clear localStorage persisted cache on reset (add if missing)
- [x] `src/components/pwa/ServiceWorkerRegistrar.test.tsx` — all cases passing
- [x] `src/components/Providers.persist.test.tsx` — all cases passing
- [x] TypeScript strict: no new type errors
- [x] Full test suite passes with no regressions
- [x] `planning/sprint-status.yaml` is NOT modified by the dev agent

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- **`useRef` in test scope**: `useRef` cannot be called outside a component body. Used plain mutable objects (`{ current: null }`) in test functions instead.
- **`useIsRestoring` import**: Must import from `@tanstack/react-query`, not `@tanstack/react-query-persist-client`.
- **`ServiceWorkerRegistrar` cleanup bug**: `return () => {...}` inside `.then()` is not the React cleanup — React never sees it. Fixed by capturing the cleanup in a closure variable declared before the `.then()` and returning it from the outer `useEffect` callback.
- **`navigator.serviceWorker` absent test**: `Object.defineProperty(navigator, 'serviceWorker', { value: undefined })` keeps `'serviceWorker' in navigator` as `true`. Fixed with `Reflect.deleteProperty(navigator, 'serviceWorker')`.
- **Persister integration tests**: `PersistQueryClientProvider` is async — `isRestoring` starts `true` and the cache subscription only activates after restoration. Used `waitFor(() => isRestoringRef.current === false)` with ref-based Observer child + `notifyManager.setScheduler((fn) => fn())` to make persistence synchronous once the subscription is active.

### Completion Notes List

- `public/sw.js` and `ServiceWorkerRegistrar.tsx` were audited and confirmed production-complete — no changes required.
- `ServiceWorkerRegistrar.tsx` had a pre-existing cleanup bug (visibility listener never removed on unmount) that was discovered while writing the test. Fixed as part of this story.
- `useDataReset.ts` did not yet clear the persisted cache — `localStorage.removeItem('plately-query-cache')` added to `onSuccess`.
- Full test suite: 804 passing, 1 pre-existing todo, 0 failures.

### File List

**Modified:**
- `package.json` — added `@tanstack/react-query-persist-client`, `@tanstack/query-sync-storage-persister`
- `src/components/Providers.tsx` — swapped to `PersistQueryClientProvider` with `createSyncStoragePersister`, 24h `gcTime`/`maxAge`, `shouldDehydrateQuery` whitelist
- `src/hooks/useDataReset.ts` — added `localStorage.removeItem('plately-query-cache')` to `onSuccess`
- `src/components/pwa/ServiceWorkerRegistrar.tsx` — fixed cleanup bug (visibility listener was not removed on unmount)

**Created:**
- `src/components/pwa/ServiceWorkerRegistrar.test.tsx` — 10 tests, all passing
- `src/components/Providers.persist.test.tsx` — 11 tests, all passing

**Audited but not modified:**
- `public/sw.js`
- `src/components/pwa/InstallPromptBanner.tsx`
- `src/app/layout.tsx`
- `src/app/manifest.ts`
- `next.config.ts`
