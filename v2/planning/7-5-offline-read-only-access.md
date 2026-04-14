# Story 7.5: Offline Read-Only Access

Status: review
Epic: 7 — Accessibility, Offline & Production Hardening
Story ID: 7.5
Story Key: 7-5-offline-read-only-access
Created: 2026-04-13

---

## Story

As a user,
I want to browse my saved restaurants and recipes without an internet connection,
So that I can reference dishes I've captured even when I'm offline at a restaurant.

---

## Acceptance Criteria

**AC1 — Collection screens render from cached data**
**Given** the user has previously loaded their collection while online
**When** they open the app with no network connection
**Then** the home screen, restaurant collection, dish lists, and My Recipes all render from cached data — no spinner, no empty states, no error pages

**AC2 — Read interactions work; no network calls for cached data**
**Given** the user is offline and navigates between collection screens
**When** they interact with cached content
**Then** all read interactions (browse, expand dish, view macros) work normally; TanStack Query does not attempt a network fetch for data already in the persisted cache

**AC3 — Specific offline indicator for network-requiring actions only**
**Given** the user is offline and attempts a scan or restaurant search
**When** those actions require network access
**Then** a clear, specific offline indicator is shown for those actions only; the rest of the app remains fully functional and browseable

**AC4 — Seamless network recovery**
**Given** the app returns online after being offline
**When** network access is restored
**Then** the app resumes normal operation — TanStack Query background refetches resume and collection screens silently update without requiring a restart or manual refresh

---

## Foundation: What 7.1 Already Provides

> **MANDATORY FIRST STEP:** Read the current state of `src/components/Providers.tsx`, `src/components/AppShell.tsx`, and `src/components/layout/TabBar.tsx` before writing a line. Story 7.1 is done and live — do NOT reinvent what it provides.

### What 7.1 already implemented (do NOT reinvent)

| File | Status | What it does |
|------|--------|--------------|
| `src/components/Providers.tsx` | ✅ Complete | `PersistQueryClientProvider` with `createSyncStoragePersister`; 24h `gcTime`/`maxAge`; `shouldDehydrateQuery` whitelist for `recipes`, `restaurants`, `grocery` |
| `src/components/AppShell.tsx` | ✅ Complete | `navigator.onLine` detection + `online`/`offline` event listeners; `isOnline` state passed to `TabBar` |
| `src/components/layout/TabBar.tsx` | ✅ Complete | Camera FAB disabled when `!isOnline`; `aria-disabled` + visual indicator dot on camera when offline |
| `public/sw.js` | ✅ Complete | Shell assets cached on install; stale-while-revalidate for same-origin API GET routes; navigation fallback to cached shell |

### AC coverage provided by 7.1's foundation

| AC | Current State | What 7.5 adds |
|----|---------------|---------------|
| AC1 — Collection reads offline | ✅ Partially met — persisted cache restores collection data | Verify query key coverage; ensure no screen shows error/empty when persisted data exists |
| AC2 — No spurious network calls | ✅ Met — TanStack Query `networkMode: 'online'` (default) pauses all queries when offline; `fetchStatus: 'paused'` not `'fetching'` | Explicit `networkMode: 'online'` in QueryClient config to make this permanent |
| AC3 — Camera scan disabled offline | ✅ Met — TabBar disables camera FAB | SearchScreen needs offline indicator (see below) |
| AC4 — Network recovery | ✅ Met — TanStack Query resumes paused queries automatically when `online` event fires | No new code needed |

---

## What This Story Implements

Three targeted additions. Nothing else changes.

### 1. `src/hooks/useOnlineStatus.ts` — extract online detection into a reusable hook

`AppShell.tsx` already has inline `navigator.onLine` detection. Extract it into a standalone hook so `SearchScreen` can also detect offline state without prop drilling or new contexts.

```ts
// src/hooks/useOnlineStatus.ts
"use client";

import { useState, useEffect } from "react";

/**
 * Reactively tracks navigator.onLine.
 * Returns true when network is available, false when offline.
 * SSR-safe: defaults to true on the server.
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
```

### 2. `src/components/AppShell.tsx` — replace inline state with `useOnlineStatus()`

**Current `AppShell.tsx` (lines 35–48 approx):**
```tsx
const [isOnline, setIsOnline] = useState(
  typeof navigator !== "undefined" ? navigator.onLine : true
);

useEffect(() => {
  const handleOnline = () => setIsOnline(true);
  const handleOffline = () => setIsOnline(false);
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);
  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}, []);
```

**Replace with:**
```tsx
const isOnline = useOnlineStatus();
```

Remove the `useState` and `useEffect` for online detection entirely. The `isOnline` variable is then passed to `<TabBar ... isOnline={isOnline} />` exactly as before — no other changes to AppShell.

### 3. `src/components/screens/SearchScreen.tsx` — add offline state

`SearchScreen` makes direct `fetch()` calls to `/api/places/search`. When offline, `fetch()` throws `TypeError: Failed to fetch`. The current catch handler sets `isError: true` and shows a generic error — AC3 requires a specific offline indicator instead.

**Add to SearchScreen (near top of component function body):**
```tsx
const isOnline = useOnlineStatus();
```

**Modify the `fetch` effect (currently fires when `debouncedQuery` meets length threshold):**

```tsx
// Before the fetch call, guard with offline check:
useEffect(() => {
  const trimmed = debouncedQuery.trim();
  if (trimmed.length < MIN_QUERY_LEN) {
    setResults([]);
    setIsError(false);
    return;
  }

  // Offline guard — show specific offline state, don't attempt the API call
  if (!isOnline) {
    setResults([]);
    setIsError(false);   // not an error, just offline
    return;
  }

  // ... existing fetch logic unchanged ...
}, [debouncedQuery, isOnline]);
```

**Add offline UI in the render (below the search input, above results/recents):**
```tsx
{/* Offline notice — shown when user has typed enough to search but is offline */}
{!isOnline && query.trim().length >= MIN_QUERY_LEN && (
  <div
    role="status"
    aria-live="polite"
    className="px-4 py-3 text-center"
    style={{
      background: "rgba(251,243,226,0.95)", // amber tint — same as ScanConfidenceBanner
      borderRadius: 12,
      margin: "0 16px",
      color: "var(--color-text-primary)",
    }}
  >
    <p style={{ fontSize: 14, fontWeight: 600 }}>No internet connection</p>
    <p style={{ fontSize: 13, color: "var(--color-text-secondary)", marginTop: 4 }}>
      Restaurant search requires network access. Your saved collection is available offline.
    </p>
  </div>
)}
```

**Also** clear any in-flight search if the connection drops mid-fetch: add `isOnline` to the `useEffect` deps so the effect re-runs when offline, hitting the early-return guard and cancelling via the `cancelled = true` cleanup.

---

## Codebase Context

### TanStack Query offline behavior — how AC1 and AC2 are already satisfied

TanStack Query v5 with the default `networkMode: 'online'` pauses queries when `navigator.onLine === false`:
- `fetchStatus: 'paused'` — no network request is made
- `status: 'success'` — cached data continues to be served
- `isError: false` — no error state triggered while offline

When the `online` event fires, paused queries automatically resume (AC4). This is built into TanStack Query v5 — **no code changes needed** for this behaviour.

The persisted cache (from 7.1's `PersistQueryClientProvider`) ensures that:
1. On app launch (cold or warm), `localStorage["plately-query-cache"]` is hydrated into the QueryClient
2. While the hydration is in progress, `useIsRestoring() === true` — queries remain `isPending`
3. After hydration (typically <100ms), queries transition to `status: 'success'` with the persisted data

**Cold offline launch flow:**
```
1. App shell loads (service worker serves cached HTML/JS)
2. PersistQueryClientProvider starts restoring localStorage → isRestoring: true
3. Queries show isPending: true → skeleton screens visible briefly (~50–100ms)
4. Restoration completes → isRestoring: false
5. Queries show status: 'success', data: [...persisted data]
6. Collection screens render cached content
7. Background refetch is paused (offline) → fetchStatus: 'paused'
```

The brief skeleton flash (step 3) during offline cold launch is acceptable — it resolves to content within ~100ms.

### Persistence whitelist coverage audit

All collection screen queries are covered by the `shouldDehydrateQuery` whitelist in `Providers.tsx`:

| Hook | Query Key | key[0] | Persisted? |
|------|-----------|--------|-----------|
| `useRestaurantsWithRecipes()` | `['restaurants', 'with-recipes']` | `'restaurants'` | ✅ |
| `useRestaurant(id)` | `['restaurants', id]` | `'restaurants'` | ✅ |
| `useRestaurants()` | `['restaurants']` | `'restaurants'` | ✅ |
| `useKeptRecipes()` | `['recipes', 'kept']` | `'recipes'` | ✅ |
| `useRecipesByRestaurant(rid)` | `['recipes', 'restaurant', rid]` | `'recipes'` | ✅ |
| `useRecipe(id)` | `['recipes', id]` | `'recipes'` | ✅ |
| `useGroceryItems()` | `['grocery']` | `'grocery'` | ✅ |

No whitelist changes needed.

### Error state interaction — why collection screens already handle offline correctly

HomeScreen (and RecipesScreen, RestaurantScreen) checks `isError` before showing content. In the offline case with persisted data, `isError === false` because:
- TanStack Query pauses the background refetch (not fails it)
- `status` stays `'success'` while the cached data exists

The `isError` path would only fire if a Supabase query actually ran and failed (e.g. explicit `.parse()` error, transient server error, or `networkMode` override). None of these apply in normal offline operation.

### `networkMode: 'online'` — make it explicit

The QueryClient in `Providers.tsx` does not set `networkMode` explicitly — it defaults to `'online'`. To prevent a future developer from accidentally setting `networkMode: 'always'` (which would bypass offline pausing and cause errors), add it explicitly:

```tsx
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: PERSIST_MAX_AGE_MS,
      retry: 1,
      networkMode: 'online',  // ADD: explicit; pauses background fetches when offline
    },
  },
})
```

### SearchScreen's direct fetch() calls — why they need separate handling

`SearchScreen` does **not** use TanStack Query — it calls `fetch('/api/places/search', ...)` directly in a `useEffect`. This bypasses TanStack Query's offline-awareness entirely. When offline, `fetch()` throws `TypeError: Failed to fetch`. Without the `isOnline` guard:
- User types 3+ characters
- Fetch throws
- `isError: true` → generic error message ("Something went wrong") 
- User confused: looks like a bug, not an offline indicator

With the `isOnline` guard, the `useEffect` exits early before calling `fetch()` and shows the specific offline notice instead.

### Key file locations

| File | Purpose |
|------|---------|
| `src/hooks/useOnlineStatus.ts` | **NEW** — online detection hook |
| `src/components/AppShell.tsx` | **MODIFY** — use `useOnlineStatus()` hook |
| `src/components/screens/SearchScreen.tsx` | **MODIFY** — offline guard + offline UI |
| `src/components/Providers.tsx` | **MODIFY** — add explicit `networkMode: 'online'` |
| `src/components/layout/TabBar.tsx` | **AUDIT** — camera FAB already handles offline; no changes needed |
| `src/components/screens/HomeScreen.tsx` | **AUDIT** — error handling is offline-safe; no changes needed |
| `src/components/screens/RecipesScreen.tsx` | **AUDIT** — error handling is offline-safe; no changes needed |

---

## Dev Notes

### How to test offline behaviour manually

1. **Chrome DevTools offline simulation** (recommended for development):
   - Open Chrome DevTools → Application → Service Workers OR Network tab
   - In Network tab: set throttle dropdown to "Offline"
   - Alternatively: DevTools → Application → Service Workers → check "Offline" checkbox
   - Navigate to Home, Restaurants, My Recipes — verify cached data renders
   - Navigate to Search → type 3+ chars → verify offline notice appears
   - Tap the camera FAB area — confirm it is visually disabled and non-interactive

2. **iPhone Safari PWA test** (required for AC3 validation with real device):
   - Install the app to home screen
   - Enable Airplane Mode
   - Launch from home screen icon
   - Verify collection screens show saved data
   - Navigate to Search → verify offline indicator

3. **Network recovery test**:
   - Go offline (devtools)
   - Browse collection screens — confirm data shows
   - Re-enable network
   - Wait 5 seconds — TanStack Query should background-refetch automatically
   - Confirm no manual refresh required

### How to verify the `networkMode: 'online'` pause behavior

In the browser console while the app is running with DevTools offline:

```js
// Check the QueryClient's query cache
const qc = window.__REACT_QUERY_DEVTOOLS__ // if devtools installed
// Or use TanStack Query devtools UI in development
```

Alternatively, add a temporary `console.log` to `fetchRestaurantsWithRecipes()` — if offline and data is cached, the log should NOT appear (fetch function never called). Remove before committing.

### Why `useOnlineStatus()` hook vs. Context

Option A (hook): Each component independently tracks `navigator.onLine` via its own event listeners. Two listeners on the same events is negligible overhead. Cleanest approach — no prop drilling, no context.

Option B (context in AppShell): AppShell already owns `isOnline`; could expose it via a new `OnlineStatusContext`. Adds a new context, new file, new provider wrapping. Overkill for two consumer components.

Option C (prop drilling from AppShell): AppShell → layout → page → SearchScreen. Requires changes to route layouts. Too invasive.

**Decision: Option A** — `useOnlineStatus()` hook. SearchScreen and AppShell both call it independently. The duplicate listeners are safe and idempotent.

### SearchScreen: `isOnline` in effect deps

The `useEffect` for the Places search currently has `// coords intentionally excluded` in deps. When adding `isOnline` to deps:
- If user goes offline mid-type: `isOnline` changes → effect re-fires → `!isOnline` early return → `cancelled = true` (cleanup) fires for the in-flight fetch → in-flight request is abandoned ✅
- If user comes back online: `isOnline` changes → effect re-fires → fetch runs again with current query ✅

This is the correct behavior. Add `isOnline` to the effect deps array without the `eslint-disable` comment override.

### GroceryScreen — no changes needed

`GroceryScreen` reads from both `useGroceryItems()` (TanStack Query, queryKey `['grocery']` — persisted ✅) and `readGroceryList()` from `grocery-store.ts` (local state). Both are available offline. No changes needed.

---

## Testing Requirements

### Framework

Vitest + React Testing Library. Tests co-located with source files — never in a separate `__tests__/` directory. Use `vi.fn()` / `vi.mock()` for mocks.

---

### Test file 1: `src/hooks/useOnlineStatus.test.ts`

```
describe('useOnlineStatus')
  ├── returns true when navigator.onLine is true on mount
  ├── returns false when navigator.onLine is false on mount
  ├── updates to false when the "offline" event fires
  ├── updates to true when the "online" event fires
  ├── removes event listeners on unmount
  └── defaults to true when navigator is undefined (SSR guard)
```

**Mock setup:**
```ts
// Override navigator.onLine
Object.defineProperty(navigator, 'onLine', {
  writable: true,
  configurable: true,
  value: true,
});

// Fire offline/online events
window.dispatchEvent(new Event('offline'));
window.dispatchEvent(new Event('online'));
```

---

### Test file 2: `src/components/screens/SearchScreen.offline.test.tsx`

```
describe('SearchScreen — offline behaviour')
  ├── shows nothing special when query is short (< 3 chars) and offline
  ├── shows offline notice when 3+ chars typed and offline (not generic error)
  ├── offline notice has role="status" and aria-live="polite"
  ├── does NOT call fetch() when offline and query meets threshold
  ├── shows normal search flow when online
  └── when going offline mid-search: pending fetch is cancelled; offline notice appears
```

**Key assertions:**
```tsx
it('shows offline notice instead of fetching when offline', async () => {
  // Arrange: set navigator.onLine = false
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  window.dispatchEvent(new Event('offline'));

  const fetchSpy = vi.spyOn(global, 'fetch');
  render(<SearchScreen />);

  // Type a query
  const input = screen.getByRole('searchbox');  // or getByPlaceholderText
  await userEvent.type(input, 'pad thai');

  // Wait for debounce
  await vi.advanceTimersByTimeAsync(300);

  // Should show offline notice
  expect(screen.getByRole('status')).toHaveTextContent('No internet connection');
  expect(screen.getByText(/Restaurant search requires network access/)).toBeInTheDocument();

  // Should NOT have called fetch
  expect(fetchSpy).not.toHaveBeenCalled();
});

it('does not show offline notice for short queries', async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  window.dispatchEvent(new Event('offline'));

  render(<SearchScreen />);
  const input = screen.getByRole('searchbox');
  await userEvent.type(input, 'pa');  // < 3 chars

  await vi.advanceTimersByTimeAsync(300);

  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
```

---

### Test coverage summary

| Concern | Test File | AC |
|---------|-----------|-----|
| Online detection — initial state | `useOnlineStatus.test.ts` | AC2 |
| Online detection — event-driven updates | `useOnlineStatus.test.ts` | AC4 |
| Offline: no fetch() when offline + 3+ chars typed | `SearchScreen.offline.test.tsx` | AC3 |
| Offline: specific notice (not generic error) shown | `SearchScreen.offline.test.tsx` | AC3 |
| Offline notice is accessible (role/aria-live) | `SearchScreen.offline.test.tsx` | NFR11 |
| Fetch resumes when going back online | `SearchScreen.offline.test.tsx` | AC4 |

**ACs that cannot be Vitest-tested:**

| AC | Reason | Required method |
|----|--------|-----------------|
| AC1 — Collection renders from cache | Requires localStorage restoration + real TanStack Query dehydration/hydration cycle; difficult to replicate in jsdom | Manual DevTools offline test or Playwright with `--offline` flag |
| AC4 — Network recovery | Requires real `online`/`offline` browser event triggering TanStack Query resumption | Manual DevTools test or Playwright CDP network conditions |

---

## Architecture Guardrails

- **Do NOT override `networkMode`** — the default `'online'` is what makes offline-pause work. Setting `networkMode: 'always'` would cause queries to fail with `isError: true` instead of pausing gracefully.
- **Do NOT add a separate offline state to TanStack Query** — the persister + `networkMode: 'online'` is the complete solution. No custom "offline cache" or `localStorage` reading in hooks.
- **Do NOT change `shouldDehydrateQuery` in Providers.tsx** — the current whitelist (`recipes`, `restaurants`, `grocery`) is correct and tested. Adding to it is allowed if a new query key is introduced; narrowing it breaks offline reads.
- **`useOnlineStatus()` is SSR-safe** — `typeof navigator !== 'undefined'` guard ensures no server-side crash. Do not remove this guard.
- **SearchScreen fetch effect cancellation** — the `cancelled = true` pattern in the existing `useEffect` already handles React StrictMode double-invocation and query changes. When adding `isOnline` to deps, the `cancelled = true` cleanup correctly aborts in-flight fetches when going offline.
- **No PII in offline notices** — the offline notice text must not include user data (restaurant names, query strings). Only generic "No internet connection" messaging (SEC-DAT-1.00).
- **TypeScript strict** — `useOnlineStatus()` returns `boolean` (not `boolean | undefined`). The SSR fallback `true` keeps the type strict.
- **Do NOT modify `public/sw.js`** — already complete; offline shell caching is not changed in this story.
- **Do NOT modify `src/components/pwa/ServiceWorkerRegistrar.tsx`** — already complete.

---

## Definition of Done

- [x] `src/hooks/useOnlineStatus.ts` created; returns `boolean`; SSR-safe
- [x] `src/components/AppShell.tsx` updated to use `useOnlineStatus()` hook; inline state/effect for online detection removed
- [x] `src/components/Providers.tsx` updated to add `networkMode: 'online'` to QueryClient defaultOptions
- [x] `src/components/screens/SearchScreen.tsx` updated with `isOnline` guard in fetch effect and offline notice UI
- [x] Offline notice in SearchScreen: amber tint surface, `role="status"`, `aria-live="polite"`, specific text distinguishing offline from error
- [x] `isOnline` added to the SearchScreen fetch effect's deps array
- [x] `src/hooks/useOnlineStatus.test.ts` created; all 6 cases passing
- [x] `src/components/screens/SearchScreen.offline.test.tsx` created; all cases passing
- [ ] Manual verification: collection screens (Home, Restaurants, My Recipes) render cached data when DevTools offline is enabled
- [ ] Manual verification: camera FAB visually disabled when offline (TabBar already handles this; just confirm no regression)
- [ ] Manual verification: going back online resumes TanStack Query background fetches without page refresh
- [x] TypeScript strict: no new type errors introduced
- [x] Full test suite passes with no regressions
- [x] `planning/sprint-status.yaml` is NOT modified by the dev agent

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Created `src/hooks/useOnlineStatus.ts`: SSR-safe hook wrapping navigator.onLine with online/offline event listeners. Returns `boolean`. Used by both AppShell and SearchScreen.
- Updated `src/components/AppShell.tsx`: Replaced 12 lines of inline useState/useEffect for online detection with a single `const isOnline = useOnlineStatus()` call. No functional change — isOnline still passed to TabBar unchanged.
- Updated `src/components/Providers.tsx`: Added explicit `networkMode: "online"` to QueryClient defaultOptions. This makes the behaviour permanent and defensive against a future developer accidentally setting networkMode to 'always'.
- Updated `src/components/screens/SearchScreen.tsx`: Added isOnline guard to the Places search useEffect (early-return before fetch when offline) and offline notice UI (amber tint, role="status", aria-live="polite", specific messaging). Added isOnline to effect deps array so going offline mid-search cancels the in-flight fetch via the cancelled=true cleanup.
- Created `src/hooks/useOnlineStatus.test.ts`: 6 cases covering initial true/false states, event-driven updates (offline/online events), listener cleanup on unmount, and SSR guard (returns boolean not undefined). All pass.
- Created `src/components/screens/SearchScreen.offline.test.tsx`: 6 cases covering short query (no notice), 3+ char query offline (notice shown), ARIA attributes, no fetch when offline, normal fetch when online, and mid-search offline transition. All pass. Used fireEvent.change + act(vi.advanceTimersByTime) pattern to avoid userEvent fake-timer timeouts.
- Full suite: 904 tests pass (1 todo), 0 regressions. Zero new TypeScript errors.
- Manual verification items (AC1, AC4 network recovery, camera FAB regression check) require browser DevTools offline simulation — cannot be automated in jsdom. Architecture guarantees these work: 7.1's PersistQueryClientProvider handles AC1; TanStack Query's built-in networkMode handles AC4; TabBar's existing isOnline prop is unchanged.

### File List

- `src/hooks/useOnlineStatus.ts` — NEW
- `src/hooks/useOnlineStatus.test.ts` — NEW
- `src/components/screens/SearchScreen.offline.test.tsx` — NEW
- `src/components/AppShell.tsx` — MODIFIED (replaced inline online detection with hook)
- `src/components/Providers.tsx` — MODIFIED (added networkMode: 'online')
- `src/components/screens/SearchScreen.tsx` — MODIFIED (offline guard + offline notice UI)

### Change Log

- 2026-04-13: Implemented story 7.5 — offline read-only access. Extracted useOnlineStatus hook, wired into AppShell and SearchScreen. Added explicit networkMode to QueryClient. Added offline notice UI to SearchScreen with accessible markup. 12 new tests, 0 regressions.
