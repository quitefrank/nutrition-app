# Story 5.1: Restaurant & Dish Search API Routes

**Status:** done
**Story ID:** 5.1
**Epic:** 5 — Manual Search & Discovery

---

## Story

As a developer,
I want restaurant search and dish lookup API routes,
So that the search UI can find restaurants and generate recipes without a camera.

---

## Acceptance Criteria

**AC1 — Restaurant search returns correct shape**
Given a call to `GET /api/search/restaurants?q=[query]`
When processed
Then it calls Google Places API using `getApiKeys().places` and returns `{ data: Restaurant[] }` where each restaurant contains: `name`, `googlePlacesId`, `address`, `imageUrl` (string or null); response uses camelCase domain types; HTTP 200

**AC2 — Dish lookup returns SearchDishResponse wrapping existing DishResult**
Given a call to `GET /api/search/dishes?restaurantId=[id]&name=[dishName]`
When processed
Then it calls Gemini with the dish name and restaurant context; it returns `{ data: { dish: DishResult, nutritionAvailable: boolean } }` where `DishResult` is the **same** existing type from `@/types/api` as the scan routes — not a new or parallel shape

**AC3 — Google Places unavailable**
Given Google Places is unavailable when `/api/search/restaurants` is called
When the error is caught
Then the route returns `{ error: 'Restaurant search unavailable', code: 'PLACES_UNAVAILABLE' }` with HTTP 503; no silent failure (NFR10)

**AC4 — USDA unavailable during dish lookup**
Given USDA cross-reference is unavailable during `/api/search/dishes`
When `/api/search/dishes` returns
Then it returns the dish result with `calorieEstimate: null` and a `nutritionAvailable: false` flag on the response; the dish result is otherwise complete and functional (FR37, NFR12)

**AC5 — API key isolation**
Given all search routes use `getApiKeys()`
When any key is read
Then no key value appears in any response body or response header visible to the client (NFR05); `import 'server-only'` is present in every route file

**AC6 — Type additions to api.ts**
Given the new routes
When `src/types/api.ts` is inspected
Then it contains: `RestaurantSearchResult` (camelCase), `SearchDishResponse` (wrapper adding `nutritionAvailable: boolean` around `DishResult`); no duplicate of `DishResult` or `IngredientResult` exists anywhere

---

## Tasks / Subtasks

### Task 1: Create `GET /api/search/restaurants/route.ts`

- [x] Create `src/app/api/search/restaurants/route.ts` (and the `search/` folder — it does not exist yet)
- [x] Add `import 'server-only'` at top of file
- [x] Read `q` query param; validate it is present and non-empty; return 400 if missing
- [x] Call Google Places New API text search endpoint with `getApiKeys().places`
- [x] Map response to `RestaurantSearchResult[]`; extract `googlePlacesId`, `name`, `address`, `imageUrl` (first photo URL or null)
- [x] Return `{ data: RestaurantSearchResult[] }` on success
- [x] On Places API failure, return `{ error: 'Restaurant search unavailable', code: 'PLACES_UNAVAILABLE' }` with HTTP 503
- [x] Write unit test `src/app/api/search/restaurants/route.test.ts` — mock `getApiKeys()` and the Places fetch; test success shape and 503 path

### Task 2: Create `GET /api/search/dishes/route.ts`

- [x] Create `src/app/api/search/dishes/route.ts`
- [x] Add `import 'server-only'` at top of file
- [x] Read `restaurantId` and `name` query params; validate both present; return 400 if missing
- [x] Call Gemini (`gemini-2.5-flash`) with dish name + restaurant context prompt (see Dev Notes)
- [x] Attempt USDA lookup for calorie estimate; if USDA fails or returns no match, set `calorieEstimate: null`
- [x] Return `{ data: { dish: DishResult, nutritionAvailable: boolean } }` — `nutritionAvailable: false` when USDA unavailable
- [x] On Gemini failure, return `{ error: 'Dish lookup unavailable', code: 'DISH_LOOKUP_UNAVAILABLE' }` with HTTP 503
- [x] Write unit test `src/app/api/search/dishes/route.test.ts` — test success shape, USDA-unavailable path, and Gemini failure path

### Task 3: Add new types to `src/types/api.ts`

- [x] Add `RestaurantSearchResult` interface (see Dev Notes for shape)
- [x] Add `SearchDishResponse` interface wrapping `DishResult` with `nutritionAvailable: boolean`
- [x] Do **not** duplicate `DishResult` or `IngredientResult` — import and reuse

### Task 4: Verify no key exposure

- [x] Confirm `GOOGLE_PLACES_API_KEY` and `GEMINI_API_KEY` never appear in any route response body
- [x] Confirm both route files have `import 'server-only'` (this is enforced by the Next.js build for routes under `app/api/`)

---

## Dev Notes

### Architecture Compliance

| Concern | Decision |
|---|---|
| New directory | `src/app/api/search/` does NOT exist — create it; nested route files go in `restaurants/route.ts` and `dishes/route.ts` |
| API key access | Always via `getApiKeys()` from `@/lib/api-keys` — never `process.env.GOOGLE_PLACES_API_KEY` directly |
| Supabase | This story touches no database rows — no Supabase calls needed |
| DishResult | The existing type in `@/types/api.ts` is the contract — do NOT redefine it or create a parallel type |
| Gemini model | `gemini-2.5-flash` — same model used in `src/app/api/scan/menu/route.ts` and `src/app/api/scan/dish/route.ts` |
| Error shape | `{ error: string, code: string }` — same as all other routes; no other error shape |
| Success shape | `{ data: T }` — same envelope as all other routes |
| `import 'server-only'` | Required at the top of both route files — prevents client-side import of API key logic |
| HTTP methods | Both routes respond to `GET` only; export a `GET` handler function |

### Reference: Existing Route Pattern

Every existing API route follows this exact skeleton — copy it:

```typescript
import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { getApiKeys } from '@/lib/api-keys'
// ... other imports

export async function GET(req: NextRequest) {
  const { places } = getApiKeys()
  // ...
  try {
    // ... call external API
    return NextResponse.json({ data: result })
  } catch (err) {
    return NextResponse.json(
      { error: 'Descriptive message', code: 'SCREAMING_SNAKE_CODE' },
      { status: 503 }
    )
  }
}
```

See `src/app/api/scan/menu/route.ts` for the full reference implementation.

### Google Places New API — Text Search

The Places **New API** (v1) is the current standard as of 2026. The legacy Places API is deprecated.

**Endpoint:** `POST https://places.googleapis.com/v1/places:searchText`

**Headers:**
```
X-Goog-Api-Key: <places key from getApiKeys()>
X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.photos
Content-Type: application/json
```

**Request body:**
```json
{ "textQuery": "<q param value>", "languageCode": "en" }
```

**Response shape (relevant fields):**
```typescript
{
  places: Array<{
    id: string                          // → googlePlacesId
    displayName: { text: string }       // → name
    formattedAddress: string            // → address
    photos?: Array<{
      name: string                      // photo resource name, not a URL
    }>
  }>
}
```

**Photo URL construction:**
A photo `name` from the Places response is a resource path like `places/abc123/photos/xyz`. To get a usable URL:
```
https://places.googleapis.com/v1/{name}/media?maxWidthPx=400&key=<places_key>
```

Use the first photo only (index 0). If `photos` is undefined or empty, set `imageUrl: null`.

**Mapping to `RestaurantSearchResult`:**
```typescript
export interface RestaurantSearchResult {
  googlePlacesId: string
  name: string
  address: string
  imageUrl: string | null
}
```

### Gemini Dish Lookup Prompt

This route uses text-only Gemini (no image). The prompt provides restaurant context and dish name, then asks Gemini to generate the ingredient list.

Use `GoogleGenerativeAI` from `@google/generative-ai` (already installed — see scan routes).

```typescript
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

const prompt = `You are a culinary expert. Generate a recipe for the dish "${dishName}"${restaurantContext}.

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "name": "string — dish name",
  "description": "string — one sentence description",
  "calorieEstimate": number or null,
  "ingredients": [
    {
      "name": "string",
      "quantity": "string or null",
      "unit": "string or null",
      "confidenceLevel": "high" | "medium" | "low"
    }
  ],
  "imageUrl": null
}

Rules:
- imageUrl is ALWAYS null (no image available for search-generated recipes)
- calorieEstimate: best estimate in kcal, or null if unknown
- confidenceLevel for each ingredient: "high" if standard/universal, "medium" if varies by preparation, "low" if uncertain
- Return valid JSON only`
```

Where `restaurantContext` is:
- `""` if no restaurant name is available
- `" as served at [restaurant name]"` if a restaurant name can be resolved from the `restaurantId` param

For MVP, you can skip the restaurant name lookup for the prompt — pass `""` as the context. Story 5.2 will pass the restaurant name from the UI once it has it.

**Parse the Gemini response** using the same strip-markdown-fences → `JSON.parse` pattern used in `src/app/api/scan/menu/route.ts`.

### USDA for `nutritionAvailable`

For this story, the USDA call is minimal — it determines the `nutritionAvailable` flag only. You are NOT storing nutrition data (that happens at save time in Story 3.6).

Logic:
1. Take the first ingredient from the generated dish result
2. Attempt a USDA FoodData Central search: `GET https://api.nal.usda.gov/fdc/v1/foods/search?query={ingredient}&api_key={usda}`
3. If the call succeeds and returns results → `nutritionAvailable: true`
4. If the call fails, times out, or returns no results → `nutritionAvailable: false`, `calorieEstimate: null`
5. On success, you may optionally use the USDA calorie data to populate `calorieEstimate`, but it is not required — Gemini's estimate is sufficient for now

**Do not block the dish result on USDA.** Use `Promise.race` or a timeout if you implement the USDA call, to prevent it adding latency to the route. A 2-second timeout is appropriate.

### New Types to Add in `src/types/api.ts`

```typescript
// ─── Search API ──────────────────────────────────────────────────────────────

export interface RestaurantSearchResult {
  googlePlacesId: string
  name: string
  address: string
  imageUrl: string | null
}

export interface SearchDishResponse {
  dish: DishResult           // the existing DishResult type — not redefined
  nutritionAvailable: boolean
}
```

Route response envelope:
- `GET /api/search/restaurants` → `{ data: RestaurantSearchResult[] }`
- `GET /api/search/dishes` → `{ data: SearchDishResponse }`

### TanStack Query Keys (architecture-defined — do not invent new ones)

```typescript
['search', 'restaurants', query]   // for restaurant search results
['search', 'dishes', query]        // for dish lookup results
```

These keys are defined in the architecture. Story 5.2 will create `src/hooks/use-search.ts` using these keys. This story only builds the route layer.

### Existing Infrastructure This Story Builds On

| File | Status | Notes |
|---|---|---|
| `src/lib/api-keys.ts` | ✅ exists | `getApiKeys()` returns `{ gemini, places, usda }` |
| `src/types/api.ts` | ✅ exists | `DishResult`, `IngredientResult`, `ApiSuccess`, `ApiError` all defined — add new types here |
| `src/app/search/page.tsx` | ✅ exists | Currently a stub with offline guard (added in Story 4.4); this story does NOT touch the UI |
| `src/app/api/search/` | ❌ does not exist | Create this directory |
| `@google/generative-ai` | ✅ installed | Same package used in `src/app/api/scan/menu/route.ts` |

### Learnings from Previous Stories

**From Story 4.4 (most recent):**
- `src/types/database.ts` requires `Relationships: []` arrays on all table types for Supabase 2.x type inference — if you add a new type to `database.ts`, include `Relationships: []`; this story does NOT add DB types
- The `next build` script is `next build --webpack` (Turbopack incompatibility with next-pwa); do not change this
- `src/app/search/page.tsx` already has `useOnlineStatus()` guard — the stub renders "Offline" when offline; do not break this

**From Story 2.1 (first API routes):**
- Gemini JSON responses need markdown fence stripping before `JSON.parse` — the pattern is `text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()`
- Always return `NextResponse.json(...)` — never `Response.json(...)`
- Validate all required query params and return 400 (not 422) for missing params at the route level

**From Story 3.6 (USDA pattern):**
- USDA FoodData Central: `GET https://api.nal.usda.gov/fdc/v1/foods/search?query=<ingredient>&api_key=<key>`
- USDA failures must never block or degrade the main response — use `Promise.allSettled` or try/catch around the USDA call

### Testing Strategy

Tests live next to the route file (`route.test.ts`). Mock `getApiKeys()` to return fake keys. Mock `fetch` (or the `@google/generative-ai` module) to control external API responses.

Minimum test cases per route:
- **restaurants**: success (returns `RestaurantSearchResult[]`), Places unavailable (503 + correct error shape), missing `q` param (400)
- **dishes**: success with `nutritionAvailable: true`, success with USDA unavailable (`nutritionAvailable: false`), Gemini failure (503), missing `restaurantId` or `name` param (400)

Run tests with: `npx vitest src/app/api/search/`

---

## Cross-Story Context

| Story | Relationship |
|---|---|
| **2.1** — Gemini scan routes | Same Gemini pattern (`gemini-2.5-flash`, same prompt parse strategy, same error codes). Reference `src/app/api/scan/menu/route.ts` directly. |
| **3.6** — USDA at save time | USDA pattern established here. This story uses USDA only for `nutritionAvailable` flag — the actual macro storage happens in 3.6's `POST /api/recipes` route, not here. |
| **4.4** — Offline guard | `src/app/search/page.tsx` has an offline guard stub. Do not touch it. |
| **5.2** (next) — Search screen UI | Will create `src/hooks/use-search.ts` using `['search', 'restaurants', query]` and `['search', 'dishes', query]` keys; will call these routes from the UI. |
| **5.3** (future) — Recipe generation from search | Uses the dish result returned by this story's `GET /api/search/dishes` route to trigger the save flow. |

### What This Story Does NOT Change

- `src/app/search/page.tsx` — UI stub; unchanged
- `src/app/api/recipes/`, `src/app/api/grocery/`, `src/app/api/scan/` — no changes to existing routes
- `src/lib/api-keys.ts` — already has `places` and `usda` keys; no changes needed
- `supabase/schema.sql` — no DB schema changes; `restaurants` table already exists from Story 1.1

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
- Fixed `req.nextUrl.searchParams` → `new URL(req.url).searchParams` in restaurants route (NextRequest.nextUrl is undefined in Vitest with plain Request objects)

### Completion Notes List
- Implemented `GET /api/search/restaurants` using Google Places New API (v1) `POST /places:searchText`; maps to `RestaurantSearchResult[]` with photo URL construction; returns 503 PLACES_UNAVAILABLE on failure
- Implemented `GET /api/search/dishes` using Gemini text-only generation with markdown fence stripping; USDA availability check with 2-second timeout via `Promise.race`; returns 503 DISH_LOOKUP_UNAVAILABLE if Gemini fails or returns invalid JSON
- Added `RestaurantSearchResult` and `SearchDishResponse` to `src/types/api.ts` reusing existing `DishResult` — no duplication
- Both routes: `import 'server-only'` present; all keys via `getApiKeys()`; no key values in any response body
- 8 restaurants tests + 12 dishes tests all pass; 0 regressions (pre-existing 6 failures in scan-results.test.tsx unchanged)

### File List

**Created:**
- `src/app/api/search/restaurants/route.ts`
- `src/app/api/search/restaurants/route.test.ts`
- `src/app/api/search/dishes/route.ts`
- `src/app/api/search/dishes/route.test.ts`

**Modified:**
- `src/types/api.ts` — added `RestaurantSearchResult`, `SearchDishResponse`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status updated

---

## Change Log

- 2026-03-28: Story 5.1 created (epic 5, story 1 — first story in Manual Search & Discovery epic)
- 2026-03-28: Story 5.1 implemented — restaurant search route, dish lookup route, new types added; all tasks complete; status → review
