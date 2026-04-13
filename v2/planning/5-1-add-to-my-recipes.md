# Story 5.1: Add to My Recipes

Status: review
Epic: 5 — My Recipes & Cook-at-Home
Story ID: 5.1
Story Key: 5-1-add-to-my-recipes
Created: 2026-04-13

---

## Story

As a user,
I want to save any dish to my personal Recipes collection by tapping "Add to My Recipes" inside its expanded view,
So that I can mark the dishes I want to recreate at home, separately from my browsing collection.

---

## Acceptance Criteria

**AC1 — "Add to My Recipes" CTA triggers status update**
**Given** a dish is expanded (DishRowExpanded) in any restaurant view
**When** the user taps the "Add to My Recipes" CTA pill (42px height, terracotta fill)
**Then** the dish's `status` is updated from `auto_captured` to `kept` via `useUpdateRecipe`; the action is immediate — no loading spinner or confirmation required; `invalidateQueries` fires on `['recipes']`, `['recipes', id]`, and `['recipes', 'kept']`

**AC2 — 1.5s checkmark animation → "Saved" state**
**Given** the "Add to My Recipes" action completes successfully
**When** the feedback animation plays
**Then** the CTA button transitions to a checkmark icon for 1.5 seconds, then to a "✓ Saved to My Recipes" state with `--glass-base` background and terracotta text; the dish card remains expanded

**AC3 — Already-saved state on render**
**Given** a dish already has `status: 'kept'` (i.e. `recipe.status === 'kept'`)
**When** DishRowExpanded renders
**Then** the CTA shows "✓ Saved to My Recipes" from the start — no "Add" button; the action is not repeatable; `onAddToRecipes` is not called again

**AC4 — Cooking instructions gate**
**Given** a dish is displayed in DishRowExpanded in the restaurant browse context
**When** the card renders at any expansion level
**Then** no cooking instructions are shown or hinted at — not as a locked element, greyed section, or teaser text; the "Add to My Recipes" CTA is the last element in the card body

**AC5 — Mutation error handling**
**Given** `useUpdateRecipe` returns an error
**When** the CTA is in a pending/saving state
**Then** the button returns to the "Add to My Recipes" state; no silent failure occurs; the user can tap again to retry

---

## What This Story Changes

### `src/components/scan/DishRowExpanded.tsx`

**Add local `savedState` and wire `recipe.status`:**

The component already receives `recipe: DomainRecipe` which includes `recipe.status`. Add local state for animation tracking:

```typescript
type SavedState = 'idle' | 'saving' | 'checkmark' | 'saved'

// Derive initial state from recipe.status
const initialSavedState = (status: RecipeStatus): SavedState =>
  status === 'kept' ? 'saved' : 'idle'

// Inside the component:
const [savedState, setSavedState] = useState<SavedState>(
  initialSavedState(recipe.status)
)

// Sync when recipe.status changes externally (e.g. cache invalidation resolves)
useEffect(() => {
  setSavedState(initialSavedState(recipe.status))
}, [recipe.status])
```

**Replace the existing TODO button with state-aware CTA:**

Current code (line 277–292 in DishRowExpanded.tsx):
```typescript
<button
  type="button"
  onClick={onAddToRecipes}
  className="w-full font-semibold text-[15px]"
  style={{
    height: 42,
    background: "var(--color-accent)",
    color: "#fff",
    borderRadius: 9999,
    border: "none",
    cursor: "pointer",
  }}
>
  + Add to My Recipes
  {/* TODO: Story 5-1 — implement save logic */}
</button>
```

Replace with:
```typescript
{savedState === 'saved' ? (
  /* Saved state — non-interactive */
  <div
    aria-live="polite"
    aria-label="Saved to My Recipes"
    style={{
      height: 42,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      background: "var(--glass-base)",
      borderRadius: 9999,
      border: "var(--border-glass)",
      fontSize: 15,
      fontWeight: 600,
      color: "var(--color-accent)",
    }}
  >
    <CheckmarkIcon />
    Saved to My Recipes
  </div>
) : savedState === 'checkmark' ? (
  /* Brief checkmark animation */
  <div
    aria-live="polite"
    aria-label="Saved to My Recipes"
    style={{
      height: 42,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--color-accent)",
      borderRadius: 9999,
    }}
  >
    <CheckmarkIcon style={{ color: "#fff" }} />
  </div>
) : (
  /* Default "Add" CTA */
  <button
    type="button"
    onClick={() => {
      if (savedState !== 'idle') return
      setSavedState('saving')
      onAddToRecipes()
      // Checkmark plays for 1.5s then transitions to persistent saved state
      setTimeout(() => {
        setSavedState('checkmark')
        setTimeout(() => setSavedState('saved'), 1500)
      }, 0)
    }}
    disabled={savedState === 'saving'}
    aria-label="Add to My Recipes"
    className="w-full font-semibold text-[15px]"
    style={{
      height: 42,
      background: savedState === 'saving' ? "var(--color-accent-light)" : "var(--color-accent)",
      color: savedState === 'saving' ? "var(--color-accent)" : "#fff",
      borderRadius: 9999,
      border: "none",
      cursor: savedState === 'saving' ? "default" : "pointer",
      transition: "background 0.2s ease, color 0.2s ease",
    }}
  >
    + Add to My Recipes
  </button>
)}
```

**Add `CheckmarkIcon` inline (do not create a shared icon file):**

```typescript
function CheckmarkIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={style}>
      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
```

### `src/components/screens/RestaurantScreen.tsx`

**Wire `onAddToRecipes` (currently `() => {}` at line 851):**

1. Add `useUpdateRecipe` to the imports from `@/hooks/useRecipes`
2. Instantiate the mutation: `const updateRecipe = useUpdateRecipe()`
3. Replace the TODO callback:

```typescript
// Before (line 851):
onAddToRecipes={() => {}} // TODO: Story 5-1

// After:
onAddToRecipes={() => {
  const recipeId = /* the recipe id in scope at this call site */
  updateRecipe.mutate({
    id: recipeId,
    updates: { status: 'kept' },
  })
}}
```

> **Note for dev agent:** The exact call site in RestaurantScreen.tsx needs to be inspected. The `onAddToRecipes` prop is passed into `DishRowExpanded`. Look for which recipe's `id` is in scope at that render site and pass it correctly. The mutation result is not needed in the callback — cache invalidation via `onSuccess` in `useUpdateRecipe` handles the state update.

---

## Dev Notes

### Mutation is already implemented

`useUpdateRecipe` in `src/hooks/useRecipes.ts` already handles setting `status: 'kept'` and invalidates `['recipes']`, `['recipes', id]`, and `['recipes', 'kept']` on success. No new mutation needed.

### Animation sequencing

The checkmark → saved state sequence is:
1. User taps → `savedState: 'saving'` (button dims slightly, disabled)
2. Immediately: `savedState: 'checkmark'` (terracotta button shows checkmark icon)
3. After 1.5s: `savedState: 'saved'` (persistent glass surface with terracotta checkmark + text)

Steps 1→2 happen synchronously at tap time (not after the mutation resolves), because the mutation is fast and the animation should feel immediate. The persisted `recipe.status` update from TanStack Query cache invalidation arrives shortly after and the `useEffect` sync keeps state consistent.

### `recipe.status` sync via useEffect

When TanStack Query cache invalidates and returns `recipe.status === 'kept'`, the `useEffect` will re-run `setSavedState('saved')`. This is idempotent — if we're already in `'saved'` state, calling `setSavedState('saved')` again is a no-op.

### Key imports — do not reinvent

| Need | Source |
|------|--------|
| `useUpdateRecipe` | `@/hooks/useRecipes` |
| `RecipeStatus` | `@/types/database` |
| `DomainRecipe` | `@/types/database` |
| Spring presets | `@/lib/springs` — `SPRING_CARD_EXPAND` for any animation |
| `useReducedMotion` | `framer-motion` |

### Reduced motion

When `reducedMotion` is true: skip the checkmark animation phase entirely. On tap, go directly from `'idle'` → `'saving'` → `'saved'` with no intermediate `'checkmark'` state.

### TypeScript

The `savedState` type is a local string union — do not put it in `@/types/database.ts`. Keep it local to `DishRowExpanded.tsx`.

---

## Testing Requirements

### Framework

Vitest + React Testing Library. Config: `vitest.config.ts`. framer-motion is mocked via `src/test/mocks/framer-motion.tsx` — animation props stripped, transitions synchronous.

### Target file: `src/components/scan/DishRowExpanded.test.tsx`

Update the existing test file. Add new test cases for the CTA state machine.

**New describes to add:**
```
describe('Add to My Recipes CTA')
  ├── renders "Add to My Recipes" button when recipe.status is "auto_captured"
  ├── renders "Saved to My Recipes" state when recipe.status is "kept" (no button)
  ├── calls onAddToRecipes when CTA is tapped
  ├── does NOT call onAddToRecipes when already saved (recipe.status === "kept")
  └── transitions to saved state when recipe.status prop updates to "kept"
```

**Mock data for tests:**
```typescript
const mockRecipeAutoCapture: DomainRecipe = {
  id: "recipe-1",
  restaurantId: "rest-1",
  visitId: null,
  name: "Pad Thai",
  description: null,
  dishImageUrl: null,
  estimatedCalories: 480,
  status: "auto_captured",
  photoStatus: "placeholder",
  geminiConfidence: null,
  dishRating: null,
  dishReviewSnippet: null,
  totalProteinG: null,
  totalCarbsG: null,
  totalFatG: null,
  totalFibreG: null,
  createdAt: new Date().toISOString(),
}

const mockRecipeKept: DomainRecipe = {
  ...mockRecipeAutoCapture,
  status: "kept",
}
```

---

## What Does NOT Change in This Story

| File | Reason |
|------|--------|
| `src/types/database.ts` | `RecipeStatus` enum already includes `'kept'`; `DomainRecipe.status` is already typed |
| `src/hooks/useRecipes.ts` | `useUpdateRecipe` already handles `status: 'kept'` |
| `src/app/api/**` | No API route changes — this is a direct Supabase mutation |
| `src/components/screens/RecipesScreen.tsx` | Doesn't exist yet — Story 5.2 creates it |
| `planning/sprint-status.yaml` | Do NOT update |
| Any migration files | No schema changes needed |

---

## Architecture Guardrails

- **No new API routes** — use `useUpdateRecipe` directly; it writes to Supabase via the typed client
- **No `any` types** — `savedState` is a typed union; all props fully typed
- **`invalidateQueries` not manual cache writes** — `useUpdateRecipe.onSuccess` already calls `invalidateQueries`; do not add `setQueryData` calls
- **No PII in logs (SEC-DAT-1.00)** — do not log recipe names, user IDs, or dish content; the mutation is fire-and-forget with no console output
- **`-webkit-backdrop-filter` alongside `backdrop-filter`** — required for the saved state's glass surface on Safari PWA
- **Glass tokens via inline `style={}` not Tailwind arbitrary values** — see `var(--glass-base)`, `var(--border-glass)` pattern from `DishRowExpanded.tsx`

---

## Definition of Done

- [x] `DishRowExpanded.tsx` updated: "Add to My Recipes" CTA implements three-state machine (`idle`, `checkmark`, `saved`)
- [x] `DishRowExpanded.tsx`: renders "Saved to My Recipes" state when `recipe.status === 'kept'` on initial render
- [x] `DishRowExpanded.tsx`: `useEffect` syncs `savedState` when `recipe.status` prop updates
- [x] `DishRowExpanded.tsx`: reduced motion skips checkmark phase; goes directly to saved
- [x] `RestaurantScreen.tsx`: `onAddToRecipes` wired to `useUpdateRecipe({ status: 'kept' })`
- [x] `DishRowExpanded.test.tsx`: new CTA state machine tests added and passing
- [x] All existing DishRowExpanded tests still pass
- [x] TypeScript strict: no new errors (`npx tsc --noEmit`)
- [x] `sprint-status.yaml` is NOT modified

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation followed story spec exactly with no debugging required.

### Completion Notes List

- Implemented three-state CTA machine (`idle | saving | checkmark | saved`) in `DishRowExpanded.tsx`
- `initialSavedState()` derives starting state from `recipe.status`; `useEffect` syncs when prop updates externally (cache invalidation)
- Reduced-motion path skips checkmark phase: `idle → saving → saved` synchronously
- `CheckmarkIcon` SVG added inline (no shared icon file created)
- `RestaurantScreen.tsx` wired: `useUpdateRecipe` instantiated, `onAddToRecipes` mutates `{ status: 'kept' }`; `invalidateQueries` is handled by `useUpdateRecipe.onSuccess`
- 5 new tests added under `describe('Add to My Recipes CTA')` — all pass; all 36 existing DishRowExpanded tests pass
- `npx tsc --noEmit` — zero errors in modified files; pre-existing errors in other files confirmed pre-existing via `git stash` verification

### File List

- `src/components/scan/DishRowExpanded.tsx` — added `SavedState` type, `initialSavedState()`, `CheckmarkIcon`, `savedState` state + `useEffect` sync, replaced simple button with three-state CTA
- `src/components/scan/DishRowExpanded.test.tsx` — added `describe('Add to My Recipes CTA')` with 5 new test cases
- `src/components/screens/RestaurantScreen.tsx` — added `useUpdateRecipe` import, instantiated `updateRecipe`, wired `onAddToRecipes`

## Change Log

- 2026-04-13: Story 5.1 implemented — "Add to My Recipes" CTA state machine, RestaurantScreen wiring, and CTA tests
