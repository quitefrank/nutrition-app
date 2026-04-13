# Story 2.5: Dish Row Expansion & Ingredient List

Status: review
Epic: 2 — Menu Scan & Dish Auto-Capture
Story ID: 2.5
Story Key: 2-5-dish-row-expansion-ingredient-list
Created: 2026-04-12

---

## Story

As a user,
I want to tap a dish card to expand it in-place and see the typical ingredients,
So that I can understand what's in a dish without leaving the list view.

---

## Acceptance Criteria

**AC1 — Expand in-place with spring animation**
**Given** a `DishRowCompact` card is visible in the list
**When** the user taps it
**Then** it expands in-place using `SPRING_CARD_EXPAND` (`stiffness: 400, damping: 22`); the height animates from 0 → auto; the chevron rotates 90°; `aria-expanded` updates to `"true"` on the compact row's trigger

**AC2 — Single-open state**
**Given** a dish is expanded
**When** a second dish card is tapped
**Then** the first dish auto-collapses; only one dish can be expanded at a time; collapsing uses the same `SPRING_CARD_EXPAND` transition

**AC3 — DishRowExpanded renders**
**Given** `DishRowExpanded` is open
**When** it renders
**Then** it shows:
- 156px hero photo area (uses `PhotoFrame` with full width; placeholder during enrichment)
- Dish name in Playfair Display 19px (`var(--font-display)`)
- Calorie count in 19px semibold terracotta (`var(--color-accent)`); omitted when `estimatedCalories` is `null`
- `MacroBar` (Protein / Carbs / Fat / Fibre — 4 cells; fibre renders "—" when null)
- Ingredient highlights (from `recipe.ingredients`; if empty or not yet loaded, show skeleton or hide section)
- "Add to My Recipes" CTA pill (42px height, terracotta fill, white text)
- Surface: `--glass-elevated` + `--blur-elevated` + 20px radius + shadow (`--shadow-float`)
- `role="region"` + `aria-label="[Dish name] details"`

**AC4 — Reduced motion respected**
**Given** the device has `prefers-reduced-motion: reduce`
**When** the expansion is triggered
**Then** the expansion is immediate (no spring animation, no chevron rotation animation); no scale transform is applied

---

## What Already Exists (Do NOT Recreate)

| Item | Location | Status |
|------|----------|--------|
| `DishRowCompact` | `src/components/scan/DishRowCompact.tsx` | Done — 146 lines, comprehensive tests. Do NOT modify unless fixing a regression. |
| `PhotoFrame` | `src/components/ui/PhotoFrame.tsx` | Handles `confirmed`/`placeholder`/`suppressed` states. Reuse as-is. |
| `SPRING_CARD_EXPAND` | `src/lib/springs.ts` | `{ type: "spring", stiffness: 400, damping: 22 }`. Import; do NOT redefine. |
| `DomainRecipe`, `DomainIngredient` | `src/types/database.ts` | Types are correct. No schema changes needed. |
| `useRecipe(id)` | `src/hooks/useRecipes.ts` | Fetches a single recipe with ingredients (two queries: recipe + `recipe_ingredients`). Use to lazy-load the expanded recipe's ingredient list. |
| `useRecipesByRestaurant(restaurantId)` | `src/hooks/useRecipes.ts` | Returns `DomainRecipe[]` for the dish list. Does NOT include ingredients (no join). |
| `RestaurantScreen` | `src/components/screens/RestaurantScreen.tsx` | Currently uses `RecipeCard` grid layout. This story integrates the accordion. |

---

## New Files to Create

### 1. `src/components/scan/DishRowExpanded.tsx`

The expanded in-place dish view. Rendered directly below (or as a replacement for) the compact row when `isExpanded === true`.

#### Component Interface

```typescript
"use client"

interface DishRowExpandedProps {
  recipe: DomainRecipe
  /**
   * The full recipe WITH ingredients — fetched via useRecipe(recipe.id)
   * when the row is first expanded. Pass null while the fetch is pending.
   */
  expandedRecipe: DomainRecipe | null
  /** Macro totals — passed from parent (same values shown in compact state) */
  totalProtein?: number | null
  totalCarbs?: number | null
  totalFat?: number | null
  /**
   * Fibre is not in the DB schema yet — always null at Phase 1.
   * MacroBar must render "—" when null; do NOT hide the fibre cell.
   */
  totalFibre?: number | null
  /** Collapse the row */
  onCollapse: () => void
  /** "Add to My Recipes" tap — parent handles navigation */
  onAddToRecipes: () => void
  className?: string
}
```

#### Visual Specification

```
┌─────────────────────────────────────────────────────┐
│  ┌─────────────────────────────────────────────────┐ │
│  │         156px hero photo (full width)           │ │
│  │   PhotoFrame — confirmed | placeholder          │ │
│  └─────────────────────────────────────────────────┘ │
│                                                     │
│  Pad Thai                      [chevron ↑]          │
│  Playfair 19px                                      │
│  520 cal  (19px semibold, terracotta)               │
│                                                     │
│  ┌──────────┬──────────┬──────────┬──────────┐      │
│  │ PROTEIN  │  CARBS   │   FAT    │  FIBRE   │      │
│  │  12g     │  48g     │  14g     │   —      │      │
│  └──────────┴──────────┴──────────┴──────────┘      │
│                                                     │
│  Ingredients                                        │
│  • Rice noodles                                     │
│  • Egg                                              │
│  • Bean sprouts                                     │
│  • Tamarind sauce          (up to 5 shown)          │
│                                                     │
│  ╔═══════════════════════════════════════════════╗  │
│  ║         + Add to My Recipes                  ║  │
│  ╚═══════════════════════════════════════════════╝  │
└─────────────────────────────────────────────────────┘
```

**Surface:**
```css
background: var(--glass-elevated)            /* rgba(255,253,249,0.94) */
backdrop-filter: var(--blur-elevated)        /* blur(32px) saturate(1.5) brightness(1.03) */
-webkit-backdrop-filter: var(--blur-elevated)
border: var(--border-glass)                  /* 1px solid rgba(180,170,158,0.22) */
border-radius: 20px
box-shadow: var(--shadow-float)              /* use CSS var; check globals.css */
```

**Hero photo:**
```tsx
<PhotoFrame
  photoStatus={recipe.photoStatus}
  dishImageUrl={recipe.dishImageUrl}
  dishName={recipe.name}
  className="w-full rounded-t-[20px] overflow-hidden"
  style={{ height: 156 }}
/>
```
Note: the photo is the TOP of the card; the text content is below it. `rounded-t-[20px]` matches the card's top radius.

**Dish name:** `var(--font-display)` (Playfair Display), 19px, `--color-text-primary`

**Calorie count:** 19px semibold, `var(--color-accent)` (#C4622D); `{n} cal`

**MacroBar:** See component spec below. Pass `totalFibre={null}` at Phase 1.

**Ingredient highlights:**
- Show up to 5 ingredients from `expandedRecipe?.ingredients ?? []`
- Each ingredient: `• {ingredient.name}` (bullet prefix, 14px, `--color-text-secondary`)
- If `expandedRecipe` is null (loading), show 3 skeleton lines (muted rounded divs, `animate-pulse`)
- If `expandedRecipe` exists but has 0 ingredients, omit the section entirely (no empty state text)
- If > 5 ingredients, show "+N more" in tertiary colour (e.g. "+3 more")

**Chevron (collapse trigger):**
```tsx
<button
  onClick={onCollapse}
  aria-label="Collapse"
  style={{ transform: "rotate(180deg)" }}  // already "expanded" — points up
>
  <ChevronDownIcon />
</button>
```
Sits in the header row beside the dish name. On reduced motion: no rotation animation.

**"Add to My Recipes" CTA:**
```tsx
<button
  onClick={onAddToRecipes}
  style={{
    height: 42,
    background: "var(--color-accent)",
    color: "#fff",
    borderRadius: 9999,
  }}
  className="w-full font-semibold text-[15px]"
>
  + Add to My Recipes
</button>
```
The handler is a no-op stub at this story — actual save logic is Story 5-1. Pass `onAddToRecipes={() => {}}` from the parent for now. Add a `// TODO: Story 5-1 — implement save logic` comment on the no-op.

**ARIA:**
```html
<section
  role="region"
  aria-label="{recipe.name} details"
>
```

---

### 2. `src/components/ui/MacroBar.tsx`

Four equal-width display cells: Protein / Carbs / Fat / Fibre.

#### Component Interface

```typescript
interface MacroBarProps {
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fibreG: number | null
  className?: string
}
```

#### Visual Specification (UX-DR10)

```
┌──────────────────────────────────────────────────────┐
│  PROTEIN   │   CARBS   │    FAT    │   FIBRE          │
│  12g       │   48g     │   14g     │    —             │
└──────────────────────────────────────────────────────┘
```

**Cell layout:**
- 4 equal-width flex cells (`flex-1`)
- Uppercase label: 9px, semibold, `--color-text-tertiary`
- Value: 14px, semibold, `--color-text-primary`
- `null` value → render `"—"` (em dash), same font/color as a real value

**Dividers between cells:**
```css
border-right: 1px solid rgba(180,170,158,0.14);
/* last cell: no border-right */
```

**Container surface:**
```css
background: rgba(244,242,238,0.5)
border-radius: 11px
border: var(--border-glass)            /* 1px solid rgba(180,170,158,0.22) */
padding: 10px 0
```

**Display-only:** No `role="button"`, no `onClick`, no `tabIndex`. Pure data display.

```tsx
export function MacroBar({ proteinG, carbsG, fatG, fibreG, className }: MacroBarProps) {
  const cells = [
    { label: "PROTEIN", value: proteinG },
    { label: "CARBS",   value: carbsG },
    { label: "FAT",     value: fatG },
    { label: "FIBRE",   value: fibreG },
  ]

  return (
    <div className={`flex ${className ?? ""}`} style={{...}}>
      {cells.map((cell, i) => (
        <div key={cell.label} className="flex-1 flex flex-col items-center py-2.5">
          <span style={{ fontSize: 9, textTransform: "uppercase", fontWeight: 600, color: "var(--color-text-tertiary)" }}>
            {cell.label}
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", marginTop: 2 }}>
            {cell.value != null ? `${Math.round(cell.value)}g` : "—"}
          </span>
        </div>
      ))}
    </div>
  )
}
```

---

## RestaurantScreen Integration

### What needs to change

`RestaurantScreen.tsx` currently renders dishes as a `RecipeCard` 2-column grid using the local `SavedRecipe` merged type.

Story 2-5 converts the **Supabase-backed** dish list to a single-column accordion using `DishRowCompact` + `DishRowExpanded`. Session-only recipes (not yet saved to Supabase) continue to render as `RecipeCard` temporarily — they disappear quickly once `autoSaveToSupabase` completes and the query re-fetches.

### New state

```typescript
// Single expanded dish ID — null means all rows are collapsed
const [expandedDishId, setExpandedDishId] = useState<string | null>(null)

// useRecipe lazy-loads ingredients when a dish is first expanded
const { data: expandedRecipe } = useRecipe(expandedDishId)
```

Import `useRecipe` from `@/hooks/useRecipes` — it already exists and fetches the recipe with `recipe_ingredients`.

### Accordion list rendering

Replace the existing `recipes.map(...)` grid block for Supabase recipes with:

```tsx
{/* Supabase-backed dish list: single-column accordion */}
{supabaseRecipeRows && supabaseRecipeRows.length > 0 && (
  <motion.div variants={containerVariants} className="px-4 pb-4 flex flex-col gap-2">
    {supabaseRecipeRows.map((recipe) => (
      <motion.div key={recipe.id} variants={itemVariants}>
        <DishRowCompact
          recipe={recipe}
          totalProtein={null}   // TODO: Story 2.6 wires enrichment totals
          totalCarbs={null}
          totalFat={null}
          isExpanded={expandedDishId === recipe.id}
          onToggle={() =>
            setExpandedDishId((prev) => (prev === recipe.id ? null : recipe.id))
          }
        />
        <AnimatePresence initial={false}>
          {expandedDishId === recipe.id && (
            <motion.div
              key="expanded"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1, transition: reducedMotion
                ? { duration: 0.15 }
                : SPRING_CARD_EXPAND
              }}
              exit={{ height: 0, opacity: 0, transition: { duration: 0.15 } }}
              style={{ overflow: "hidden" }}
            >
              <div className="mt-1.5">
                <DishRowExpanded
                  recipe={recipe}
                  expandedRecipe={expandedRecipe?.id === recipe.id ? expandedRecipe : null}
                  totalProtein={null}
                  totalCarbs={null}
                  totalFat={null}
                  totalFibre={null}
                  onCollapse={() => setExpandedDishId(null)}
                  onAddToRecipes={() => {}} // TODO: Story 5-1
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    ))}
  </motion.div>
)}

{/* Session-only recipes (not yet in Supabase): keep existing RecipeCard grid */}
{sessionOnlyRecipes.length > 0 && (
  <motion.div
    variants={containerVariants}
    className="px-4 pb-4 grid gap-3 grid-cols-2"
  >
    {sessionOnlyRecipes.map((recipe, i) => (
      <motion.div key={`${recipe.scanKey}-${recipe.dishIndex}-${i}`} variants={itemVariants}>
        <RecipeCard
          recipe={recipe}
          onTap={() => router.push(`/recipe/${recipe.scanKey}?dish=${recipe.dishIndex}`)}
          onDelete={() => setConfirmRecipe(recipe)}
        />
      </motion.div>
    ))}
  </motion.div>
)}
```

**Important:** `supabaseRecipeRows` is the raw `DomainRecipe[]` from `useRecipesByRestaurant`. Use it directly for the accordion list — do NOT go through the merged `recipes` array (which uses `SavedRecipe` type and is incompatible with `DishRowCompact`).

**`reducedMotion` pattern:**
```typescript
const reducedMotion = useReducedMotion()
```
Import `useReducedMotion` from `framer-motion`. Already used in `DishRowCompact` — same pattern here in the parent.

**Imports to add to RestaurantScreen:**
```typescript
import { useReducedMotion } from "framer-motion"
import { DishRowCompact } from "@/components/scan/DishRowCompact"
import { DishRowExpanded } from "@/components/scan/DishRowExpanded"
import { useRecipe } from "@/hooks/useRecipes"
import { SPRING_CARD_EXPAND } from "@/lib/springs"
```

---

## Data Flow: Ingredients & Macro Totals

### Where macro totals come from

**Phase 1 (this story):** Pass `null` for all macro totals. Both `DishRowCompact` and `DishRowExpanded` gracefully handle null — compact hides the macro chips, expanded shows "—" in MacroBar cells.

**Phase 2 (Story 2.6):** The enrichment pipeline writes ingredients to `recipe_ingredients` in Supabase. After enrichment completes, the parent should compute totals from `recipe.ingredients` (available via `useRecipe(id)`):

```typescript
// Future: compute from expandedRecipe.ingredients
const totalProtein = expandedRecipe?.ingredients
  ?.reduce((sum, i) => sum + (i.proteinG ?? 0), 0) ?? null
```

Do NOT implement this computation in Story 2-5 — leave all totals as `null` and document with `// TODO: Story 2.6 wires enrichment`.

### Where ingredients come from

`useRecipe(expandedDishId)` already fetches `recipe_ingredients` from Supabase (two parallel queries: recipe row + ingredient rows). This is the correct hook — no new fetch logic needed.

The expanded recipe is available as `expandedRecipe` via `useRecipe(expandedDishId)`. It is `undefined` while fetching and a full `DomainRecipe` (with `ingredients` array) once resolved.

### Fibre

`DomainIngredient` and `recipe_ingredients` do not have a `fibre_g` column. Pass `totalFibre={null}` always. `MacroBar` renders "—" for the fibre cell. A future story (Phase 2+) will add fibre data.

---

## Architecture Guardrails

- **`"use client"` required** — both `DishRowExpanded` and `MacroBar` use `useReducedMotion()` or are rendered inside client components. Mark them `"use client"`.
- **No Supabase imports in components** — `DishRowExpanded` and `MacroBar` are pure UI components. All data fetching happens in the parent (`RestaurantScreen` or a hook).
- **No `@/lib/api-keys` imports** — server-only module; importing in a client component causes a build error.
- **Import `SPRING_CARD_EXPAND` from `@/lib/springs`** — do NOT redefine spring constants.
- **`useReducedMotion()` from `framer-motion`** — returns `boolean | null`; treat `null` as `false` (motion allowed).
- **Chevron rotation** — a CSS `transform: rotate()` with a framer-motion transition, OR just use `style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}` with a CSS transition. On reduced motion: skip the transition, just apply the final transform.
- **`AnimatePresence` required** for expand/collapse** — the `height: 0 → auto` animation requires the child to be unmounted on collapse; `AnimatePresence` handles exit animations correctly.
- **Glass tokens via CSS custom properties** — use inline styles (`style={{ background: "var(--glass-elevated)" }}`) or Tailwind arbitrary values (`bg-[var(--glass-elevated)]`). Do NOT hardcode rgba values.

---

## Tests Required

### DishRowExpanded — `src/components/scan/DishRowExpanded.test.tsx`

Follow the exact same test setup pattern as `DishRowCompact.test.tsx` (co-located, Vitest + RTL).

```typescript
import { vi, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DishRowExpanded } from './DishRowExpanded'
import type { DomainRecipe } from '@/types/database'

const baseRecipe: DomainRecipe = {
  id: 'recipe-1',
  restaurantId: 'rest-1',
  visitId: null,
  name: 'Pad Thai',
  description: 'Classic Thai noodles',
  dishImageUrl: null,
  estimatedCalories: 520,
  status: 'auto_captured',
  photoStatus: 'placeholder',
  geminiConfidence: 0.9,
  dishRating: null,
  dishReviewSnippet: null,
  createdAt: new Date().toISOString(),
}

const recipeWithIngredients: DomainRecipe = {
  ...baseRecipe,
  ingredients: [
    { id: 'i1', recipeId: 'recipe-1', name: 'Rice noodles', quantity: '150', unit: 'g',
      usdaFdcId: null, caloriesPerServing: null, proteinG: 3, fatG: 0.5, carbsG: 35, confidence: 'high' },
    { id: 'i2', recipeId: 'recipe-1', name: 'Egg', quantity: '1', unit: null,
      usdaFdcId: null, caloriesPerServing: null, proteinG: 6, fatG: 5, carbsG: 0.5, confidence: 'high' },
    { id: 'i3', recipeId: 'recipe-1', name: 'Bean sprouts', quantity: '50', unit: 'g',
      usdaFdcId: null, caloriesPerServing: null, proteinG: 1, fatG: 0.1, carbsG: 2, confidence: 'medium' },
  ],
}
```

**Required test cases:**

```
describe('DishRowExpanded')
  ├── rendering
  │   ├── renders dish name in display font
  │   ├── renders calorie count in terracotta
  │   ├── renders MacroBar
  │   ├── renders "Add to My Recipes" button
  │   └── has role="region" and aria-label with dish name
  ├── ingredient list
  │   ├── renders up to 5 ingredients from expandedRecipe
  │   ├── shows skeleton when expandedRecipe is null
  │   ├── shows "+N more" when > 5 ingredients
  │   └── hides ingredient section when expandedRecipe has 0 ingredients
  ├── interaction
  │   ├── calls onCollapse when collapse button clicked
  │   └── calls onAddToRecipes when CTA clicked
  └── reduced motion (mock useReducedMotion to return true)
      └── no animation class applied (expansion is immediate)
```

### MacroBar — `src/components/ui/MacroBar.test.tsx`

```
describe('MacroBar')
  ├── renders 4 cells (Protein, Carbs, Fat, Fibre)
  ├── shows rounded gram values (Math.round applied)
  ├── shows "—" for null values (all four cells individually)
  ├── cell labels are uppercase
  └── does not have role="button" (display-only, not interactive)
```

### Mocking `useReducedMotion`

Use the existing framer-motion mock at `src/test/mocks/framer-motion.tsx` if it covers `useReducedMotion`. Check the mock — if `useReducedMotion` is not mocked there, add it:

```typescript
// In your test file, at the top:
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>()
  return {
    ...actual,
    useReducedMotion: () => false, // or true in reduced-motion tests
  }
})
```

---

## File Scope

### Files to create

| File | Notes |
|------|-------|
| `src/components/scan/DishRowExpanded.tsx` | New component — expanded in-place dish view |
| `src/components/scan/DishRowExpanded.test.tsx` | Co-located tests |
| `src/components/ui/MacroBar.tsx` | New component — 4-cell macro display |
| `src/components/ui/MacroBar.test.tsx` | Co-located tests |

### Files to modify

| File | Change |
|------|--------|
| `src/components/screens/RestaurantScreen.tsx` | Add accordion state + integrate `DishRowCompact`/`DishRowExpanded` for Supabase-backed recipes |

### Files NOT to touch

| File | Reason |
|------|--------|
| `src/components/scan/DishRowCompact.tsx` | Already complete (Story 2-4). Do not modify. |
| `src/components/scan/DishRowCompact.test.tsx` | Do not modify. |
| `src/components/ui/PhotoFrame.tsx` | Reuse as-is. |
| `src/lib/springs.ts` | Import only; do not add or change constants. |
| `src/types/database.ts` | No new columns or types needed. |
| Any API route | This story is UI-only. |
| `src/hooks/useRecipes.ts` | Hook already has `useRecipe(id)` — no changes needed. |

---

## Key Context: What Story 2-4 Established

Story 2-4 created `DishRowCompact`:
- Located at `src/components/scan/DishRowCompact.tsx` — 146 lines, fully implemented
- Props: `recipe`, `totalProtein/Carbs/Fat` (null-safe), `isExpanded`, `onToggle`
- Already has `aria-expanded`, `role="button"`, keyboard support
- Returns `null` for `recipe.photoStatus === "suppressed"`
- The `onToggle` prop is wired — no changes needed to this component

Story 2-5 (this story) adds the **expanded content** that appears when `isExpanded` is true. The compact row and the expanded panel are siblings in the DOM, managed by the parent's `expandedDishId` state.

---

## Relevant Previous Story Context

### From Story 1.3 — Visual Design System
- `--glass-elevated: rgba(255,253,249,0.94)` — higher opacity than `--glass-base`
- `--blur-elevated: blur(32px) saturate(1.5) brightness(1.03)` — stronger than `--blur-base`
- `--shadow-float` — CSS variable for elevated surface shadow; verify name in `src/app/globals.css`
- `--font-display` — Playfair Display; use for dish name in expanded view
- `--color-accent: #C4622D` — terracotta; use for calorie display and CTA button

### From Story 1.5 — Animation System
- `SPRING_CARD_EXPAND` is defined and documented at `src/lib/springs.ts:22`
- The file contains detailed usage comments including the reduced-motion pattern

### From Story 2-4 — DishRowCompact
- `DishRowCompact` has `isExpanded` and `onToggle` props — they were designed for this story
- The parent manages a single `expandedDishId: string | null` value
- The compact row does NOT manage expanded state internally

---

## Definition of Done

- [x] `src/components/scan/DishRowExpanded.tsx` created
- [x] `src/components/ui/MacroBar.tsx` created
- [x] `DishRowExpanded` renders hero photo (156px), dish name (Playfair 19px), calories (terracotta), `MacroBar`, ingredient list (up to 5), CTA pill
- [x] `MacroBar` shows 4 cells (P/C/F/Fibre); null → "—"; display-only (no interactivity)
- [x] Ingredient list: shows skeleton when `expandedRecipe` is null; up to 5 items + "+N more"; omitted when 0 ingredients
- [x] `RestaurantScreen` updated: `expandedDishId` state; single-open accordion; `useRecipe(expandedDishId)` for lazy ingredient load
- [x] Expand/collapse uses `SPRING_CARD_EXPAND`; `AnimatePresence` wraps the expanded panel
- [x] Only one dish expanded at a time
- [x] `DishRowExpanded` has `role="region"` + `aria-label="[Dish name] details"`
- [x] `prefers-reduced-motion: reduce` → expansion immediate, no spring
- [x] Tests for `DishRowExpanded` and `MacroBar` cover all required cases
- [x] All tests pass (`vitest run`)
- [x] TypeScript strict mode passes (`tsc --noEmit`) — source files clean; pre-existing test-file errors are unrelated
- [x] No regression to `DishRowCompact`, `PhotoFrame`, or `DishCard`

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — clean implementation with no blocking issues.

### Completion Notes

Implemented Story 2-5 in full. Key decisions:

- **`MacroBar`**: Pure display component with 4 fixed cells (PROTEIN/CARBS/FAT/FIBRE). Uses `MACRO_CELLS` const array to map prop keys to labels and avoid repetition. Null values render as "—". No interactivity.

- **`DishRowExpanded`**: Uses `useReducedMotion()` to set `transition: "none"` on the collapse chevron when reduced motion is active. The 156px hero photo is handled via a wrapper `<div style={{ height: 156 }}>` since `PhotoFrame` has no `style` prop — the parent section's `overflow: hidden` + `borderRadius: 20` clips the photo top corners. Ingredient loading is distinguished from "0 ingredients" by checking `expandedRecipe === null` (loading) vs. `expandedRecipe.ingredients.length === 0` (omit section).

- **`RestaurantScreen`**: Added `expandedDishId` state + `useRecipe(expandedDishId)` for lazy ingredient fetching. The accordion wraps Supabase-backed rows (`supabaseRecipeRows`) while session-only rows continue to use the `RecipeCard` 2-column grid. The menu photo thumbnail is now outside the grid, rendered when `recipes.length > 0 && menuPhotoUrl`.

- **JSX comment** syntax: moved TODO comment for macro totals outside the JSX props block (JSX comments can't appear inline between props).

All 22 new tests pass; 214 total (no regressions). TypeScript strict mode passes for all source files (pre-existing test-file TS errors are unrelated to this story).

### File List

| File | Action |
|------|--------|
| `src/components/ui/MacroBar.tsx` | Created |
| `src/components/ui/MacroBar.test.tsx` | Created |
| `src/components/scan/DishRowExpanded.tsx` | Created |
| `src/components/scan/DishRowExpanded.test.tsx` | Created |
| `src/components/screens/RestaurantScreen.tsx` | Modified |
| `planning/sprint-status.yaml` | Modified |
| `planning/2-5-dish-row-expansion-ingredient-list.md` | Modified |

## Change Log

- 2026-04-12: Story 2-5 implemented — `MacroBar`, `DishRowExpanded`, `RestaurantScreen` accordion integration. 22 new tests. Status: review.
