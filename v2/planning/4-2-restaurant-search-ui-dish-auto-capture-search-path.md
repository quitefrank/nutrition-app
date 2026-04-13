# Story 4.2: Restaurant Search UI & Dish Auto-Capture (Search Path)

## Status: ready-for-dev

## Story

As a user, I want to search for a restaurant by name so that I can auto-capture its dishes without scanning a menu.

## Acceptance Criteria

1. A search input (SearchBar component) appears on the Home tab when the user taps the "Find a restaurant" secondary CTA or the search icon in the grid header.
2. Typing queries `/api/places/search?q=...` with a 300ms debounce; results appear in a list below the input.
3. Each result row shows: restaurant name, address, and rating chip (omitted if unavailable); tapping or pressing Enter on a row triggers dish auto-capture.
4. Auto-capture flow: call `POST /api/restaurants/auto-scan` → optimistic UI shows "Scanning [name]…" strip → on success the restaurant and its dishes appear in the collection grid.
5. If search returns 0 results: show "No restaurants found for '[query]'" empty state.
6. Search API errors and auto-scan API errors each show an inline error message with a retry action.
7. Search can be dismissed via the × button or the Escape key, returning to the grid view.
8. Keyboard accessible: search input has an accessible label, result rows are focusable and activatable with Enter.

## Technical Notes

### API Contracts (already implemented)

```
GET /api/places/search?q={query}
→ { results: [{ placeId: string, name: string, address: string, rating?: number, userRatingsTotal?: number }] }

POST /api/restaurants/auto-scan
body: { placeId: string, name: string }
→ { restaurant: DomainRestaurant, recipes: DomainRecipe[] }
```

### Component Tree

```
RestaurantCollectionScreen
└── RestaurantSearchOverlay (portal/full-screen modal, conditionally rendered)
    ├── SearchBar
    │   ├── <input> (labelled, debounced)
    │   ├── loading indicator (spinner when isPending)
    │   └── × dismiss button
    └── results list
        ├── RestaurantSearchResult (× N, stagger-animated)
        ├── empty state ("No restaurants found for '…'")
        └── error state (inline, with retry)
```

### Hook Design

**`useRestaurantSearch(query: string)`**
- Wraps `/api/places/search` via TanStack Query.
- Query key: `['restaurants', 'search', query]`.
- `enabled` only when `query.trim().length >= 2`.
- Returns `{ results, isPending, isError, error }`.
- Errors surface as `{ error: { code, message } }` envelope (ARCH7).

**`useAutoScan()`**
- TanStack mutation wrapping `POST /api/restaurants/auto-scan`.
- Mutation key: `['restaurants', 'auto-scan']`.
- On success: invalidates `['restaurants', 'with-recipes']` query key so the grid refreshes.
- Errors surface as `{ error: { code, message } }` envelope (ARCH7).

### Glass & Animation Conventions

- **SearchBar**: `--glass-base` background, `--shadow-card` shadow, `16px` border-radius.
- **RestaurantSearchOverlay**: slides in from bottom — `y: "100%" → 0` spring transition; gated on `useReducedMotion()`.
- **Result rows**: stagger-animate in with `staggerChildren: 0.04` (same pattern as RestaurantCollectionScreen).
- All `whileTap` scale effects gated on `useReducedMotion()`.

### Architecture Rules

- **ARCH7**: All hook errors must surface through `{ error: { code, message } }`.
- **ARCH16**: Query key `['restaurants', 'search', query]` for search; `['restaurants', 'auto-scan']` for the mutation.
- **ARCH18**: No API keys in client components — all Places calls stay server-side in `/api/places/search`.

### Integration Points

- **Empty state**: RestaurantCollectionScreen's empty state gains a secondary "Find a restaurant" CTA below the existing "Scan a menu" CTA.
- **Populated state header**: a search icon / "Find a restaurant" secondary action appears in the grid header.
- Both triggers open `RestaurantSearchOverlay` rendered as a portal/full-screen modal within the existing layout.

### Dependencies

| Story | Provides |
|-------|----------|
| 4.1 (done) | `/api/places/search` route — returns up to 5 results with Supabase cache check |
| 4.3 (done) | `RestaurantCollectionScreen` and `RestaurantGridCard` exist |
| 4.5 (done) | `HeroCard`, `HomeSection`, `RecipeGridCard` exist |

## Files to Create

- `src/components/ui/SearchBar.tsx` — controlled search input with clear button, 300ms debounce, loading indicator, and × dismiss button
- `src/components/ui/RestaurantSearchResult.tsx` — single result row (name, address, optional rating chip); keyboard-activatable
- `src/components/screens/RestaurantSearchOverlay.tsx` — full overlay managing search state, debounced query, results list, empty state, error state; consumes `useRestaurantSearch()` and calls `useAutoScan()` mutation on selection
- `src/hooks/useRestaurantSearch.ts` — TanStack Query wrapper for `/api/places/search`
- `src/hooks/useAutoScan.ts` — TanStack mutation wrapper for `/api/restaurants/auto-scan`

## Files to Modify

- `src/components/screens/RestaurantCollectionScreen.tsx` — add "Find a restaurant" CTA to empty state and grid header; wire to `RestaurantSearchOverlay`

## Tests

- `src/components/ui/SearchBar.test.tsx`
  - Renders with placeholder and label
  - Clear (×) button appears when input has value and clears on click
  - Debounce: `onChange` callback fires after 300ms, not on every keystroke
  - `onDismiss` is called when dismiss button is clicked or Escape is pressed

- `src/components/ui/RestaurantSearchResult.test.tsx`
  - Renders name and address
  - Omits rating chip when rating is absent
  - Calls `onSelect` with the result object on click
  - Calls `onSelect` on Enter keypress; does not call on Space

- `src/components/screens/RestaurantSearchOverlay.test.tsx`
  - Shows loading indicator while `isPending` is true
  - Renders a result row for each result returned
  - Shows empty state when results array is empty and query length >= 2
  - Shows error state when `isError` is true; retry re-triggers the query
  - Calls `useAutoScan` mutation when a result row is selected
  - Closes (calls `onDismiss`) when Escape key is pressed

- `src/hooks/useRestaurantSearch.test.ts`
  - Does not fetch when `query.length < 2`
  - Fetches `/api/places/search?q=...` when query length >= 2
  - Returns mapped results on success
  - Exposes `isError` and error envelope on API failure

- `src/hooks/useAutoScan.test.ts`
  - Posts `{ placeId, name }` to `/api/restaurants/auto-scan`
  - Invalidates `['restaurants', 'with-recipes']` on success
  - Exposes error envelope on failure
