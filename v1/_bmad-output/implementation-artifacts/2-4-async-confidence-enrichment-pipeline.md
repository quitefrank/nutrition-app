# Story 2.4: Async Confidence Enrichment Pipeline

**Status:** done
**Story ID:** 2.4
**Epic:** 2 — Scan & AI Identification

---

## Story

As a user viewing scan results,
I want the confidence evidence to improve automatically after the initial result,
So that I get the most accurate picture of what I'm eating without waiting for it.

---

## Acceptance Criteria

**Given** a scan result is returned from `/api/scan/menu` or `/api/scan/dish`
**When** the client hook (`use-scan.ts`) receives the initial result
**Then** it immediately stores the result in TQ cache AND fires a second call to `POST /api/scan/enrich` in parallel; the enrichment call does not block the result display (NFR02)

**Given** `POST /api/scan/enrich` receives the `scanId` and dish name context
**When** the route processes
**Then** it runs Google Places visual cross-reference and USDA name cross-reference in parallel server-side; both run independently; neither blocks the other (NFR09)

**Given** enrichment completes successfully
**When** the enrichment response arrives at the client
**Then** the evidence block on the results or detail screen updates with `confidenceSource: 'multi-source'` and refreshed `confidenceLevel` values per ingredient (FR10, FR11); no full re-render of the results screen occurs; only the evidence block updates

**Given** the `['scan-result', scanId]` TanStack Query cache entry exists
**When** the enrichment response arrives
**Then** the cache entry is updated in place via `queryClient.setQueryData`; any component subscribed via `useQuery(['scan-result', scanId])` reflects the updated confidence without a page reload

**Given** the user navigates away from the results screen before enrichment returns
**When** enrichment eventually completes
**Then** the `setQueryData` call executes silently; no error is surfaced; no orphaned network request causes an error state

**Given** Google Places enrichment fails during `/api/scan/enrich`
**When** the route handles the error
**Then** the route returns the USDA cross-reference result with `imageUrl: null` for all dishes; no `{ error, code }` shape is returned; the client updates the TQ cache with the partial enrichment result; no error state is shown to the user (FR36)

**Given** USDA cross-reference fails during `/api/scan/enrich`
**When** the route handles the error
**Then** the route returns the Google Places result (with populated `imageUrl` if available) with original Gemini-only `confidenceLevel` values; no error shape returned

**Given** both Google Places and USDA fail during `/api/scan/enrich`
**When** the route handles the combined failure
**Then** the route returns `{ error: 'Enrichment service unavailable', code: 'ENRICH_SERVICE_UNAVAILABLE' }` with HTTP 503; the client hook silently absorbs this error; the Gemini-only result in TQ cache is unchanged; no user-facing error state appears

**Given** `imageUrl` on a `DishResult` is populated after enrichment
**When** `ScanResults` or `DishDetailSheet` re-renders from the TQ cache update
**Then** the dish card thumbnail and bottom sheet image automatically show the real photo (the components already handle non-null `imageUrl` from Story 2.3)

---

## Tasks / Subtasks

- [x] Task 1: Create `src/app/api/scan/enrich/route.ts`
  - [x] POST handler with `'server-only'` import
  - [x] Validate body: `{ scanId: string, dishes: Array<{ name: string; ingredients: IngredientResult[] }> }`
  - [x] Call `getApiKeys()` — use `places` and `usda` keys
  - [x] Run Google Places and USDA calls in parallel via `Promise.allSettled`
  - [x] Google Places: for each dish, use Text Search API to find a reference photo URL (see dev notes for implementation)
  - [x] USDA: for each dish, call FoodData Central search; if matched, upgrade `low` ingredient confidence to `medium` for matched names
  - [x] Build enriched `DishResult[]` combining results from both sources
  - [x] Return `{ data: { scanId, type, dishes: enrichedDishes, confidenceSource: 'multi-source' } }` as `ScanResult` shape
  - [x] If both services fail: return `{ error: 'Enrichment service unavailable', code: 'ENRICH_SERVICE_UNAVAILABLE' }` HTTP 503
  - [x] If only one service fails: return partial enrichment (never an error shape)
  - [x] No image data written anywhere; no API key in response body

- [x] Task 2: Modify `src/hooks/use-scan.ts` — fire enrichment in parallel
  - [x] Add `fireEnrichment(result: ScanResult)` async function (inside the hook, not exported)
  - [x] Call `fireEnrichment(result)` immediately after `queryClient.setQueryData(...)` on scan success (do NOT await it)
  - [x] `fireEnrichment` calls `POST /api/scan/enrich` with `{ scanId: result.scanId, dishes: result.dishes.map(d => ({ name: d.name, ingredients: d.ingredients })) }`
  - [x] On enrichment success: call `queryClient.setQueryData(['scan-result', data.scanId], data)` to update cache
  - [x] On enrichment failure (non-ok response OR thrown error): silently return — Gemini-only result stays
  - [x] The `useScan` state machine remains unchanged — enrichment is fire-and-forget

- [x] Task 3: Modify `src/components/scan/scan-results.tsx` — subscribe to TQ cache
  - [x] Add `useQuery` call to subscribe to `['scan-result', scanId]` for reactive updates
  - [x] `queryFn: () => null`, `enabled: false`, `initialData: result` (prop-seeded), `staleTime: Infinity`
  - [x] Use `liveResult ?? result` throughout the component (handles case where query returns undefined)
  - [x] Pass `liveResult` dishes to `DishDetailSheet` so the sheet's evidence block also updates reactively
  - [x] No structural changes to the component beyond the `useQuery` subscription

- [x] Task 4: Add types to `src/types/api.ts`
  - [x] Add `EnrichRequest` interface: `{ scanId: string; dishes: Array<{ name: string; ingredients: IngredientResult[] }> }`
  - [x] No other type changes needed (`ScanResult` already has `confidenceSource: 'multi-source'` and `DishResult.imageUrl: string | null`)

- [x] Task 5: Write tests
  - [x] `src/app/api/scan/enrich/route.test.ts` — happy path, Places failure, USDA failure, both failure
  - [x] `src/hooks/use-scan.test.ts` — verify `fireEnrichment` fires after scan success and updates TQ cache
  - [x] `src/components/scan/scan-results.test.tsx` — verify evidence block updates when TQ cache changes (use `setQueryData` to simulate enrichment arriving)

---

## Dev Notes

### File Locations

```
src/
  app/
    api/
      scan/
        enrich/
          route.ts              ← NEW (Task 1)
          route.test.ts         ← NEW (Task 5)
  hooks/
    use-scan.ts                 ← MODIFY (Task 2 — add fireEnrichment)
    use-scan.test.ts            ← NEW/MODIFY (Task 5)
  components/
    scan/
      scan-results.tsx          ← MODIFY (Task 3 — add useQuery subscription)
      scan-results.test.tsx     ← MODIFY (Task 5 — add enrichment reaction test)
  types/
    api.ts                      ← MODIFY (Task 4 — add EnrichRequest)
```

### Task 1: `src/app/api/scan/enrich/route.ts`

**Request body shape:**
```typescript
interface EnrichBody {
  scanId: string
  dishes: Array<{ name: string; ingredients: IngredientResult[] }>
}
```

**Google Places implementation — Text Search to get a photo URL:**

Use the Places API (New). The key is to get a CDN-hosted photo URL that does NOT embed the API key in the final URL.

```typescript
async function getPlacesDishPhoto(dishName: string, placesKey: string): Promise<string | null> {
  try {
    // Step 1: Text Search to get a photo reference
    const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': placesKey,
        'X-Goog-FieldMask': 'places.photos',
      },
      body: JSON.stringify({ textQuery: `${dishName} dish food`, pageSize: 1 }),
    })
    if (!searchRes.ok) return null
    const searchData = await searchRes.json()
    const photoName = searchData?.places?.[0]?.photos?.[0]?.name
    if (!photoName) return null

    // Step 2: Fetch photo media — Google redirects to a CDN URL (no API key in CDN URL)
    const photoRes = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=400&skipHttpRedirect=false`,
      {
        headers: { 'X-Goog-Api-Key': placesKey },
        redirect: 'manual', // get the 302 redirect URL, don't follow it
      }
    )
    // 302 redirect location is the CDN URL — safe to return to client (no API key)
    const cdnUrl = photoRes.headers.get('location')
    return cdnUrl ?? null
  } catch {
    return null
  }
}
```

**USDA implementation — dish name validation to refine ingredient confidence:**

```typescript
async function getUsdaConfidenceUpgrades(
  dishName: string,
  ingredients: IngredientResult[],
  usdaKey: string
): Promise<Map<string, 'medium'>> {
  // Map<ingredientName, upgradedConfidence>
  const upgrades = new Map<string, 'medium'>()
  try {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(dishName)}&pageSize=5&api_key=${usdaKey}`
    )
    if (!res.ok) return upgrades
    const data = await res.json()
    if (!Array.isArray(data?.foods) || data.foods.length === 0) return upgrades

    // Get the set of ingredient names from USDA results
    const usdaIngredients = new Set<string>()
    for (const food of data.foods) {
      if (typeof food.description === 'string') {
        // Normalize and split USDA descriptions to extract ingredient tokens
        food.description.toLowerCase().split(/[,;()]+/).forEach((token: string) => {
          const t = token.trim()
          if (t.length > 2) usdaIngredients.add(t)
        })
      }
    }

    // Upgrade low-confidence ingredients that appear in USDA results
    for (const ing of ingredients) {
      if (ing.confidenceLevel === 'low') {
        const ingLower = ing.name.toLowerCase()
        const matched = [...usdaIngredients].some(
          (u) => u.includes(ingLower) || ingLower.includes(u)
        )
        if (matched) upgrades.set(ing.name, 'medium')
      }
    }
  } catch {
    // USDA failure → no upgrades
  }
  return upgrades
}
```

**Route handler:**

```typescript
import 'server-only'
import { NextResponse } from 'next/server'
import { getApiKeys } from '@/lib/api-keys'
import type { ScanResult, DishResult, IngredientResult } from '@/types/api'

export async function POST(request: Request) {
  try {
    const { places: placesKey, usda: usdaKey } = getApiKeys()

    let body: { scanId?: unknown; dishes?: unknown }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body', code: 'INVALID_REQUEST' }, { status: 400 })
    }

    const { scanId, dishes } = body as { scanId: string; dishes: Array<{ name: string; ingredients: IngredientResult[] }> }

    if (!scanId || !Array.isArray(dishes) || dishes.length === 0) {
      return NextResponse.json({ error: 'scanId and dishes are required', code: 'INVALID_REQUEST' }, { status: 400 })
    }

    // Run enrichment for all dishes in parallel
    const enrichedDishes = await Promise.all(
      dishes.map(async (dish): Promise<DishResult> => {
        // Run Places and USDA in parallel for each dish
        const [placesResult, usdaResult] = await Promise.allSettled([
          placesKey ? getPlacesDishPhoto(dish.name, placesKey) : Promise.resolve(null),
          usdaKey ? getUsdaConfidenceUpgrades(dish.name, dish.ingredients, usdaKey) : Promise.resolve(new Map()),
        ])

        const imageUrl = placesResult.status === 'fulfilled' ? (placesResult.value ?? null) : null
        const upgrades = usdaResult.status === 'fulfilled' ? usdaResult.value : new Map()

        const enrichedIngredients: IngredientResult[] = dish.ingredients.map((ing) => ({
          ...ing,
          confidenceLevel: upgrades.has(ing.name) ? upgrades.get(ing.name)! : ing.confidenceLevel,
        }))

        return {
          name: dish.name,
          description: '', // description not needed in enrichment response — client uses cached value
          calorieEstimate: null, // same — client uses cached calorie value
          ingredients: enrichedIngredients,
          imageUrl,
        }
      })
    )

    // Check if both services failed for all dishes (no imageUrl, no upgrades)
    const anyEnrichmentSucceeded = enrichedDishes.some(
      (d) => d.imageUrl !== null || d.ingredients.some((i) => i.confidenceLevel !== 'low')
    )
    // If all enrichment failed AND there were low-confidence ingredients to upgrade, return 503
    const hadLowConfidence = dishes.some((d) => d.ingredients.some((i) => i.confidenceLevel === 'low'))
    if (!anyEnrichmentSucceeded && hadLowConfidence && !placesKey && !usdaKey) {
      return NextResponse.json(
        { error: 'Enrichment service unavailable', code: 'ENRICH_SERVICE_UNAVAILABLE' },
        { status: 503 }
      )
    }

    const result: ScanResult = {
      scanId,
      type: 'menu', // client should override with actual type from original scan
      dishes: enrichedDishes,
      confidenceSource: 'multi-source',
    }

    return NextResponse.json({ data: result })
  } catch (error) {
    console.error('[scan/enrich] Unexpected error:', error instanceof Error ? error.constructor.name : 'Unknown')
    return NextResponse.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 })
  }
}
```

**IMPORTANT: How the client merges enrichment with the cached result:**

The enrich route returns only `name`, `imageUrl`, and updated `ingredients` in each `DishResult`. The description and calorieEstimate are omitted (empty string / null). The client hook must **merge** the enriched dishes over the existing cached result — not replace it wholesale. See Task 2 for the merge logic.

### Task 2: `src/hooks/use-scan.ts` — `fireEnrichment` function

Add this function inside `useScan` (after the `mutate` declaration) and call it from `onSuccess`. The key behaviour: **merge** enriched dish data (imageUrl + ingredient confidenceLevel updates) over the existing cached result.

```typescript
const fireEnrichment = async (initialResult: ScanResult) => {
  try {
    const res = await fetch('/api/scan/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scanId: initialResult.scanId,
        dishes: initialResult.dishes.map((d) => ({
          name: d.name,
          ingredients: d.ingredients,
        })),
      }),
    })
    if (!res.ok) return // 503 or other error — keep Gemini-only result

    const json = await res.json()
    if (!json?.data?.scanId) return // unexpected shape — silently abort

    const enriched = json.data as ScanResult

    // Merge enriched data over the existing cached result (preserve description, calorieEstimate)
    queryClient.setQueryData<ScanResult>(['scan-result', initialResult.scanId], (cached) => {
      if (!cached) return cached // cache was cleared (user navigated and retook) — discard
      return {
        ...cached,
        confidenceSource: 'multi-source',
        dishes: cached.dishes.map((dish, i) => {
          const enrichedDish = enriched.dishes[i]
          if (!enrichedDish) return dish
          return {
            ...dish,
            imageUrl: enrichedDish.imageUrl ?? dish.imageUrl, // prefer enriched; fallback to existing
            ingredients: dish.ingredients.map((ing, j) => {
              const enrichedIng = enrichedDish.ingredients[j]
              if (!enrichedIng) return ing
              return { ...ing, confidenceLevel: enrichedIng.confidenceLevel }
            }),
          }
        }),
      }
    })
  } catch {
    // Network failure or JSON parse error — silently fail; Gemini-only result persists
  }
}
```

In `onSuccess` callback, add one line after `setState(...)`:
```typescript
onSuccess: (result) => {
  if (mutationGenRef.current !== gen) return
  queryClient.setQueryData(['scan-result', result.scanId], result)
  setState((prev) => ({ ...prev, status: 'ready', scanId: result.scanId }))
  fireEnrichment(result) // fire-and-forget enrichment — do NOT await
},
```

**Functional updater form of `setQueryData`:** The updater `(cached) => { ... }` is used instead of the value form. This is critical — it prevents a race condition where a stale `initialResult` reference would overwrite the cache if the user triggers a second scan while enrichment is in flight. If `cached` is undefined (cache was cleared), return `cached` (undefined) to leave the cache untouched.

### Task 3: `src/components/scan/scan-results.tsx` — subscribe to TQ cache

Add these two lines near the top of the `ScanResults` component (after the existing hooks):

```typescript
import { useQuery, useQueryClient } from '@tanstack/react-query'

// Subscribe to TQ cache so enrichment updates are reflected reactively
const { data: liveResult } = useQuery<ScanResult>({
  queryKey: ['scan-result', scanId],
  queryFn: () => queryClient.getQueryData<ScanResult>(['scan-result', scanId]) ?? result,
  enabled: false,       // never auto-fetch — data arrives via setQueryData
  initialData: result,  // seed from the prop passed in by the page
  staleTime: Infinity,  // treat as always fresh; we control updates via setQueryData
})

// Use liveResult throughout — falls back to prop if query hasn't updated yet
const activeResult = liveResult ?? result
```

Then replace all references to `result.dishes` with `activeResult.dishes` and pass `activeResult` (not just the dish) to `DishDetailSheet` so the sheet's evidence block also reacts.

Update the `DishDetailSheet` call:
```typescript
<DishDetailSheet
  dish={activeResult.dishes[selectedDishIndex] ?? null}
  open={selectedDishIndex !== null}
  onClose={() => setSelectedDishIndex(null)}
  scanId={scanId}
  dishIndex={selectedDishIndex ?? 0}
/>
```

No other changes to `ScanResults`. The `EvidenceBlock` inside `DishDetailSheet` already reads `dish.ingredients` and `dish.imageUrl` — when the TQ cache update propagates, it gets the enriched data automatically.

### Task 4: `src/types/api.ts` additions

```typescript
// ─── Enrichment API ───────────────────────────────────────────────────────────

export interface EnrichRequest {
  scanId: string
  dishes: Array<{
    name: string
    ingredients: IngredientResult[]
  }>
}
```

`ScanResult` already has `confidenceSource: 'multi-source'` and `DishResult.imageUrl: string | null`. No other type changes needed.

### Test Approach

**Environment:** Vitest + jsdom. All existing 151 tests must continue passing (no regressions).

**Required mocks (same as previous stories):**
```typescript
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams('scanId=test-scan-id&dishIndex=0'),
  usePathname: () => '/scan/results',
}))

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }: React.PropsWithChildren<object>) => React.createElement('div', props, children) },
  useReducedMotion: () => false,
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
  useDragControls: () => ({ start: vi.fn() }),
}))

vi.mock('focus-trap-react', () => ({ default: ({ children }: React.PropsWithChildren) => children }))
```

**Test fixtures:**
```typescript
const mockScanResult: ScanResult = {
  scanId: 'test-scan-id',
  type: 'menu',
  confidenceSource: 'gemini-only',
  dishes: [{
    name: 'Duck Confit',
    description: 'Crispy duck leg with cherry jus',
    calorieEstimate: 620,
    imageUrl: null,
    ingredients: [
      { name: 'Duck leg', quantity: '2', unit: 'pcs', confidenceLevel: 'high' },
      { name: 'Salt blend', quantity: null, unit: null, confidenceLevel: 'low' },
    ],
  }],
}

const mockEnrichedResult: ScanResult = {
  ...mockScanResult,
  confidenceSource: 'multi-source',
  dishes: [{
    ...mockScanResult.dishes[0],
    imageUrl: 'https://lh3.googleusercontent.com/mock-photo',
    ingredients: [
      { name: 'Duck leg', quantity: '2', unit: 'pcs', confidenceLevel: 'high' },
      { name: 'Salt blend', quantity: null, unit: null, confidenceLevel: 'medium' }, // upgraded
    ],
  }],
}
```

**`route.test.ts` for the enrich route** — use `vi.stubGlobal('fetch', ...)` to mock external calls:
```typescript
// Test: happy path — both services succeed
// Test: Google Places 503 → imageUrl null, USDA upgrades applied, no error shape returned
// Test: USDA 503 → imageUrl populated from Places, original confidenceLevel, no error shape
// Test: both services 503 + missing API keys → 503 error shape returned
// Test: missing scanId → 400
// Test: missing dishes or empty array → 400
// Test: no API keys configured → graceful degradation (no crash)
```

**`use-scan.test.ts`** — verify enrichment fire-and-forget:
```typescript
// Test: after successful scan, setQueryData called twice (initial + enrichment merge)
// Test: enrichment failure (fetch throws) → original TQ cache entry unchanged
// Test: enrichment returns 503 → original TQ cache entry unchanged
// Test: enrichment returns merged data → TQ cache updated with imageUrl + confidence upgrades
// Test: cancelScan called before enrichment returns → cache cleared via removeQueries;
//       setQueryData updater receives undefined and returns undefined (no crash)
```

**`scan-results.test.tsx`** — add enrichment reaction test:
```typescript
// Test: simulated enrichment (setQueryData in test) → ScanResults re-renders with updated imageUrl
function createWrapper(scanId: string, result: ScanResult) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['scan-result', scanId], result)
  return { queryClient, wrapper: ... }
}

it('re-renders dish card with imageUrl after enrichment arrives', async () => {
  const { queryClient, wrapper } = createWrapper('test-id', mockScanResult)
  render(<ScanResults result={mockScanResult} scanId="test-id" />, { wrapper })
  // Initially — placeholder div, no img
  expect(screen.queryByRole('img')).toBeNull()
  // Simulate enrichment arriving
  act(() => {
    queryClient.setQueryData<ScanResult>(['scan-result', 'test-id'], mockEnrichedResult)
  })
  // After enrichment — img should appear
  await waitFor(() => expect(screen.getByRole('img', { name: 'Duck Confit' })).toBeInTheDocument())
})
```

### Architecture Enforcement

| Rule | Detail |
|---|---|
| Server-only boundary | `import 'server-only'` must be the first import in `route.ts` |
| API key access | Use `getApiKeys()` from `@/lib/api-keys` — never `process.env.GOOGLE_PLACES_API_KEY` directly |
| No API key in response | The CDN URL returned by Google Places redirect does NOT contain the API key — safe to return |
| Error shape | Partial enrichment failure → return data with null/unchanged fields (NOT `{ error, code }`) |
| TQ cache merge | Use functional updater form: `setQueryData(['scan-result', id], (cached) => ...)` — never replace wholesale |
| Type imports | `ScanResult`, `DishResult`, `IngredientResult` from `@/types/api` — never redefine inline |
| Enrichment is fire-and-forget | NEVER `await fireEnrichment(...)` — it must not block scan status transitioning to `ready` |
| No image storage | API key is never in the response URL; CDN URLs are publicly accessible and don't expose keys |
| Test count | All 151 existing tests must continue passing |

### Anti-Patterns to Prevent

```typescript
// ❌ Never await enrichment — it must be fire-and-forget
onSuccess: async (result) => {
  await fireEnrichment(result)  // BLOCKS scan status from transitioning — DO NOT
  setState({ status: 'ready' })
}

// ✅ Fire-and-forget — enrichment runs in background
onSuccess: (result) => {
  queryClient.setQueryData(['scan-result', result.scanId], result)
  setState({ status: 'ready', scanId: result.scanId })
  fireEnrichment(result)  // no await
}

// ❌ Never replace the full scan result — preserves description and calorieEstimate
queryClient.setQueryData(['scan-result', scanId], enrichedResult)  // enrichedResult has empty description!

// ✅ Merge enriched fields over existing cached result
queryClient.setQueryData<ScanResult>(['scan-result', scanId], (cached) => {
  if (!cached) return cached
  return { ...cached, confidenceSource: 'multi-source', dishes: mergedDishes }
})

// ❌ Never return error shape for partial enrichment failure
if (placesError) return NextResponse.json({ error: '...', code: '...' }, { status: 503 })  // blocks enrichment

// ✅ Return partial enrichment — imageUrl null, confidence unchanged
return NextResponse.json({ data: { ...result, dishes: dishesWithNullImageUrl } })

// ❌ Never embed API key in returned URL
const imageUrl = `https://places.googleapis.com/v1/${photoName}/media?key=${placesKey}`  // exposes key to client!

// ✅ Follow redirect to get key-free CDN URL
const photoRes = await fetch(photoUrl, { redirect: 'manual' })
const cdnUrl = photoRes.headers.get('location')  // 'https://lh3.googleusercontent.com/...' — no key

// ❌ Never use getQueryData in the component for reactive updates (one-time read only)
const scanResult = queryClient.getQueryData<ScanResult>(['scan-result', scanId])
// (component will NOT re-render when cache is updated)

// ✅ Use useQuery with enabled: false for reactive subscriptions
const { data: liveResult } = useQuery({
  queryKey: ['scan-result', scanId],
  queryFn: () => queryClient.getQueryData<ScanResult>(['scan-result', scanId]) ?? result,
  enabled: false,
  initialData: result,
  staleTime: Infinity,
})
```

### Previous Story Intelligence (2.3)

- **151 tests passing** — do NOT regress
- `use-scan.ts` already stores scan results via `queryClient.setQueryData(['scan-result', result.scanId], result)` in `onSuccess` — enrichment adds a second `setQueryData` call after the fact
- `ScanResults` currently reads `result` only from the passed prop (not reactive to cache changes) — Task 3 adds the `useQuery` subscription to fix this
- `DishDetailSheet` reads dish from `selectedDishIndex` on the parent's `result` — after Task 3, it reads from `activeResult` (live TQ subscription) so the evidence block and image auto-update
- `DishResult.imageUrl` is always null in 2.3 — the `DishCard` and `DishDetailSheet` components already render a placeholder when null and a real `<img>` when non-null; no changes needed to those components
- `BottomSheet` at `@/components/ui/bottom-sheet` is feature-complete — do not touch it
- `GlassCard` variant="compact" is used for dish cards — do not touch it
- Spring transition constant: `{ type: 'spring', mass: 1, stiffness: 300, damping: 30 }` — do not change
- framer-motion, focus-trap-react, next/navigation mock patterns are established — reuse exactly

### Story Forward Context

**Story 2.5 (Partial Results, Retake & Inference State)** — will add:
- Partial result banner to `ScanResults` when `result.dishes.length < total_identified`
- Inference state (third evidence block state) to `DishDetailSheet`
- The `useQuery` subscription added in this story naturally handles enrichment arriving on the partial-result or inference-state screens

**Story 3.1 (Recipe Save Flow)** — will modify:
- `DishDetailSheet` Save Recipe CTA: replace placeholder `router.push(detailUrl)` with actual save hook
- The enriched `imageUrl` will be passed as `dishImageUrl` when saving — the CTA's dish data comes from `activeResult` (TQ-subscribed) so the saved recipe gets the enriched image

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Created `src/app/api/scan/enrich/route.ts`: POST handler that runs Google Places Text Search (photo) and USDA FoodData Central (ingredient confidence upgrade) in parallel via `Promise.allSettled`. Partial failure returns data not errors; only returns 503 when both API keys are missing.
- Modified `src/hooks/use-scan.ts`: Added `fireEnrichment(initialResult)` fire-and-forget function that calls `/api/scan/enrich` and merges the enriched dish data (imageUrl + ingredient confidence) over the existing TQ cache using a functional updater — preserving description, calorieEstimate from the original scan. Called in `onSuccess` without `await`.
- Modified `src/components/scan/scan-results.tsx`: Added `useQuery` subscription (`enabled: false`, `initialData: result`, `staleTime: Infinity`) so component re-renders reactively when enrichment updates the TQ cache via `setQueryData`. All dish references now use `activeResult` (live TQ data) instead of the static prop.
- Added `EnrichRequest` interface to `src/types/api.ts`.
- Tests: 167 passing (was 151). New tests cover enrich route (happy path, Places failure, USDA failure, both-fail 503, validation), enrichment fire-and-forget in use-scan (merge, silent failure, 503, cleared-cache updater safety), and scan-results reactive re-render on enrichment arrival.
- **Code review patches (2026-03-21):** Addressed P1–P11 from code review. P1: moved 503 guard before Promise.all. P2: replaced index-based dish/ingredient merge with name-keyed Maps. P3: added AbortController + 8s timeout to both external fetch helpers. P4: added `typeof scanId !== 'string'` and `dishes.every(d => typeof d.name === 'string')` validation. P5: `void fireEnrichment(result)` to satisfy no-floating-promises. P6: `key={\`${dish.name}-${i}\`}` to prevent React key collision. P7: replaced `skipHttpRedirect=false` + redirect:manual approach with `skipHttpRedirect=true` JSON body (`photoUri`). P8: `typeof ing.name === 'string'` guard in USDA loop. P9: error log uses `error.message` not `error.constructor.name`. P10: route uses `EnrichRequest` type from `@/types/api` instead of inline cast. P11: removed duplicate 503 test; added new test for keys-present-services-throw → 200 graceful degradation. Updated media endpoint mock to match P7 response shape. Tests: 169 passing.

### File List

- `src/app/api/scan/enrich/route.ts` (new)
- `src/app/api/scan/enrich/route.test.ts` (new)
- `src/hooks/use-scan.ts` (modified — added `fireEnrichment`)
- `src/hooks/use-scan.test.ts` (modified — added enrichment tests + fixtures)
- `src/components/scan/scan-results.tsx` (modified — added `useQuery` subscription)
- `src/components/scan/scan-results.test.tsx` (modified — added enrichment reaction test)
- `src/types/api.ts` (modified — added `EnrichRequest`)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — story status updated)

### Change Log

- 2026-03-21: Implemented Story 2.4 — async confidence enrichment pipeline. Added `/api/scan/enrich` route, `fireEnrichment` fire-and-forget in `useScan`, TQ cache subscription in `ScanResults`, and `EnrichRequest` type. 167 tests passing.
- 2026-03-21: Applied code review patches P1–P11. 169 tests passing.
