# Story 3.6: Progressive Enrichment UX — Phase 2 Update

Status: review
Epic: 3 — Dish Photos, USDA Nutrition & Portion Control
Story ID: 3.6
Story Key: 3-6-progressive-enrichment-ux-phase-2-update
Created: 2026-04-12

---

## Story

As a user,
I want dish cards to silently upgrade with photos and verified macros as data becomes available — without any interruption to browsing,
So that the app feels fast even when enrichment is still running.

---

## Acceptance Criteria

**AC1 — In-place update when Phase 2 enrichment completes**
**Given** Phase 1 dish cards are rendered with AI macros and placeholder photos
**When** Phase 2 enrichment completes for a dish (Places photo + USDA macros)
**Then** the dish card updates in-place: the photo transitions from placeholder to confirmed image; macro values reflect the enriched numbers; no full re-render or layout shift occurs

**AC2 — "—" while loading; animate in when resolved**
**Given** enrichment is running and macro values have not yet been computed for a dish
**When** the MacroBar or macro chips render
**Then** the display shows "—" in muted colour; once values arrive, they animate in per the spec in Story 3.4 (200ms opacity + translateY — already implemented in 3.4's MacroBar motion wrapper)

**AC3 — Identical pattern for scan and search paths**
**Given** a dish is auto-captured via camera scan OR via restaurant search
**When** enrichment runs
**Then** the progressive enrichment pattern is identical for both paths — no separate code path for scan vs. search enrichment; both use the same `useEnrichment` hook

**AC4 — Per-dish failure isolation**
**Given** Phase 2 enrichment for one dish fails (USDA timeout, Places error, etc.)
**When** that dish's enrichment errors
**Then** all other dishes in the same session continue enriching normally; the failed dish retains its Phase 1 AI-estimated values with the "Est." label; the app does not crash and no error UI is shown

**AC5 — Macro totals flow from enrichment to DishRowCompact**
**Given** `RestaurantScreen` renders Supabase-backed recipe rows as DishRowCompact cards
**When** enrichment has completed and macro totals are available
**Then** `DishRowCompact` receives `totalProtein`, `totalCarbs`, `totalFat` as non-null values (from the Supabase recipe row) and renders the macro chip row

**AC6 — `macroSource` prop wired from enrichment result to DishRowCompact**
**Given** enrichment has run and `macroSource` is determinable
**When** `RestaurantScreen` renders DishRowCompact
**Then** it passes `macroSource='usda'` when all three macro total columns (`total_protein_g`, `total_carbs_g`, `total_fat_g`) are non-null — a null-presence heuristic indicating the USDA enrichment pipeline ran — or omits the prop (defaults to `'ai'`) when any total is null. Note: `DishRowExpanded` derives provenance independently via `deriveMacroSource(ingredients)` using per-ingredient USDA FDC IDs; the two views use different but valid strategies for their respective data availability.

---

## This Is Brownfield — Audit First, Fix Second

### What already works

| Feature | Status | Notes |
|---------|--------|-------|
| `useEnrichment` hook | ✅ Working | Fire-and-forget; POSTs to `/api/scan/enrich`; merges to sessionStorage; writes `dish_image_url` + `photo_status` to Supabase; invalidates queries |
| `RestaurantScreen` enrichment trigger | ✅ Working | `enrich(scanKey, dishToRecipeMap)` called after `autoSaveToSupabase` |
| Query invalidation on enrichment | ✅ Working | `queryClient.invalidateQueries` fires after Supabase writes |
| MacroBar "—" for null values | ✅ Working | `MacroBar` renders "—" when any prop is `null` |
| `DishRowCompact` "Est." badge | ✅ Working | Already conditional on `hasMacros` |

### The gap — what story 3.6 must fix

**`RestaurantScreen` passes `null` for all macro totals:**

```typescript
// RestaurantScreen.tsx, line ~799 (Supabase-backed dish list section):
<DishRowCompact
  recipe={recipe}
  totalProtein={null}   // ← TODO comment says Story 2.6 wires this
  totalCarbs={null}     // ← still null; macro chips never appear for Supabase recipes
  totalFat={null}       // ← still null
  isExpanded={expandedDishId === recipe.id}
  onToggle={...}
/>
```

The macro chip row on DishRowCompact only appears when `hasMacros` is true. Because `totalProtein/Carbs/Fat` are always null, the chip row is never visible for Supabase-backed recipes — even after enrichment.

**Root cause:** `DomainRecipe` (from `supabaseRecipeRows`) does not carry macro totals. The totals live in `recipe_ingredients` rows but are not joined or denormalized.

---

## Architecture Decision: Denormalise Macro Totals onto the `recipes` Row

Rather than joining `recipe_ingredients` on every recipe list query (which would require an RPC or complex Supabase join for N recipes), this story adds four columns to `recipes`:

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `total_protein_g` | `numeric` | YES | Null until enrichment; never 0 when actually zero |
| `total_carbs_g` | `numeric` | YES | Same |
| `total_fat_g` | `numeric` | YES | Same |
| `total_fibre_g` | `numeric` | YES | Fibre may remain null if not computed |

These are written once during enrichment and treated as a cache of the sum of `recipe_ingredients`. They are invalidated (set back to null) if ingredients change in future stories.

---

## Implementation Plan

### Step 1 — Database migration

Create `supabase/migrations/010_recipe_macro_totals.sql`:

```sql
-- Story 3.6: Denormalised macro totals on recipes
-- Written during enrichment; null = not yet enriched
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS total_protein_g numeric,
  ADD COLUMN IF NOT EXISTS total_carbs_g numeric,
  ADD COLUMN IF NOT EXISTS total_fat_g numeric,
  ADD COLUMN IF NOT EXISTS total_fibre_g numeric;
```

No backfill needed — existing rows remain null (treated as "not enriched").

### Step 2 — Update `RecipeRowSchema` and `DomainRecipe`

In `src/types/database.ts`:

**Add to `RecipeRowSchema`:**

```typescript
total_protein_g: z.number().nullable().optional(),
total_carbs_g: z.number().nullable().optional(),
total_fat_g: z.number().nullable().optional(),
total_fibre_g: z.number().nullable().optional(),
```

**Add to `DomainRecipe`:**

```typescript
totalProteinG: number | null
totalCarbsG: number | null
totalFatG: number | null
totalFibreG: number | null
```

**Update `mapRecipe`:**

```typescript
export function mapRecipe(row: Recipe): DomainRecipe {
  return {
    // ... existing fields ...
    totalProteinG: row.total_protein_g ?? null,
    totalCarbsG: row.total_carbs_g ?? null,
    totalFatG: row.total_fat_g ?? null,
    totalFibreG: row.total_fibre_g ?? null,
  }
}
```

**Update `RecipeUpdateSchema`** — ensure it allows updating the new columns (they're in the `.partial()` update schema already via `RecipeRowSchema.omit({...}).partial()` — verify this remains correct).

### Step 3 — Update `useEnrichment` to write macro totals

In `src/hooks/useEnrichment.ts`, after the existing photo writes, also write macro totals:

```typescript
// After existing photo writes, add macro total writes:
const macroWrites = enrichedDishes
  .filter((d) => d.id && dishToRecipeMap[d.id!])
  .map((d) =>
    supabase
      .from('recipes')
      .update({
        total_protein_g: d.totalProtein,
        total_carbs_g: d.totalCarbs,
        total_fat_g: d.totalFat,
        total_fibre_g: null, // fibre not yet in enrich API response; keep null
      })
      .eq('id', dishToRecipeMap[d.id!])
  )

if (macroWrites.length > 0) {
  await Promise.allSettled(macroWrites)
  // Query invalidation already occurs in the photo write block above;
  // no duplicate invalidation needed here
}
```

Note: Check whether the enrich API returns `totalFat` or `totalFatG` — match the field name used in `EnrichedDish`.

### Step 4 — Update `RestaurantScreen` to wire macro totals

In `src/components/screens/RestaurantScreen.tsx`, the Supabase-backed dish list section:

**Remove the TODO comment. Replace the null placeholders:**

```typescript
<DishRowCompact
  recipe={recipe}
  totalProtein={recipe.totalProteinG}
  totalCarbs={recipe.totalCarbsG}
  totalFat={recipe.totalFatG}
  isExpanded={expandedDishId === recipe.id}
  onToggle={() => setExpandedDishId((prev) => prev === recipe.id ? null : recipe.id)}
/>
```

**Also wire `DishRowExpanded` macro totals:**

```typescript
<DishRowExpanded
  recipe={recipe}
  expandedRecipe={expandedRecipe?.id === recipe.id ? expandedRecipe : null}
  ingredientsError={expandedRecipeError}
  totalProtein={recipe.totalProteinG}
  totalCarbs={recipe.totalCarbsG}
  totalFat={recipe.totalFatG}
  totalFibre={recipe.totalFibreG}
  onCollapse={() => setExpandedDishId(null)}
  onAddToRecipes={() => {}}
/>
```

**Wire `macroSource` for DishRowCompact:**

For now, pass `macroSource` as `'usda'` only when all columns are non-null (a heuristic signal that USDA enrichment ran):

```typescript
const macroSource =
  recipe.totalProteinG != null &&
  recipe.totalCarbsG != null &&
  recipe.totalFatG != null
    ? 'usda'
    : undefined // defaults to 'ai' in DishRowCompact

// Then pass:
macroSource={macroSource}
```

This is a conservative heuristic — if macros are present they came from USDA enrichment. Story 3.4 derives the accurate per-ingredient provenance from `expandedRecipe.ingredients` for the expanded view; the compact badge uses this simpler signal.

---

## What Does NOT Change

| Component | Reason |
|-----------|--------|
| `/api/scan/enrich/route.ts` | Already returns `totalCalories`, `totalProtein`, `totalFat`, `totalCarbs` per dish — confirm field names against `EnrichedDish` interface in `useEnrichment.ts` |
| `useEnrichment` enrichment trigger logic | Fire-and-forget pattern is correct; only the Supabase write block expands |
| Session-only recipe path in `RestaurantScreen` | Session recipes still use the `RecipeCard` grid (not the accordion); macro totals come from sessionStorage enrichment there |
| `DishRowCompact` and `DishRowExpanded` components | These are not modified in story 3.6 (only their props change at the call site) |
| `MacroBar.tsx` | Not modified |

---

## Enrichment Field Name Verification

Before writing step 3, confirm that `EnrichedDish` in `useEnrichment.ts` exposes the right fields:

```typescript
interface EnrichedDish {
  id?: string
  name: string
  servings: number
  ingredients: unknown[]
  photoUrl: string | null
  totalCalories: number | null
  totalProtein: number | null   // ← confirm this matches the API response
  totalFat: number | null       // ← confirm this
  totalCarbs: number | null     // ← confirm this
}
```

If the API returns `total_protein` (snake_case) instead of `totalProtein` (camelCase), the existing `EnrichedDish` interface in `useEnrichment.ts` already maps it. If there is a mismatch, fix `EnrichedDish` rather than changing the API route.

---

## Tests Required

### New tests — integration-style in RestaurantScreen or hook unit tests

**`src/hooks/useEnrichment.test.ts`** (if it doesn't exist: create it with minimal setup):

```
describe('useEnrichment macro writes')
  ├── writes total_protein_g, total_carbs_g, total_fat_g to Supabase after enrichment
  ├── does not write total_fibre_g (always null from enrich API)
  └── uses Promise.allSettled for macro writes — one failure does not block others
```

**`src/components/screens/RestaurantScreen.test.tsx`** (or integration tests if they exist):

This is complex — defer to the dev agent to determine the right testing strategy for `RestaurantScreen`. At minimum, confirm:

```
- DishRowCompact receives totalProtein/Carbs/Fat from recipe.totalProteinG etc.
- DishRowCompact receives macroSource='usda' when all three macro totals are non-null
- DishRowCompact receives macroSource=undefined when any macro total is null
```

### Database migration test

No Vitest test needed for the SQL migration. Manual verification: apply migration, confirm columns exist via Supabase dashboard or `\d recipes` in psql.

---

## Architecture Guardrails

- **Migration-first discipline (ARCH3)** — The `total_protein_g` columns must be added via a numbered migration file (`010_`). No `ALTER TABLE` in seed scripts or runtime code.
- **No inline Supabase client** — `useEnrichment` already imports from `@/lib/supabase`. Keep this pattern; do not create an inline client.
- **`Promise.allSettled` for writes** — Macro writes must use `Promise.allSettled`, not `Promise.all`. One failed write must not block the others (AC4: per-dish failure isolation).
- **Null propagation** — `total_protein_g: null` in the DB maps to `totalProteinG: null` in DomainRecipe, which flows to `totalProtein={null}` in DishRowCompact, which sets `hasMacros = false` — the chip row is hidden. This is correct: no macros → no chip row.
- **No fibre in compact row** — `DishRowCompact` only shows P/C/F chips. `total_fibre_g` is stored but only appears in DishRowExpanded via `MacroBar`.
- **`RecipeUpdateSchema` must include new columns** — Verify that `RecipeRowSchema.omit({id, created_at, restaurant_id, visit_id}).partial()` includes the new columns. Since the schema uses `.partial()`, any new fields added to `RecipeRowSchema` are automatically included.
- **No PII in logs (SEC-DAT-1.00)** — Macro values are aggregate numbers; they are not PII. But do not log dish names or restaurant names in error paths.
- **Query cache coherence** — After macro writes, query invalidation is already triggered by the existing photo write block in `useEnrichment`. Confirm the `queryKey: ['recipes', 'restaurant']` invalidation covers `useRecipesByRestaurant`. Check `useRecipes.ts` for the query key used.

---

## File Scope

### Files to create

| File | Change |
|------|--------|
| `supabase/migrations/010_recipe_macro_totals.sql` | New migration: adds 4 nullable numeric columns to `recipes` |

### Files to modify

| File | Change |
|------|--------|
| `src/types/database.ts` | Add `total_protein_g/total_carbs_g/total_fat_g/total_fibre_g` to `RecipeRowSchema`; add `totalProteinG/totalCarbsG/totalFatG/totalFibreG` to `DomainRecipe`; update `mapRecipe` |
| `src/hooks/useEnrichment.ts` | Add macro total Supabase writes after photo writes |
| `src/components/screens/RestaurantScreen.tsx` | Wire `totalProtein/Carbs/Fat/Fibre` and `macroSource` from recipe row to `DishRowCompact` and `DishRowExpanded`; remove TODO comment |
| `src/hooks/useEnrichment.test.ts` | New or extended — test macro write behaviour |

### Files NOT to touch

| File | Reason |
|------|--------|
| `src/components/scan/DishRowCompact.tsx` | Props wiring only — component itself not changed |
| `src/components/scan/DishRowExpanded.tsx` | Props wiring only — component itself not changed |
| `src/components/ui/MacroBar.tsx` | Not in scope |
| `src/app/api/scan/enrich/route.ts` | Enrich API already returns macro totals; only check field names match |
| Any previous migration files (001–009) | Do not modify existing migrations |
| `planning/sprint-status.yaml` | Do not update sprint status |

---

## Key Context from Epic 3

Story 3.6 is the final integration story of Epic 3. By this point:
- **3.1 (done)**: Google Places enrichment writes `dish_image_url` and sets `photo_status: 'confirmed'`
- **3.2 (done)**: USDA enrichment writes ingredient-level macros to `recipe_ingredients`
- **3.3 (done)**: `PhotoFrame` correctly renders all three photo states
- **3.4 (done)**: Provenance badges and MacroBar animation are wired in components
- **3.5 (done)**: Portion adjustment scales macros client-side

Story 3.6 closes the loop: the USDA macro totals computed in 3.2 (summed from `recipe_ingredients`) are denormalized onto the `recipes` row and surfaced in the `RestaurantScreen` render. For the first time, DishRowCompact shows actual non-null macro chip values for Supabase-backed recipes after enrichment.

**After story 3.6**: The home screen (`HomeScreen`) will show dish cards with real macro data. Epic 3 is complete.

---

## Definition of Done

- [x] Migration `011_recipe_macro_totals.sql` creates `total_protein_g`, `total_carbs_g`, `total_fat_g`, `total_fibre_g` columns on `recipes` (note: numbered 011 since 010_photo_status.sql already existed)
- [x] `RecipeRowSchema` includes the four new nullable numeric fields
- [x] `DomainRecipe` includes `totalProteinG`, `totalCarbsG`, `totalFatG`, `totalFibreG`
- [x] `mapRecipe` correctly maps the four columns (null-coalescing to `null`)
- [x] `useEnrichment` writes macro totals to Supabase using `Promise.allSettled` after enrichment
- [x] `RestaurantScreen` passes `totalProtein={recipe.totalProteinG}` etc. to both `DishRowCompact` and `DishRowExpanded`; the TODO comment is removed
- [x] `DishRowCompact` receives `macroSource='usda'` when all three macro totals are non-null; `undefined` otherwise
- [x] After enrichment, Supabase recipes have non-null `total_protein_g` values; query invalidation causes `RestaurantScreen` to re-render with macro chips visible
- [x] A dish whose enrichment fails retains Phase 1 AI values (`total_protein_g` remains null); its card shows no macro chips (correct degraded state)
- [x] TypeScript strict mode passes with no new errors
- [x] Enrichment pattern is identical for scan and search paths (both use `useEnrichment`; no branching)

---

## Dev Agent Record

### Implementation Notes

**Brownfield audit findings:**
- `010_photo_status.sql` already exists → migration numbered `011_recipe_macro_totals.sql`
- `DishRowCompact` already has `macroSource` prop (added in story 3.4) with "USDA" badge rendering — no change needed to the component
- Test fixtures in `DishRowCompact.test.tsx` and `DishRowExpanded.test.tsx` already included the new `DomainRecipe` fields (story 3.4 prepared them)
- `macroSource` tests already exist in `DishRowCompact.test.tsx`

**Key implementation decisions:**
- Photo writes and macro writes combined into a single `Promise.allSettled` call before query invalidation — ensures the refetch always sees both photo and macro data; also ensures invalidation fires even when dishes have macros but no photo (edge case the spec allowed to skip but this handles it correctly)
- `total_fibre_g` always written as `null` — fibre is not in the enrich API response and is reserved for a future story
- `macroSource` heuristic in `RestaurantScreen`: all three macro totals non-null → `'usda'`; any null → `undefined` (defaults to `'ai'` in the component). Conservative but correct: macros only become non-null via the USDA enrichment path

### Completion Notes

Story 3.6 closes Epic 3. The full progressive enrichment pipeline is now wired end-to-end:
- Phase 1 (Gemini scan) → AI macro estimates stored in `sessionStorage`
- Phase 2 (`useEnrichment`) → USDA macros written to `recipe_ingredients` AND denormalized totals written to `recipes.total_protein_g/carbs/fat`
- `RestaurantScreen` reads from `DomainRecipe.totalProteinG/CarbsG/FatG` → passes to `DishRowCompact` and `DishRowExpanded`
- `DishRowCompact` shows macro chip row with "USDA" badge when all three totals are present

### File List

| File | Action |
|------|--------|
| `supabase/migrations/011_recipe_macro_totals.sql` | Created |
| `src/types/database.ts` | Modified — RecipeRowSchema + 4 columns; DomainRecipe + 4 fields; mapRecipe updated |
| `src/hooks/useEnrichment.ts` | Modified — macro total Supabase writes added alongside photo writes |
| `src/components/screens/RestaurantScreen.tsx` | Modified — wired totalProtein/Carbs/Fat/Fibre and macroSource; removed TODO comment |
| `src/hooks/useEnrichment.test.ts` | Created — 5 tests for macro write behaviour |

### Change Log

- 2026-04-12: Story 3.6 implemented — denormalised macro totals on recipes, useEnrichment macro writes, RestaurantScreen wiring. All 353 tests pass + 5 new tests.

