# Story 6.2: Retake Photo Flow

Status: review
Epic: 6 — Graceful Failure & Progressive Recovery
Story ID: 6.2
Story Key: 6-2-retake-photo-flow
Created: 2026-04-13

---

## Story

As a user,
I want to retake a photo of the menu to attempt recognition of the dishes that were missed,
So that I can get a more complete capture without starting over from scratch.

---

## Acceptance Criteria

**AC1 — "Retake photo" opens camera modal in retake mode**
**Given** the user taps "Retake photo" in the `ScanConfidenceBanner`
**When** the action is taken
**Then** the camera modal reopens with a header indicating which dishes have already been captured and how many remain unread (e.g. "5 dishes captured — scan for the remaining 3")

**AC2 — Retake scan merges new dishes without duplicating existing ones**
**Given** the user captures a new photo
**When** the second scan result is processed
**Then** newly recognised dish names (case-insensitive, trimmed) that do not already exist in the restaurant's recipe rows with `status != 'removed'` are inserted as new recipe rows with `status: 'auto_captured'`; previously recognised dishes are not duplicated

**AC3 — Banner dismisses when all dishes are resolved**
**Given** the retake scan recognises all remaining dishes
**When** the merged result is committed to Supabase
**Then** the `ScanConfidenceBanner` is dismissed and the full dish list is shown; no recovery options remain

**AC4 — Banner updates when dishes are still missing after retake**
**Given** the retake scan still misses some dishes
**When** the merged result is committed to Supabase
**Then** the `ScanConfidenceBanner` updates with the new `recognisedCount` and `totalDetected` values; the remaining recovery options (Add manually, Continue with N) are still available

**AC5 — New visit record created per retake**
**Given** any retake scan completes (regardless of whether new dishes are found)
**When** dishes are persisted to Supabase
**Then** a new `restaurant_visits` row is created with `visit_type: 'scan'` and the same `restaurant_id` as the original scan

**AC6 — TanStack Query cache is refreshed after retake**
**Given** new recipe rows have been inserted into Supabase
**When** the retake persistence finishes
**Then** `queryClient.invalidateQueries(["recipes", "restaurant", restaurantId])` is called so `RestaurantScreen` re-renders with the updated dish list

---

## What This Story Changes

### Modified File: `src/components/scan/ScanConfidenceBanner.tsx`

The banner already has an `onRetake` prop (stub from Story 6.1). This story wires it up to pass context to the camera modal.

**Add `existingDishNames` and `totalDetected` to props:**

```typescript
export interface ScanConfidenceBannerProps {
  recognisedCount: number;
  totalDetected: number;
  existingDishNames: string[];   // NEW — names of already-captured dishes
  onRetake: () => void;
  onAddManually: () => void;
  onContinue: () => void;
}
```

The `existingDishNames` array is passed through to the parent (`RestaurantScreen`) which builds it from the current recipe list. `ScanConfidenceBanner` itself does not consume `existingDishNames` — it forwards it only conceptually; the actual array is provided by `RestaurantScreen` and forwarded into `CameraModal` when `onRetake` fires.

### Modified File: `src/components/screens/RestaurantScreen.tsx`

#### 1. Retake mode state

Add retake modal state:

```typescript
const [retakeCameraOpen, setRetakeCameraOpen] = useState(false);
```

#### 2. Build `existingDishNames` from current recipe list

```typescript
const existingDishNames: string[] = recipes
  .filter((r) => r.dish.name.trim().length > 0)
  .map((r) => r.dish.name.toLowerCase().trim());
```

#### 3. Wire `onRetake` in `ScanConfidenceBanner`

```typescript
<ScanConfidenceBanner
  recognisedCount={recipes.length}
  totalDetected={totalDetected}
  existingDishNames={existingDishNames}
  onRetake={() => setRetakeCameraOpen(true)}
  onAddManually={...}
  onContinue={...}
/>
```

#### 4. Render `CameraModal` in retake mode

When `retakeCameraOpen` is true, render `CameraModal` with retake context:

```typescript
{retakeCameraOpen && (
  <CameraModal
    mode="retake"
    restaurantId={supabaseRestaurant?.id ?? null}
    restaurantName={restaurantName}
    existingDishNames={existingDishNames}
    totalDetected={totalDetected}
    onClose={() => setRetakeCameraOpen(false)}
    onRetakeMerged={(newRecipeCount: number) => {
      setRetakeCameraOpen(false);
      // Update totalDetected to reflect newly captured dishes:
      // the original totalDetected stays the same; recognisedCount
      // increases automatically as the query cache refreshes.
    }}
  />
)}
```

### Modified File: `src/components/scan/CameraModal.tsx`

#### 1. Add `mode` and retake-specific props

```typescript
interface CameraModalProps {
  /** 'scan' — normal first-time capture; 'retake' — merge scan */
  mode?: 'scan' | 'retake';
  /** Provided in retake mode: Supabase restaurantId to merge into */
  restaurantId?: string | null;
  /** Provided in retake mode: already-captured dish names (lowercase trimmed) */
  existingDishNames?: string[];
  /** Provided in retake mode: original totalDetected count for context header */
  totalDetected?: number;
  /** Provided in retake mode: called with count of newly added recipes after merge */
  onRetakeMerged?: (newRecipeCount: number) => void;
  restaurantName?: string | null;
  onClose: () => void;
}
```

#### 2. Retake context header in the viewfinder

When `mode === 'retake'`, show a persistent context header above the shutter button:

```typescript
{mode === 'retake' && existingDishNames && totalDetected !== undefined && (
  <div
    role="status"
    aria-live="polite"
    style={{
      position: 'absolute',
      top: 'calc(var(--space-safe-top, 0px) + 16px)',
      left: 20,
      right: 20,
      zIndex: 20,
      borderRadius: 12,
      background: 'rgba(13,11,9,0.72)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      padding: '10px 16px',
      textAlign: 'center',
    }}
  >
    <p style={{ color: '#fff', fontSize: 13, fontWeight: 600, margin: 0 }}>
      {existingDishNames.length} dish{existingDishNames.length !== 1 ? 'es' : ''} captured
    </p>
    <p style={{ color: 'rgba(255,255,255,0.72)', fontSize: 12, margin: '2px 0 0' }}>
      Scan the menu to read the remaining {totalDetected - existingDishNames.length}
    </p>
  </div>
)}
```

#### 3. Post-capture: dedup + persist retake result

After Gemini returns dishes in retake mode, replace the normal `autoSaveToSupabase` path with `retakeMergeAndSave`:

```typescript
if (mode === 'retake' && restaurantId) {
  const newCount = await retakeMergeAndSave({
    restaurantId,
    newDishes: scanResult.allDishes,
    existingDishNames: existingDishNames ?? [],
    queryClient,
  });
  onRetakeMerged?.(newCount);
} else {
  // Normal first-time save path
  void autoSaveToSupabase(scanKey);
}
```

### New File: `src/lib/retakeMergeAndSave.ts`

Dedicated module for retake-specific persistence logic. Keeps `CameraModal` and `supabaseAutoSave` unchanged except for the new call site.

```typescript
/**
 * retakeMergeAndSave — merge a retake scan result into an existing restaurant.
 *
 * Deduplicates against existing recipe rows by dish name (case-insensitive,
 * trimmed). Only inserts truly new dishes. Creates a new restaurant_visits row
 * for the retake. Invalidates the TanStack Query cache when done.
 *
 * SEC-INJ-1.00: all values passed to Supabase via parameterised client calls.
 * SEC-SEC-1.00: uses browser anon key — no service role in client code.
 */

import { supabase } from '@/lib/supabase';
import type { QueryClient } from '@tanstack/react-query';

interface RetakeDish {
  id?: string;
  name: string;
  description?: string;
  calorieEstimate?: number | null;
  confidence?: number;
  ingredients?: Array<{
    name: string;
    quantity?: string | null;
    unit?: string | null;
    confidenceLevel?: 'high' | 'medium' | 'low';
  }>;
}

interface RetakeMergeOptions {
  restaurantId: string;
  newDishes: RetakeDish[];
  /** Already-captured dish names — lowercase, trimmed */
  existingDishNames: string[];
  queryClient: QueryClient;
}

/**
 * @returns Number of newly inserted recipe rows (0 if all dishes were already captured)
 */
export async function retakeMergeAndSave({
  restaurantId,
  newDishes,
  existingDishNames,
  queryClient,
}: RetakeMergeOptions): Promise<number> {
  // Step 1: Filter to only truly new dish names
  const existingSet = new Set(existingDishNames);
  const dishesToInsert = newDishes.filter(
    (d) => d.name.trim().length > 0 && !existingSet.has(d.name.toLowerCase().trim())
  );

  // Step 2: Create a new visit record for this retake
  const { data: visitData } = await supabase
    .from('restaurant_visits')
    .insert({
      restaurant_id: restaurantId,
      visit_type: 'scan',
      raw_menu_json: JSON.stringify(
        dishesToInsert.map((d) => ({ name: d.name, description: d.description ?? '' }))
      ),
    })
    .select('id')
    .single();

  const visitId = visitData?.id ?? null;

  // Step 3: Insert only the new recipe rows
  let insertedCount = 0;

  for (const dish of dishesToInsert) {
    // Double-check against Supabase in case of race (e.g. another tab saved meanwhile)
    const { data: existing } = await supabase
      .from('recipes')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .ilike('name', dish.name.trim())
      .neq('status', 'removed')
      .limit(1)
      .single();

    if (existing) continue; // already present — skip

    const estimatedCalories =
      typeof dish.calorieEstimate === 'number' && dish.calorieEstimate > 0
        ? Math.round(dish.calorieEstimate)
        : null;

    const { data: recipeData, error: recipeError } = await supabase
      .from('recipes')
      .insert({
        restaurant_id: restaurantId,
        visit_id: visitId,
        name: dish.name.trim(),
        description: dish.description ?? null,
        estimated_calories: estimatedCalories,
        status: 'auto_captured',
        gemini_confidence: typeof dish.confidence === 'number' ? dish.confidence : null,
        photo_status:
          typeof dish.confidence === 'number' && dish.confidence < 0.3
            ? 'suppressed'
            : 'placeholder',
      })
      .select('id')
      .single();

    if (recipeError || !recipeData) {
      console.warn('[retakeMergeAndSave] recipe insert failed for', dish.name, recipeError?.message);
      continue;
    }

    insertedCount++;

    // Insert ingredients (best-effort — non-blocking)
    const ingredientsToInsert = (dish.ingredients ?? [])
      .filter((ing) => ing.name?.trim())
      .map((ing) => ({
        recipe_id: recipeData.id,
        name: ing.name.trim(),
        quantity: ing.quantity ?? null,
        unit: ing.unit ?? null,
        confidence: (ing.confidenceLevel ?? 'medium') as 'high' | 'medium' | 'low',
      }));

    if (ingredientsToInsert.length > 0) {
      const { error: ingError } = await supabase
        .from('recipe_ingredients')
        .insert(ingredientsToInsert);

      if (ingError) {
        console.warn('[retakeMergeAndSave] ingredients insert failed:', ingError.message);
      }
    }
  }

  // Step 4: Invalidate TanStack Query cache so RestaurantScreen re-renders
  await queryClient.invalidateQueries({
    queryKey: ['recipes', 'restaurant', restaurantId],
  });

  return insertedCount;
}
```

---

## Dev Notes

### Why a separate `retakeMergeAndSave` module (not reusing `supabaseAutoSave`)?

`supabaseAutoSave` reads from sessionStorage, upserts the restaurant row, and always re-creates a full visit. For a retake, the restaurant already exists (we have its `restaurantId`) and we must skip dishes that are already in the DB. Adding a `mode` parameter to `supabaseAutoSave` would make it harder to reason about. A dedicated module keeps both paths simple.

### Deduplication strategy: in-memory set + DB fallback

The in-memory `existingDishNames` set (from the current recipe list) covers the common case. The Supabase `ilike` double-check in `retakeMergeAndSave` guards against race conditions (e.g. a concurrent session on another device). Using `ilike` for the case-insensitive match aligns with PostgreSQL's native collation without requiring a custom index.

### `totalDetected` stays fixed; `recognisedCount` updates via query invalidation

The original `totalDetected` (raw Gemini dish count from the first scan) represents the true size of the menu. It should not be re-set on a retake — a retake only adds to what was captured. After `queryClient.invalidateQueries` fires, `useRecipesByRestaurant` returns an updated list, `recipes.length` grows, and `ScanConfidenceBanner` recalculates the missed count automatically.

The parent `RestaurantScreen` computes `recognisedCount` as `recipes.length` (not as a separate piece of state), so no additional state management is needed.

### Banner dismiss condition

`ScanConfidenceBanner` is rendered conditionally in `RestaurantScreen` based on:

```typescript
const showConfidenceBanner =
  totalDetected > 0 && recipes.length < totalDetected;
```

Once `recipes.length === totalDetected`, the condition becomes false, `AnimatePresence` exits the banner, and it is dismissed automatically — no explicit imperative dismiss call is needed.

### CameraModal stays generic

The `mode` prop defaults to `'scan'`. All existing call sites that do not pass `mode` continue to work exactly as before. The retake context header and post-capture branching are additive changes only.

### `restaurantId` may be null in retake mode

If Supabase has not yet persisted the restaurant row (very edge case — retake happens within milliseconds of the first scan), `restaurantId` will be `null`. In that case `CameraModal` falls back to the normal `autoSaveToSupabase` path with a `console.warn`. This is acceptable: the user gets the normal save behaviour rather than a broken retake.

### No changes to the scan API route

`/api/scan/route.ts` is not changed. The retake scan is a standard POST to `/api/scan` — the same Gemini extraction pipeline runs. Deduplication is a client-side concern.

### sessionStorage update after retake

When a retake scan succeeds, write the merged result back to sessionStorage so that `loadTotalDetected` and `loadRecipesForRestaurant` remain consistent on the next page refresh:

```typescript
// In CameraModal, after retakeMergeAndSave resolves:
const retakeKey = `plately_scan_${crypto.randomUUID()}`;
sessionStorage.setItem(
  retakeKey,
  JSON.stringify({
    ...scanResult,
    restaurantPlaceId: placeId,
    totalDetected: totalDetected, // preserve original count
    scannedAt: Date.now(),
  })
);
```

---

## Testing Requirements

### Framework

Vitest + React Testing Library.

### New test file: `src/lib/retakeMergeAndSave.test.ts`

```
describe('retakeMergeAndSave')
  ├── inserts only dish names not in existingDishNames (case-insensitive)
  ├── skips dishes whose names already exist in DB (ilike double-check)
  ├── creates a new restaurant_visits row with visit_type "scan"
  ├── returns count of newly inserted recipes
  ├── returns 0 when all retake dishes are already present
  ├── still creates a visit row when 0 new dishes are inserted
  ├── calls queryClient.invalidateQueries with correct key after insert
  └── handles supabase insert error gracefully — logs warning, continues
```

**Mock setup:**

```typescript
import { vi } from 'vitest';
import * as supabaseModule from '@/lib/supabase';

const mockInsert = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();

vi.spyOn(supabaseModule, 'supabase', 'get').mockReturnValue({
  from: () => ({
    insert: mockInsert,
    select: mockSelect,
    single: mockSingle,
    ilike: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  }),
} as unknown as typeof supabaseModule.supabase);

const mockQueryClient = {
  invalidateQueries: vi.fn().mockResolvedValue(undefined),
};
```

### New test file: `src/components/scan/CameraModal.retake.test.tsx`

```
describe('CameraModal — retake mode')
  ├── renders retake context header when mode="retake"
  ├── retake header shows correct captured count and remaining count
  ├── does NOT render retake header when mode="scan" (default)
  ├── calls onRetakeMerged with new recipe count after successful scan
  └── falls back to autoSaveToSupabase when restaurantId is null in retake mode
```

### New test file: `src/components/screens/RestaurantScreen.retake.test.tsx`

```
describe('RestaurantScreen — retake flow integration')
  ├── tapping "Retake photo" in ScanConfidenceBanner opens CameraModal
  ├── ScanConfidenceBanner receives existingDishNames derived from recipes list
  ├── banner dismisses when recipes.length reaches totalDetected after retake
  ├── banner updates count when retake adds some but not all missing dishes
  └── CameraModal closes when onClose is called (user cancels retake)
```

---

## What Does NOT Change in This Story

| File | Reason |
|------|--------|
| `src/app/api/scan/route.ts` | Retake uses the same scan endpoint; no API changes needed |
| `src/lib/supabaseAutoSave.ts` | Normal (first-scan) save path is untouched |
| `src/types/database.ts` | No schema changes; `restaurant_visits` and `recipes` tables already support the new rows |
| `src/components/scan/DishRowCompact.tsx` | No changes |
| `src/components/scan/DishRowExpanded.tsx` | No changes |
| Any migration files | No new columns or tables; retake creates standard rows |
| `planning/sprint-status.yaml` | Do NOT update |

---

## Architecture Guardrails

- **No string concatenation in queries** — SEC-INJ-1.00: all Supabase calls use parameterised client methods (`eq`, `ilike`, `neq`, `insert`); never string-interpolated SQL
- **No PII in logs** — SEC-DAT-1.00: `console.warn` calls log only error messages and dish name (already user-visible in the UI); no ingredient or calorie data is logged
- **Anon key only** — SEC-SEC-1.00: `retakeMergeAndSave` imports from `@/lib/supabase` (browser anon client); never calls `createClient()` inline
- **Additive CameraModal changes only** — `mode` defaults to `'scan'`; all existing call sites unaffected; no breaking prop changes
- **Query key matches existing pattern** — `['recipes', 'restaurant', restaurantId]` matches the key used in `useRecipesByRestaurant` (confirmed in `src/hooks/useRecipes.ts`)
- **Fail gracefully on `restaurantId === null`** — retake falls back to `autoSaveToSupabase` rather than silently dropping the scan
- **No new global state** — retake modal open/close is local to `RestaurantScreen`; no context or Zustand store needed

---

## Definition of Done

- [x] `ScanConfidenceBanner` `onRetake` prop is wired in `RestaurantScreen` — tapping "Retake photo" opens `CameraModal` in retake mode
- [x] `CameraModal` renders retake context header (captured count + remaining count) when `mode="retake"`
- [x] `retakeMergeAndSave` correctly deduplicates by name (case-insensitive, trimmed) and inserts only new dishes
- [x] `retakeMergeAndSave` creates a new `restaurant_visits` row with `visit_type: 'scan'` for every retake, even when 0 new dishes are added
- [x] `queryClient.invalidateQueries(["recipes", "restaurant", restaurantId])` is called after retake insert completes
- [x] `ScanConfidenceBanner` dismisses automatically when `recipes.length === totalDetected` post-retake
- [x] `ScanConfidenceBanner` updates its count (does not dismiss) when retake adds some but not all missing dishes
- [x] CameraModal falls back to `autoSaveToSupabase` when `restaurantId` is null in retake mode
- [x] `src/lib/retakeMergeAndSave.test.ts` — all cases pass
- [x] `src/components/capture/CameraModal.retake.test.tsx` — all cases pass
- [x] `src/components/screens/RestaurantScreen.retake.test.tsx` — all cases pass
- [x] TypeScript strict: no new errors in story files
- [x] `planning/sprint-status.yaml` is NOT modified

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `vi.hoisted()` required for `mockRetakeMergeAndSave` in `CameraModal.retake.test.tsx` — `vi.mock()` factory is hoisted to file top, so the referenced const must be initialised before that point
- `CameraModal.test.tsx` needed `vi.mock('@/lib/retakeMergeAndSave', ...)` + `vi.mock('@tanstack/react-query', ...)` added because CameraModal now imports `retakeMergeAndSave` → imports `supabase` → throws `Missing required environment variables` in jsdom
- `onProcessingStart` lacked optional chaining in `submitImage()` — caused `TypeError: onProcessingStart is not a function` in retake mode (where that prop is not provided); fixed with `onProcessingStart?.()`
- `fireEvent.change(fileInput, { target: { files: [file] } })` is the correct RTL pattern for triggering file input; `dispatchEvent` + `Object.assign` approach was rejected by jsdom

### Completion Notes List

- Story spec placed `CameraModal.tsx` in `src/components/scan/`; actual location is `src/components/capture/` — test file paths corrected accordingly
- `existingDishNames` accepted in `ScanConfidenceBanner` props for type completeness but not rendered — forwarded conceptually; actual array is built in `RestaurantScreen` and injected into `CameraModal`
- `onProcessingStart`, `onProcessingComplete`, `onProcessingError` all made optional in `CameraModalProps` so retake mode callers don't need to supply scan-path handlers
- Banner dismiss is purely reactive: `showConfidenceBanner = totalDetected > 0 && recipes.length < totalDetected`; no imperative dismiss needed
- Pre-existing `HomeScreen.test.tsx` flaky failure on `isWithin7Days` 1ms boundary test not introduced by this story — passes in isolation, flakes in full suite due to timing drift

### File List

- `src/lib/retakeMergeAndSave.ts` — NEW
- `src/lib/retakeMergeAndSave.test.ts` — NEW
- `src/components/capture/CameraModal.tsx` — MODIFIED (retake props, context header, `handlePostScan`, optional chaining on callbacks)
- `src/components/capture/CameraModal.test.tsx` — MODIFIED (added `retakeMergeAndSave` + `useQueryClient` mocks)
- `src/components/capture/CameraModal.retake.test.tsx` — NEW
- `src/components/scan/ScanConfidenceBanner.tsx` — MODIFIED (added `existingDishNames?: string[]` prop)
- `src/components/screens/RestaurantScreen.tsx` — MODIFIED (retake state, existingDishNames, CameraModal retake render)
- `src/components/screens/RestaurantScreen.retake.test.tsx` — NEW

### Change Log

| Date | Change |
|------|--------|
| 2026-04-13 | Implemented Story 6.2 — Retake Photo Flow; all 40 story tests green |
