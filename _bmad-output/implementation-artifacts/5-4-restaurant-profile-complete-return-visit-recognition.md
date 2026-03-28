# Story 5.4: Restaurant Profile & Complete Return-Visit Recognition

Status: review

## Story

As a returning user at a favourite restaurant,
I want Plately to surface my saved recipes from that location and recognise I've been there before,
So that I can quickly build on my existing collection without starting from scratch.

## Acceptance Criteria

1. **Given** the user searches for and selects a restaurant that has saved recipes in their collection,
   **When** the restaurant profile page (`/restaurants/[id]`) renders,
   **Then** it shows: restaurant name, restaurant image (or placeholder), all previously saved recipes from that location (FR32), and a link to explore that restaurant's dishes.

2. **Given** a previously saved recipe card on the restaurant profile,
   **When** tapped,
   **Then** the recipe detail page opens at `/recipes/[id]` — same flow as from the home screen.

3. **Given** a manual search interaction where the user navigates to a restaurant's dish list (`/search/restaurants/[googlePlacesId]`) and that restaurant has saved recipes in the collection,
   **When** the home screen renders after that visit,
   **Then** the return-visit banner ("You've been here before — X saved recipes") is displayed — completing FR41 for both scan-triggered (Story 3.5) and search-triggered contexts.

4. **Given** the return-visit banner is tapped,
   **When** navigated,
   **Then** the restaurant profile page opens showing all saved recipes from that location.

5. **Given** the user has previously granted location permission,
   **When** the home screen loads and the app detects a known restaurant within 200m via the device's GPS,
   **Then** the return-visit banner proactively appears on the home screen without requiring a scan or search interaction. If location permission has been denied at the OS level, the banner only appears after scan match or manual search selection (no repeated permission prompts).

6. **Given** `GET /api/recipes?restaurantId=[id]` is called with a valid Supabase `restaurantId`,
   **When** recipes with matching `restaurant_id` exist,
   **Then** it returns `{ data: Recipe[] }` for that restaurant, HTTP 200; empty array if none exist. *(This endpoint already exists — this AC is a regression guard.)*

## Tasks / Subtasks

- [x] Task 1: Schema & type updates (AC: 1, 3, 5)
  - [x] 1.1 Add `restaurant_image_url TEXT` column to the `restaurants` table in Supabase — run migration SQL: `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS restaurant_image_url TEXT;`
  - [x] 1.2 Update `src/types/database.ts`: add `restaurant_image_url: string | null` to `restaurants.Row`, `restaurants.Insert`, and `restaurants.Update`
  - [x] 1.3 Update `src/types/domain.ts`: add `restaurantImageUrl: string | null` to `DomainRestaurant`
  - [x] 1.4 Update all places that map a `restaurants` DB row to `DomainRestaurant` — specifically the join mapper in `src/app/api/recipes/route.ts` (`GET` handler, line ~348)

- [x] Task 2: Enrich restaurant with image on save (AC: 1)
  - [x] 2.1 In `src/app/api/recipes/route.ts` `POST` handler: after a restaurant row is created or found, if `restaurant_image_url` is null AND `google_places_id` is non-null AND `places` API key is available, call the Places Details API to fetch the restaurant's first photo URL
  - [x] 2.2 Use the Places API v1 `getPlace` endpoint: `GET https://places.googleapis.com/v1/places/{googlePlacesId}` with header `X-Goog-FieldMask: photos` — parse `result.photos[0].name` then construct the media URL: `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&key=${apiKey}`
  - [x] 2.3 Store the photo URL as `restaurant_image_url` via an UPDATE (on existing rows) or as part of the INSERT (on new rows); wrap in try/catch — failure is non-fatal (NFR11)
  - [x] 2.4 Do NOT call Places Details if `restaurant_image_url` is already populated — avoid redundant API calls

- [x] Task 3: Create `GET /api/restaurants/nearby` route (AC: 5)
  - [x] 3.1 Create `src/app/api/restaurants/nearby/route.ts`
  - [x] 3.2 Accept query params: `lat` (float), `lng` (float), `radius` (int, default 200 metres)
  - [x] 3.3 Validate `lat` and `lng` are present and finite floats; return 400 if missing or invalid
  - [x] 3.4 Query Supabase: `restaurants` rows that have at least one recipe — join via `recipes!inner(id)` or do a sub-select; include only rows where `google_places_id IS NOT NULL`
  - [x] 3.5 For each candidate restaurant with a `google_places_id`, call Places API v1 `getPlace` with field mask `location` to get `latitude`/`longitude` — do these in parallel with `Promise.allSettled`; skip failures silently
  - [x] 3.6 Compute Haversine distance for each; filter to those within `radius` metres
  - [x] 3.7 Return `{ data: Array<{ id: string; name: string; googlePlacesId: string; recipeCount: number }> }` — first match wins for banner purposes; return all matches so client can pick the closest
  - [x] 3.8 If Places API key is unavailable, return `{ data: [] }` with HTTP 200 (graceful degradation, NFR11)
  - [x] 3.9 **Security**: coordinates from client are used only for in-memory Haversine comparison — never written to Supabase (NFR08)

- [x] Task 4: Create `useNearbyRestaurant` hook (AC: 5)
  - [x] 4.1 Create `src/hooks/use-nearby-restaurant.ts`
  - [x] 4.2 Hook signature: `useNearbyRestaurant()` — returns `{ nearbyRestaurant: NearbyRestaurant | null; isLoading: boolean; requestPermission: () => void }`
    where `NearbyRestaurant = { id: string; name: string; googlePlacesId: string; recipeCount: number }`
  - [x] 4.3 On mount, call `navigator.geolocation.getCurrentPosition` only if `navigator.permissions` reports `location` as `'granted'` (avoids silent prompt) — if status is `'prompt'`, do nothing until `requestPermission()` is called
  - [x] 4.4 `requestPermission()` triggers the OS permission prompt with value-framing toast before calling `getCurrentPosition` — use `toast()` with copy "Allow location so Plately can recognise restaurants you've visited" per UX-DR9
  - [x] 4.5 On successful geolocation, call `GET /api/restaurants/nearby?lat=X&lng=Y&radius=200`; cache result in React state — do not use TanStack Query (one-shot, not polling)
  - [x] 4.6 Handle `GeolocationPositionError` silently — permission denied just means no proactive banner
  - [x] 4.7 SSR guard: check `typeof navigator !== 'undefined'` before any `navigator.*` access

- [x] Task 5: Add saved-recipes section to search dish list page (AC: 1, 3)
  - [x] 5.1 In `src/app/search/restaurants/[googlePlacesId]/page.tsx`, add `useRecipes()` — filter client-side: `recipes.filter(r => r.restaurant?.googlePlacesId === googlePlacesId)`
  - [x] 5.2 If `savedAtThisRestaurant.length > 0`, render a "Saved from here" section above the dish list — display recipe name rows as tap-navigable buttons to `/recipes/[id]`; reuse the button style from `/restaurants/[id]/page.tsx` (line 35–51)
  - [x] 5.3 On page mount (or when `savedAtThisRestaurant` resolves to non-empty), write to localStorage
  - [x] 5.4 Do NOT write to localStorage if `savedAtThisRestaurant` is empty (no banner for new restaurants)

- [x] Task 6: Enhance home page return-visit banner for search-triggered visits (AC: 3, 4, 5)
  - [x] 6.1 In `src/app/page.tsx`, add localStorage check: read `plately-search-visit` on mount
  - [x] 6.2 A search-triggered banner should show when: (a) `visitedAt` is within 24 hours of now, AND (b) the `restaurantId` from localStorage still has saved recipes in `useRecipes()` data, AND (c) the scan-triggered banner is NOT already showing
  - [x] 6.3 Merge scan-triggered and search-triggered banner logic into a single banner slot
  - [x] 6.4 Add `useNearbyRestaurant()` call — location-triggered banner when no scan/search banner showing
  - [x] 6.5 Location permission request gated on no scan/search banner + `navigator.permissions` status `'prompt'`
  - [x] 6.6 Banner text: "You've been here before — {count} saved recipes"; `aria-label` includes restaurant name

- [x] Task 7: Enhance `/restaurants/[id]` profile page (AC: 1, 2)
  - [x] 7.1 Add restaurant image derivation: `restaurantImageUrl ?? dishImageUrl ?? null`
  - [x] 7.2 Render full-width image (200px height, `object-fit: cover`, `border-radius: var(--radius-sm)`)
  - [x] 7.3 Render "Explore dishes" link navigating to `/search/restaurants/[googlePlacesId]?restaurantName=...`
  - [x] 7.4 Wrap recipe rows in `GlassCard` component
  - [x] 7.5 Apply `paddingBottom: '80px'` to root div

- [x] Task 8: Add type for `NearbyRestaurantResult` to `api.ts` (AC: 5)
  - [x] 8.1 Added `NearbyRestaurantResult` interface to `src/types/api.ts`

- [x] Task 9: Write tests (AC: all)
  - [x] 9.1 `src/app/api/restaurants/nearby/route.test.ts` — 8 tests: valid coords, too far, missing lat→400, missing lng→400, non-finite→400, no key→200 empty, Places failure silently skipped, NFR08 coords not in response
  - [x] 9.2 `src/app/api/recipes/route.test.ts` additions — 3 tests: new restaurant gets image, existing image not overwritten, Places failure non-fatal
  - [x] 9.3 `src/app/search/restaurants/[googlePlacesId]/page.test.tsx` — 4 tests: renders "Saved from here", no render when no match, writes localStorage, does NOT write when empty
  - [x] 9.4 `src/hooks/use-nearby-restaurant.test.ts` — 5 tests: granted→auto geolocation, prompt→deferred, GeolocationPositionError→null, empty response→null, denied→not called

## Dev Notes

### NFR08 Compliance — Location Data

**This is the most critical constraint for Task 3.** NFR08 states: "No personally identifiable information is collected, stored, or transmitted; the system does not log user behaviour, device identifiers, or location data."

- The user's GPS coordinates (`lat`, `lng`) arrive at `GET /api/restaurants/nearby` as query params. They are used **only** for in-memory Haversine distance calculations. They are **never** written to Supabase, never logged with `console.log`, and never included in any response body.
- Restaurant coordinates from the Google Places Details API are also used **only** in-memory during a single request lifecycle — never persisted.
- Developer checklist before merging Task 3: grep for any `console.log` calls in `nearby/route.ts` that include `lat`, `lng`, or coordinates. Remove them.

### Schema Migration

Story 5.4 adds one column: `restaurant_image_url TEXT`. The Supabase migration SQL is:
```sql
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS restaurant_image_url TEXT;
```

After running the migration, regenerate or hand-update `src/types/database.ts`. The file header (line 1–10) warns that `Relationships` arrays were manually added in Story 4.4 — preserve them if regenerating via CLI.

**Do NOT add `lat` or `lng` columns** — NFR08 compliance (see above).

### Google Places API v1 Patterns

All Places API calls use the **New Places API (v1)**, consistent with the existing search route at `src/app/api/search/restaurants/route.ts`. Pattern:

**Get place details (for image and location):**
```
GET https://places.googleapis.com/v1/places/{googlePlacesId}
Headers:
  X-Goog-Api-Key: {apiKey}
  X-Goog-FieldMask: photos,location      ← comma-separated; adjust per need
```

**Photo media URL (for `restaurant_image_url`):**
```
https://places.googleapis.com/v1/{photos[0].name}/media?maxWidthPx=800&key={apiKey}
```
The `photos[0].name` value looks like `places/{placeId}/photos/{photoId}`. Construct the full URL by template — do not append `key` as a query param on the `getPlace` call itself; only on the `/media` URL.

**Location field shape:**
```json
{ "location": { "latitude": 51.5074, "longitude": -0.1278 } }
```

### Haversine Distance Formula

Implement this in `src/app/api/restaurants/nearby/route.ts`:
```ts
function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000 // Earth radius in metres
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
```

### Return-Visit Banner — Decision Logic

The home page banner logic has three triggers. Precedence order (highest to lowest):

1. **Scan-triggered** (already implemented): `recipes[0].restaurantId` matches another recipe's restaurant. Always current. Source: `useRecipes()`.
2. **Search-triggered** (new in 5.4): `localStorage.getItem('plately-search-visit')` was set within the last 24 hours for a restaurant that still has saved recipes. Source: localStorage + `useRecipes()` filter.
3. **Location-triggered** (new in 5.4): `useNearbyRestaurant()` returns a non-null `nearbyRestaurant`. Source: GPS + `/api/restaurants/nearby`.

Only ONE banner is shown at a time. If trigger 1 fires, do not evaluate 2 or 3. If trigger 2 fires, do not evaluate 3.

The `restaurantId` for the banner's `router.push` call is always a Supabase UUID (not a `googlePlacesId`). The banner navigates to `/restaurants/{restaurantId}`.

### TanStack Query Keys — New in This Story

| Key | Hook | Notes |
|-----|------|-------|
| `['recipes', 'restaurant', restaurantId]` | `useRecipesByRestaurant` | Already exists in `use-recipes.ts:90` |
| None for nearby | `useNearbyRestaurant` | One-shot, uses React state directly |

No new TanStack Query keys are introduced in this story. The `useNearbyRestaurant` hook is intentionally not wrapped in `useQuery` — it is a one-shot geolocation call, not a cacheable server resource.

### Existing Code to Reuse

| What | Where | How |
|------|-------|-----|
| `useRecipesByRestaurant` hook | `src/hooks/use-recipes.ts:90` | Use in restaurant profile page instead of filtering `useRecipes()` |
| Button/row styles in restaurant profile | `src/app/restaurants/[id]/page.tsx:35–51` | Reuse exactly in Task 5.2 for the "Saved from here" section |
| `GlassCard` | `src/components/ui/glass-card.tsx` | Apply in Task 7.4 |
| `PageHeader` | `src/components/layout/page-header.tsx` | Already in `/restaurants/[id]/page.tsx` |
| `useOnlineStatus` | `src/hooks/use-online-status.ts` | Gate geolocation calls — if offline, skip location check entirely |
| `getApiKeys()` | `src/lib/api-keys.ts` | Use for `places` key in new API routes; `import 'server-only'` required |
| `supabase` client | `src/lib/supabase.ts` | Standard import for all server-side DB access |

### Regression Risk Areas

1. **`POST /api/recipes`**: Task 2 modifies the restaurant creation/update path. The restaurant resolve block (lines 183–236) must be preserved in full — only add the image enrichment call after `resolvedRestaurantId` is set. The Places Details call is non-fatal; wrap it fully in try/catch and never let it affect the recipe save outcome.

2. **`GET /api/recipes` join mapper** (lines 340–357): Adding `restaurantImageUrl` to the mapper requires the Supabase select string to also include `restaurant_image_url`. Update the select on line 318 to: `restaurants ( id, name, google_places_id, atmospheric_palette_json, updated_at, restaurant_image_url )`.

3. **Home page banner** (`src/app/page.tsx`): The existing `showReturnVisitBanner` logic should remain functionally unchanged for scan-triggered detection. Search-triggered and location-triggered banners are layered on top. Do not refactor the existing logic — add to it.

4. **`database.ts` Relationships arrays**: Manually added in Story 4.4. If hand-editing, preserve the existing `Relationships` entries for all tables.

### Testing Standards

- All API routes must have tests co-located at `src/app/api/…/route.test.ts`
- Mock the Supabase client: import `{ supabase }` from `@/lib/supabase` and `vi.mock('@/lib/supabase', ...)`
- Mock `getApiKeys`: `vi.mock('@/lib/api-keys', () => ({ getApiKeys: vi.fn(() => ({ places: 'test-key', ... })) }))`
- Mock `fetch` for Places API calls using `vi.stubGlobal('fetch', vi.fn(...))`
- Hook tests: use `renderHook` from `@testing-library/react`; mock `navigator.geolocation` and `navigator.permissions` on the global object
- Page tests: use `@testing-library/react` with `render`; mock `useRecipes` and `useRestaurantDishes` from their respective hooks

### Project Structure Notes

New files this story:
```
src/app/api/restaurants/nearby/route.ts        ← new API route
src/app/api/restaurants/nearby/route.test.ts   ← new test
src/hooks/use-nearby-restaurant.ts             ← new hook
src/hooks/use-nearby-restaurant.test.ts        ← new test
```

Modified files:
```
src/types/database.ts                                         ← add restaurant_image_url
src/types/domain.ts                                           ← add restaurantImageUrl
src/types/api.ts                                              ← add NearbyRestaurantResult
src/app/api/recipes/route.ts                                  ← image enrichment + mapper
src/app/api/recipes/route.test.ts                             ← regression tests
src/app/restaurants/[id]/page.tsx                             ← enhanced profile
src/app/search/restaurants/[googlePlacesId]/page.tsx          ← saved recipes section
src/app/page.tsx                                              ← enhanced banner logic
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.4] — ACs and user story
- [Source: _bmad-output/planning-artifacts/epics.md#FR32, FR41] — Functional requirements
- [Source: _bmad-output/planning-artifacts/epics.md#NFR08] — Location data prohibition
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR9] — Permission moment UX
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR16] — Return-visit banner UX
- [Source: src/app/api/search/restaurants/route.ts] — Places API v1 call pattern
- [Source: src/app/api/recipes/route.ts#183–236] — Restaurant resolve block (preserve intact)
- [Source: src/app/page.tsx#48–53] — Existing scan-triggered banner logic
- [Source: src/hooks/use-recipes.ts#90–96] — `useRecipesByRestaurant` (use this in profile page)
- [Source: src/app/restaurants/[id]/page.tsx] — Current profile page baseline

## Cross-Story Context

| Story | Relevant Output |
|-------|----------------|
| 3.5 | Scan-triggered return-visit banner (home page) — this story extends it with search-triggered and location-triggered cases |
| 5.2 | Search screen navigates to `/search/restaurants/[googlePlacesId]?restaurantName=` — this story adds saved-recipes section to that destination page |
| 5.3 | `/search/restaurants/[googlePlacesId]/page.tsx` created — Task 5 modifies it; `DishDetailSheet` and `DishCard` components unchanged |
| 3.6 | USDA nutritional lookup pattern in `POST /api/recipes` — same error handling style needed for Places Details call in Task 2 |

## File Status at Story Start

| File | Status |
|------|--------|
| `src/app/restaurants/[id]/page.tsx` | Exists — minimal implementation (name, recipe count, recipe list). Needs image, GlassCard, "Explore dishes" link. |
| `src/app/search/restaurants/[googlePlacesId]/page.tsx` | Exists — shows dishes only. Needs saved-recipes section and localStorage write. |
| `src/app/page.tsx` | Exists — scan-triggered banner only. Needs search-triggered and location-triggered layers. |
| `src/app/api/recipes/route.ts` | Exists — restaurant creation does not populate `restaurant_image_url`. Needs image enrichment. |
| `src/app/api/restaurants/nearby/route.ts` | Does not exist — create from scratch. |
| `src/hooks/use-nearby-restaurant.ts` | Does not exist — create from scratch. |
| `src/types/database.ts` | Exists — `restaurants` has no `restaurant_image_url`. Needs column addition. |
| `src/types/domain.ts` | Exists — `DomainRestaurant` has no `restaurantImageUrl`. Needs field addition. |
| `src/types/api.ts` | Exists — needs `NearbyRestaurantResult`. |

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `enrichRestaurantImage` called before declaration → moved function definition before `POST` export
- `placesKey` unused warning → fixed call site to pass destructured variable
- Rules of Hooks violation: `useEffect` inside `if (recipes.length > 0)` → full rewrite of `page.tsx` with all hooks at component top level
- `navigator.permissions` undefined in jsdom → added `!navigator.permissions` guard in `page.tsx:82`
- Story 5.4 `beforeEach` in search page test didn't reset `mockUseOnlineStatus` → added `mockUseOnlineStatus.mockReturnValue(true)`

### Completion Notes List

- Supabase migration SQL must be run manually: `ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS restaurant_image_url TEXT;`
- 6 pre-existing test failures (grocery-recipe-view, recipe-detail, scan-results) remain — not caused by this story
- NFR08 verified: GPS coordinates never appear in response body or Supabase writes

### File List

**New files:**
- `src/app/api/restaurants/nearby/route.ts`
- `src/app/api/restaurants/nearby/route.test.ts`
- `src/hooks/use-nearby-restaurant.ts`
- `src/hooks/use-nearby-restaurant.test.ts`

**Modified files:**
- `src/types/database.ts`
- `src/types/domain.ts`
- `src/types/api.ts`
- `src/app/api/recipes/route.ts`
- `src/app/api/recipes/route.test.ts`
- `src/app/restaurants/[id]/page.tsx`
- `src/app/search/restaurants/[googlePlacesId]/page.tsx`
- `src/app/search/restaurants/[googlePlacesId]/page.test.tsx`
- `src/app/page.tsx`
- `src/app/page.test.tsx`

## Change Log

| Date | Change |
|------|--------|
| 2026-03-28 | Story created (SM: bmad-create-story workflow) |
| 2026-03-28 | Story implemented (Dev: claude-sonnet-4-6) — all 9 tasks complete, 611/617 tests passing |
