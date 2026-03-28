# Story 5.2: Search Screen UI & Restaurant Results

**Status:** done
**Story ID:** 5.2
**Epic:** 5 — Manual Search & Discovery

---

## Story

As a first-time or returning user,
I want to search for a restaurant or dish by name,
So that I can get a recipe without needing to scan anything.

---

## Acceptance Criteria

**AC1 — Empty state (no query entered)**
Given the Search tab is opened
When no search query has been entered
Then the screen shows:
- A "Search" heading (`text-2xl`, `text-primary`)
- A glass search input with `border-radius: var(--radius-full)`, 52pt height, a search icon, and placeholder "Dish, restaurant..."
- Recent searches rendered as rows below the input (50pt rows, glass, `radius-md`), or nothing if no prior searches exist
- Suggestion copy at the bottom: "Try: 'carbonara', 'sushi', 'bistro near me'" (`text-xs`, `text-tertiary`)

**AC2 — Debounced search fires at 3+ characters**
Given the user types in the search input
When the typed query reaches 3 or more characters and the 300ms debounce expires
Then `GET /api/search/restaurants?q=[debouncedQuery]` is called exactly once; no request fires per keystroke; no request fires for queries shorter than 3 characters

**AC3 — Restaurant results display**
Given the search API call returns results
When results are rendered
Then each restaurant displays as a glass card containing: restaurant name, address, and either the `imageUrl` or a placeholder icon; all cards are tappable

**AC4 — Restaurant card tap navigates**
Given search results are displayed
When the user taps a restaurant card
Then `router.push('/restaurants/' + result.googlePlacesId)` is called; the destination page (Story 5.4) may not yet exist — a 404 or stub is acceptable at this point

**AC5 — Recent searches persist and re-run**
Given a previous search was made
When the Search screen is opened (or the input is cleared/unfocused)
Then recent searches appear as rows below the input; tapping one populates the input and immediately triggers the search for that query; recent searches are stored in `localStorage` under key `plately-recent-searches`, capped at 5 entries (most-recent first), serialised as a `string[]`; a search is saved when the user taps a restaurant card (saving the debounced query value at tap time) or taps a recent search row (saving that term); saves are deduplicated case-insensitively

**AC6 — Error state is not a dead end**
Given Google Places is unavailable or the network call fails
When the error renders
Then an error message is shown with a retry button; the suggestion copy ("Try: 'carbonara', 'sushi', 'bistro near me'") remains visible below the error; tapping retry re-triggers the search

**AC7 — Offline guard preserved**
Given the user is offline when the Search tab opens
When `useOnlineStatus()` returns `false`
Then the offline message from the pre-existing `page.tsx` stub is rendered unchanged; no search UI (input, results, recent searches) is shown; the offline guard lives inside `SearchScreen` — the component is mounted but renders only the offline message

---

## Tasks / Subtasks

### Task 1: Create `src/hooks/use-search.ts`

- [x] Add `'use client'` directive at the top
- [x] Import `useQuery` from `@tanstack/react-query`; import `RestaurantSearchResult`, `ApiSuccess` from `@/types/api`
- [x] Implement a `useDebounce<T>(value: T, delay: number): T` helper (can be inline in the file or imported if a shared `use-debounce.ts` hook already exists — check first)
- [x] Implement `useRestaurantSearch(query: string)`:
  - Debounce the query with 300ms delay inside the hook
  - Pass `['search', 'restaurants', debouncedQuery]` as the `queryKey`
  - Set `enabled: debouncedQuery.length >= 3` so no fetch fires for short queries
  - `queryFn` calls `fetch('/api/search/restaurants?q=' + encodeURIComponent(debouncedQuery))`, checks `res.ok`, parses json, returns `(json as ApiSuccess<RestaurantSearchResult[]>).data`
  - On non-ok response, throw `new Error((json as { error?: string }).error ?? 'Search failed')`
  - Return the full `useQuery` result object so the component gets `data`, `isLoading`, `isError`, `error`, and `refetch`
- [x] Export `useRestaurantSearch` as a named export
- [x] Write `src/hooks/use-search.test.ts` — mock `fetch`; test: query shorter than 3 chars → no fetch, query >= 3 chars → fetch called with encoded query, error response → `isError` true

### Task 2: Create `src/components/search/` directory and `search-screen.tsx`

- [x] Create the directory `src/components/search/` (it does not exist yet)
- [x] Create `src/components/search/search-screen.tsx` with `'use client'` directive
- [x] Implement `SearchScreen` as a named export (PascalCase component, kebab-case file)
- [x] Import and use `useRestaurantSearch` from `@/hooks/use-search`
- [x] Import `GlassCard` from `@/components/ui/glass-card`
- [x] Import `ErrorState` from `@/components/ui/error-state`
- [x] Import `useRouter` from `next/navigation`
- [x] Manage controlled input state with `useState<string>('')` for the raw query value
- [x] Manage recent searches with `useState<string[]>` initialised from `localStorage` (see Dev Notes for safe initialisation pattern)
- [x] Render the full UI per the UX spec (see Dev Notes: Layout section)
- [x] On restaurant card tap, call `router.push('/restaurants/' + result.googlePlacesId)`
- [x] On form/search submission (Enter key or suggestion tap), save the query to recent searches (see Dev Notes: Recent Searches)
- [x] Pass `onRetry={refetch}` to `ErrorState` so retries re-trigger the query

### Task 3: Update `src/app/search/page.tsx`

- [x] Remove the `'use client'` directive from `page.tsx` — make it a server component (thin wrapper)
- [x] Remove all placeholder content ("Coming in Story 5.2")
- [x] Keep the `useOnlineStatus()` offline guard inline in `page.tsx` **or** move it into `SearchScreen` — see Dev Notes for the correct approach
- [x] Render `<SearchScreen />` from `@/components/search/search-screen`
- [x] Do NOT import `useOnlineStatus` in `page.tsx` if it becomes a Server Component — move the guard into `SearchScreen` instead (see Dev Notes)

### Task 4: Types — no changes required

- [x] Confirm `RestaurantSearchResult` and `SearchDishResponse` already exist in `src/types/api.ts` (added in Story 5.1) — no new types needed for this story
- [x] If Story 5.1 is not yet merged and the types are missing, add them now (shapes are documented in Dev Notes below)

### Task 5: Tests

- [x] `src/hooks/use-search.test.ts` — covered in Task 1
- [x] `src/components/search/search-screen.test.tsx` — render with no query (offline guard skipped, search UI renders), render with query >= 3 chars (loading indicator appears), render with error response (ErrorState renders with retry button), render with results (GlassCards rendered, count matches data length), tap card → `router.push` called with correct path, tap recent search → input populated and search triggered

---

## Dev Notes

### Architecture Compliance

| Concern | Decision |
|---|---|
| Component location | `src/components/search/search-screen.tsx` — this directory is new, create it |
| Hook location | `src/hooks/use-search.ts` — same directory as all other hooks |
| TanStack query keys | `['search', 'restaurants', debouncedQuery]` — architecture-defined; do not invent alternatives |
| API call pattern | `fetch('/api/search/restaurants?q=...')` — same pattern as `use-recipes.ts`; never call external APIs directly from a component |
| No supabase in this story | `src/integrations/supabase/` is not touched; this story only calls the internal Next.js API route |
| Types source | `@/types/api` — `RestaurantSearchResult`, `ApiSuccess`; do not inline complex types in components |
| Error shape | The route returns `{ error: string, code: string }` on failure; the hook throws a `new Error(json.error)` and TanStack Query exposes it via `isError` / `error` |
| `'use client'` boundary | `search-screen.tsx` must have `'use client'` (uses hooks, router, localStorage). `page.tsx` should become a Server Component that simply renders `<SearchScreen />`. Move the offline guard into `SearchScreen`. |
| Recent searches | `localStorage` only — key `plately-recent-searches`, max 5 entries, `JSON.stringify(string[])`. No Supabase. No API call. |
| Navigation on tap | `router.push('/restaurants/' + result.googlePlacesId)` — the destination is a stub/404 until Story 5.4 |
| `next build` script | `next build --webpack` — do not change; Turbopack incompatibility with next-pwa (learned in Story 4.4) |

### Server Component Conversion for `page.tsx`

The current `page.tsx` uses `'use client'` because it calls `useOnlineStatus()`. Story 5.2 converts it to a Server Component by moving all client logic into `SearchScreen`.

**Before (stub):**
```tsx
'use client'
import { useOnlineStatus } from '@/hooks/use-online-status'
export default function SearchPage() {
  const isOnline = useOnlineStatus()
  if (!isOnline) { /* offline message */ }
  return <p>Coming in Story 5.2</p>
}
```

**After (this story):**
```tsx
// src/app/search/page.tsx — Server Component (no 'use client')
import { SearchScreen } from '@/components/search/search-screen'
export default function SearchPage() {
  return <SearchScreen />
}
```

```tsx
// src/components/search/search-screen.tsx — Client Component
'use client'
import { useOnlineStatus } from '@/hooks/use-online-status'
// ... other imports

export function SearchScreen() {
  const isOnline = useOnlineStatus()
  if (!isOnline) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-4 text-center px-6">
        <p style={{ fontSize: 'var(--text-2xl)', color: 'var(--text-primary)' }}>No internet connection</p>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          Search requires an internet connection. Your grocery list and saved recipes are still available offline.
        </p>
      </div>
    )
  }
  // ... search UI
}
```

The offline message text must match the existing stub exactly (copy it verbatim).

### Hook Implementation: `use-search.ts`

Follow `use-recipes.ts` exactly for structure. Key differences: `enabled` gate, debounce, no mutation.

```typescript
'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RestaurantSearchResult, ApiSuccess } from '@/types/api'

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return debounced
}

async function fetchRestaurants(query: string): Promise<RestaurantSearchResult[]> {
  const res = await fetch('/api/search/restaurants?q=' + encodeURIComponent(query))
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error((json as { error?: string }).error ?? 'Search failed')
  }
  const json = await res.json()
  return (json as ApiSuccess<RestaurantSearchResult[]>).data
}

export function useRestaurantSearch(query: string) {
  const debouncedQuery = useDebounce(query, 300)
  return useQuery({
    queryKey: ['search', 'restaurants', debouncedQuery],
    queryFn: () => fetchRestaurants(debouncedQuery),
    enabled: debouncedQuery.length >= 3,
  })
}
```

### Layout: `SearchScreen` Component Structure

```
<div className="flex flex-col flex-1 px-[var(--spacing-4)] pt-[var(--spacing-6)] gap-[var(--spacing-4)]">

  {/* Heading */}
  <h1 style={{ fontSize: 'var(--text-2xl)', color: 'var(--text-primary)', fontWeight: 600 }}>
    Search
  </h1>

  {/* Search input — glass, radius-full, 52pt height */}
  <div style={{ position: 'relative' }}>
    <SearchIcon />  {/* absolute-positioned left */}
    <input
      type="search"
      value={query}
      onChange={e => setQuery(e.target.value)}
      placeholder="Dish, restaurant..."
      style={{
        height: 52,
        borderRadius: 'var(--radius-full)',
        paddingLeft: 44,   /* space for icon */
        /* glass treatment — match glass-card.tsx glass-card class or inline: */
        background: 'var(--glass-strip-bg)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid var(--glass-border)',
        color: 'var(--text-primary)',
        width: '100%',
      }}
    />
  </div>

  {/* Recent searches — shown when query is empty and recentSearches.length > 0 */}
  {query === '' && recentSearches.length > 0 && (
    <div className="flex flex-col gap-[var(--spacing-2)]">
      {recentSearches.map(term => (
        <GlassCard
          key={term}
          style={{ height: 50, display: 'flex', alignItems: 'center', padding: '0 var(--spacing-4)', cursor: 'pointer' }}
          onClick={() => handleRecentSearchTap(term)}
        >
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>{term}</span>
        </GlassCard>
      ))}
    </div>
  )}

  {/* Results area — shown when query.length >= 3 */}
  {query.length >= 3 && (
    <>
      {isLoading && <LoadingSpinner />}
      {isError && (
        <ErrorState
          message="Search is unavailable right now."
          onRetry={refetch}
        />
      )}
      {data && data.map(result => (
        <RestaurantCard key={result.googlePlacesId} result={result} onTap={handleCardTap} />
      ))}
    </>
  )}

  {/* Suggestion copy — always visible at bottom */}
  <div style={{ marginTop: 'auto', paddingBottom: 'var(--spacing-4)' }}>
    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
      Try: 'carbonara', 'sushi', 'bistro near me'
    </p>
  </div>

</div>
```

Note: The suggestion copy must remain visible even when `isError` is true (UX-DR8). Using `marginTop: auto` on the bottom div achieves this naturally since the error state does not push it off-screen.

### Restaurant Card Sub-Component

Extract into a named component within `search-screen.tsx` (not a separate file — it's only used here):

```tsx
function RestaurantCard({
  result,
  onTap,
}: {
  result: RestaurantSearchResult
  onTap: (result: RestaurantSearchResult) => void
}) {
  return (
    <GlassCard
      animate={false}  // list manages its own animation if needed
      className="flex gap-[var(--spacing-3)] p-[var(--spacing-3)] cursor-pointer"
      onClick={() => onTap(result)}
      role="button"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onTap(result) }}
      aria-label={`View ${result.name}`}
    >
      {/* Image or placeholder */}
      {result.imageUrl ? (
        <img
          src={result.imageUrl}
          alt={result.name}
          style={{ width: 56, height: 56, borderRadius: 'var(--radius-sm)', objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            width: 56, height: 56, borderRadius: 'var(--radius-sm)', flexShrink: 0,
            background: 'var(--glass-strip-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* Placeholder icon — use a building/fork icon from lucide-react */}
          <UtensilsIcon size={24} style={{ color: 'var(--text-tertiary)' }} />
        </div>
      )}

      {/* Text */}
      <div className="flex flex-col justify-center gap-[var(--spacing-1)] min-w-0">
        <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: 600 }}
           className="truncate">
          {result.name}
        </p>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}
           className="truncate">
          {result.address}
        </p>
      </div>
    </GlassCard>
  )
}
```

### Recent Searches: localStorage Pattern

SSR-safe initialisation (avoids `window is not defined` on server):

```typescript
const [recentSearches, setRecentSearches] = useState<string[]>(() => {
  if (typeof window === 'undefined') return []
  try {
    const stored = localStorage.getItem('plately-recent-searches')
    return stored ? (JSON.parse(stored) as string[]) : []
  } catch {
    return []
  }
})
```

Save on successful search (when user presses Enter or taps a suggestion):

```typescript
function saveRecentSearch(term: string) {
  setRecentSearches(prev => {
    const updated = [term, ...prev.filter(t => t !== term)].slice(0, 5)
    try { localStorage.setItem('plately-recent-searches', JSON.stringify(updated)) } catch {}
    return updated
  })
}
```

Recent search tap handler:

```typescript
function handleRecentSearchTap(term: string) {
  setQuery(term)
  // TanStack Query will fire automatically once debouncedQuery updates;
  // saveRecentSearch here so it bubbles to top
  saveRecentSearch(term)
}
```

### `ErrorState` Component Compatibility

`ErrorState` in `src/components/ui/error-state.tsx` accepts:
- `message: string`
- `onRetry: () => void`
- `onUploadInstead?: () => void` (optional — omit it here)

Pass `refetch` from `useRestaurantSearch` directly as `onRetry`:

```tsx
const { data, isLoading, isError, error, refetch } = useRestaurantSearch(query)
// ...
<ErrorState message="Search is unavailable right now." onRetry={refetch} />
```

Note: `refetch` from TanStack Query v5 returns a `Promise` — TypeScript may warn about the mismatch with `() => void`. Cast it: `onRetry={() => { void refetch() }}`.

### `GlassCard` Component Compatibility

`GlassCard` in `src/components/ui/glass-card.tsx` accepts:
- `variant?: 'default' | 'compact'` — use `'default'` for restaurant cards, `'compact'` for recent search rows if desired
- `animate?: boolean` — set `false` inside lists to let the list manage animation
- All standard `HTMLDivElement` attributes (onClick, role, tabIndex, aria-label, etc.)
- `className` for Tailwind additions

The glass visual treatment is applied via the `glass-card` CSS class internally. Do not add backdrop-filter inline to `GlassCard` — it is already handled.

### File Status at Story Start

| File | Status | Action |
|---|---|---|
| `src/app/search/page.tsx` | ✅ exists — stub | Modify: remove 'use client', replace placeholder with `<SearchScreen />` |
| `src/components/search/` | ❌ does not exist | Create directory |
| `src/components/search/search-screen.tsx` | ❌ does not exist | Create |
| `src/hooks/use-search.ts` | ❌ does not exist | Create |
| `src/types/api.ts` | ✅ exists — has `RestaurantSearchResult`, `SearchDishResponse` | No changes needed |
| `src/components/ui/glass-card.tsx` | ✅ exists | Import only |
| `src/components/ui/error-state.tsx` | ✅ exists | Import only |
| `src/hooks/use-online-status.ts` | ✅ exists | Import into `search-screen.tsx` |

### Learnings from Previous Stories

**From Story 5.1:**
- `GET /api/search/restaurants?q=[query]` is the correct route path; returns `{ data: RestaurantSearchResult[] }` on success, `{ error: string, code: string }` on failure with HTTP 503
- `RestaurantSearchResult` and `SearchDishResponse` are already in `src/types/api.ts` — do not add them again

**From Story 4.4:**
- `next build --webpack` — do not change the build command; Turbopack is incompatible with next-pwa
- The offline guard exists in `page.tsx`; this story moves it into `SearchScreen` so `page.tsx` can become a Server Component — this is intentional and correct

**From Story 1.2 / 2.2 (glass components):**
- `glass-card` CSS class applies the glass treatment; do not replicate it inline on GlassCard
- `var(--glass-strip-bg)`, `var(--glass-border)`, `var(--radius-full)`, `var(--radius-md)`, `var(--radius-sm)` are all defined design tokens — use them for the raw input element where GlassCard is not used

**From Story 2.3 (TanStack Query v5 patterns):**
- `useQuery` in v5: `queryKey` and `queryFn` are top-level options (not nested under a config key)
- `enabled` is a top-level boolean option to gate the query
- `refetch()` returns `Promise<QueryObserverResult>` — wrap in `void` when used as an event handler to satisfy TypeScript

### Testing Strategy

Tests live next to the source file.

**`src/hooks/use-search.test.ts`** — use `vi.stubGlobal('fetch', ...)` or `vi.fn()` to mock fetch. Wrap in `renderHook` from `@testing-library/react` with a TanStack Query provider. Test:
- Query `'ab'` (2 chars) → `enabled` is false → no fetch called, `data` is undefined
- Query `'abc'` (3 chars) after 300ms → fetch called with `q=abc`
- Successful response → `data` equals parsed `RestaurantSearchResult[]`
- Non-ok response → `isError` true, `error.message` matches route error string

**`src/components/search/search-screen.test.tsx`** — use `@testing-library/react`. Mock `useRestaurantSearch` with `vi.mock('@/hooks/use-search', ...)`. Mock `next/navigation` with `{ useRouter: () => ({ push: vi.fn() }) }`. Test:
- Renders heading "Search"
- Renders input with placeholder "Dish, restaurant..."
- Renders suggestion copy
- With `recentSearches` in localStorage → recent search rows rendered
- Tap recent search → input value updated
- `isLoading: true` → loading indicator visible
- `isError: true` → `ErrorState` renders, suggestion copy still visible
- `data` populated → correct number of `GlassCard` elements rendered
- Tap card → `router.push` called with `/restaurants/[googlePlacesId]`

Run with: `npx vitest src/hooks/use-search src/components/search/search-screen`

---

## Cross-Story Context

| Story | Relationship |
|---|---|
| **5.1** — Search API routes | Built `GET /api/search/restaurants` and `GET /api/search/dishes`; added `RestaurantSearchResult` and `SearchDishResponse` to `src/types/api.ts`. This story calls those routes from the UI. |
| **4.4** — Offline guard | Added `useOnlineStatus()` to `page.tsx`. This story moves that guard into `SearchScreen` and converts `page.tsx` to a Server Component. The offline UX must remain identical. |
| **5.3** — Recipe generation from search | Will add a dish search flow to `SearchScreen` (or a sub-screen); may modify `search-screen.tsx` to add a second search mode or navigation to dish selection. Do not hard-code assumptions that block this. |
| **5.4** — Restaurant profile page | Creates `/restaurants/[googlePlacesId]` — the destination of the card tap. For this story, navigating there will 404 or render a stub. That is acceptable. |
| **1.2** — Design token system | All CSS custom properties (`--text-2xl`, `--radius-full`, `--glass-strip-bg`, etc.) are defined. Use them; do not hard-code pixel values or hex colours. |

### What This Story Does NOT Change

- `src/app/api/search/restaurants/route.ts` — built in Story 5.1; do not touch
- `src/app/api/search/dishes/route.ts` — built in Story 5.1; do not touch
- `src/types/api.ts` — types are already present from Story 5.1; no additions needed
- `src/components/ui/glass-card.tsx`, `error-state.tsx` — import only; do not modify
- `src/hooks/use-online-status.ts` — import only; do not modify
- Any other page, route, hook, or component outside of `src/app/search/page.tsx`, `src/components/search/`, and `src/hooks/use-search.ts`

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
- Replaced `lucide-react` icon imports with inline SVGs — `lucide-react` is not installed in this project; existing components use inline SVGs (see `glass-tab-bar.tsx`).
- Updated `src/app/search/page.test.tsx` to add mocks for `useRestaurantSearch`, `next/navigation`, and `framer-motion` — required because `page.tsx` is now a thin Server Component that renders `SearchScreen` directly.

### Completion Notes List
- `useDebounce` inlined in `use-search.ts` (no shared `use-debounce.ts` exists in the project).
- `refetch` wrapped in `void` on `onRetry` callback to satisfy TypeScript (TanStack Query v5 returns `Promise<QueryObserverResult>`).
- 6 pre-existing test failures confirmed unchanged (grocery-recipe-view, recipe-detail, scan-results) — verified by stashing changes and running isolated.
- 25 new tests added (6 hook + 15 component + 4 page); 559 total passing.
- `<img>` lint warning on `RestaurantCard` is consistent with existing project pattern (scan-results uses `<img>` too).

### File List

**Created:**
- `src/hooks/use-search.ts`
- `src/hooks/use-search.test.ts`
- `src/components/search/search-screen.tsx`
- `src/components/search/search-screen.test.tsx`

**Modified:**
- `src/app/search/page.tsx` — converted to Server Component; delegates to `<SearchScreen />`
- `src/app/search/page.test.tsx` — updated mocks for new component hierarchy

---

## Change Log

- 2026-03-28: Story 5.2 created (epic 5 — Manual Search & Discovery)
- 2026-03-28: Story 5.2 implemented — Search screen UI with restaurant results, debounced hook, recent searches, offline guard (claude-sonnet-4-6)
- 2026-03-28: Story 5.2 adversarial code review — applied P1–P12 patches (fetch error handling, localStorage guard, debouncedQuery exposure, empty state, keyboard a11y, blur tracking, spin keyframe); updated AC5 "when to save" wording (B1), AC7 "not mounted" → "component mounted, search UI hidden" (B2); scoped fake timers to negative-only tests (claude-sonnet-4-6)
