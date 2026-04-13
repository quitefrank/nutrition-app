# Story 5.3: Recipe Removal

Status: review
Epic: 5 — My Recipes & Cook-at-Home
Story ID: 5.3
Story Key: 5-3-recipe-removal
Created: 2026-04-13

---

## Story

As a user,
I want to remove a dish from My Recipes when I no longer want it,
So that I can keep my personal collection clean and intentional.

---

## Acceptance Criteria

**AC1 — Edit-gated remove controls**
**Given** the user is viewing the Recipes screen
**When** the screen is in its default (non-edit) state
**Then** no remove icon or delete control is visible on any RecipeGridCard; the user cannot accidentally initiate removal

**AC2 — Edit mode toggle**
**Given** the user taps the "Edit" button in the Recipes screen header
**When** edit mode activates
**Then** a remove icon (circle with minus, red tint) appears on each RecipeGridCard overlay; the header button changes to "Done"; no other layout changes occur

**AC3 — 4-step deliberate removal flow**
**Given** the user is in edit mode and taps the remove icon on a recipe card
**When** the first remove tap is registered
**Then** a `BottomSheet` slides up with a confirmation panel; the user must take 3 more deliberate steps to complete the removal (confirming intent twice before the mutation fires); minimum 4 steps total: (1) enter edit mode → (2) tap remove icon → (3) tap "Remove from My Recipes" in bottom sheet → (4) tap "Yes, remove it" destructive confirmation button

**AC4 — Removal sets status to `auto_captured`**
**Given** the user confirms removal through all 4 steps
**When** the operation completes
**Then** `useUpdateRecipe` is called with `{ id: recipeId, updates: { status: 'auto_captured' } }`; the recipe disappears from My Recipes immediately; the cache for `['recipes', 'kept']` is invalidated

> **⚠️ Spec resolution:** The epics.md spec says "status set to `removed`" in AC3 but then says "dish still appears in restaurant's dish list with `status: 'auto_captured'`" in AC4. These are mutually exclusive — setting `removed` hides the dish from restaurant browse (filtered by `neq('status', 'removed')`). The correct implementation is to set status back to `auto_captured`, which returns the dish to the restaurant browse collection. This story resolves the conflict in favour of AC4 (preserving the dish in the restaurant collection). The `useRemoveRecipe()` hook (which sets `removed`) is intended for Story 4.4 (full restaurant removal) and must NOT be used here.

**AC5 — Dish returns to restaurant browse**
**Given** a recipe has been removed from My Recipes
**When** the user browses the originating restaurant
**Then** the dish appears in the restaurant's dish list with `status: 'auto_captured'`; the "Add to My Recipes" CTA in `DishRowExpanded` is available again (not in the "Saved" state)

**AC6 — No row deletion**
**Given** the removal operation completes
**When** the database is queried
**Then** no row is deleted from the `recipes` table; only the `status` column is updated to `auto_captured`

**AC7 — Swipe-to-delete is absent**
**Given** the user swipes on a recipe card in any mode
**When** the gesture is detected
**Then** no delete affordance appears; swipe-to-delete is intentionally absent from this screen

---

## Component Specifications

### Modified File: `src/components/screens/RecipesScreen.tsx`

Add edit mode state and remove icon overlay to the existing RecipesScreen from Story 5.2.

**New state:**

```typescript
const [isEditMode, setIsEditMode] = useState(false)
const [removeCandidate, setRemoveCandidate] = useState<string | null>(null)
const updateRecipe = useUpdateRecipe()
```

**Header update — add Edit/Done button:**

```typescript
{/* Header */}
<div className="px-4 flex items-center justify-between" style={{ paddingTop: ..., paddingBottom: 12 }}>
  <h1 style={{ fontSize: 22, fontWeight: 700, ... }}>My Recipes</h1>
  {recipes && recipes.length > 0 && (
    <button
      type="button"
      onClick={() => {
        setIsEditMode((prev) => !prev)
        setRemoveCandidate(null)
      }}
      style={{
        fontSize: 14,
        fontWeight: 500,
        color: "var(--color-accent)",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: "4px 8px",
        minHeight: 44,
        minWidth: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {isEditMode ? "Done" : "Edit"}
    </button>
  )}
</div>
```

> **Note:** The Edit button only appears when there are recipes to edit (`recipes.length > 0`). Show nothing in the header when the list is empty.

**Grid card wrapper — add remove icon overlay in edit mode:**

```typescript
{recipes.map((recipe) => (
  <div key={recipe.id} role="listitem" style={{ position: "relative" }}>
    <RecipeGridCard
      recipe={recipe}
      onPress={isEditMode ? () => {} : () => router.push(`/recipe/${recipe.id}`)}
    />
    {isEditMode && (
      <button
        type="button"
        aria-label={`Remove ${recipe.name} from My Recipes`}
        onClick={() => setRemoveCandidate(recipe.id)}
        style={{
          position: "absolute",
          top: -8,
          left: -8,
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "rgba(251,234,234,0.97)",
          border: "1.5px solid rgba(185,64,64,0.22)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          zIndex: 10,
          // Touch target extension — invisible padding
          padding: 8,
          margin: -8,
        }}
      >
        <MinusIcon />
      </button>
    )}
  </div>
))}
```

**`MinusIcon` sub-component (inline in RecipesScreen.tsx):**

```typescript
function MinusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="rgba(185,64,64,0.10)" />
      <path d="M8 12h8" stroke="#B94040" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
```

**`BottomSheet` confirmation panel — add below the grid:**

```typescript
<BottomSheet
  isOpen={removeCandidate !== null}
  onClose={() => setRemoveCandidate(null)}
  label="Remove recipe confirmation"
>
  <RemoveConfirmationPanel
    recipeName={recipes?.find(r => r.id === removeCandidate)?.name ?? "this dish"}
    isPending={updateRecipe.isPending}
    onConfirm={() => {
      if (!removeCandidate) return
      updateRecipe.mutate(
        { id: removeCandidate, updates: { status: 'auto_captured' } },
        {
          onSuccess: () => {
            setRemoveCandidate(null)
            setIsEditMode(false)
          },
        }
      )
    }}
    onCancel={() => setRemoveCandidate(null)}
  />
</BottomSheet>
```

**`RemoveConfirmationPanel` sub-component (inline in RecipesScreen.tsx):**

```typescript
interface RemoveConfirmationPanelProps {
  recipeName: string
  isPending: boolean
  onConfirm: () => void
  onCancel: () => void
}

function RemoveConfirmationPanel({ recipeName, isPending, onConfirm, onCancel }: RemoveConfirmationPanelProps) {
  const [confirmed, setConfirmed] = useState(false)

  return (
    <div className="px-4 py-6 flex flex-col gap-4">
      <div>
        <h2 style={{ fontSize: 17, fontWeight: 600, color: "var(--color-text-primary)", marginBottom: 6 }}>
          Remove from My Recipes?
        </h2>
        <p style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.5 }}>
          <strong>{recipeName}</strong> will be removed from My Recipes. You can always add it back from the restaurant.
        </p>
      </div>

      {!confirmed ? (
        /* Step 3: first confirmation */
        <button
          type="button"
          onClick={() => setConfirmed(true)}
          style={{
            height: 50,
            borderRadius: 9999,
            background: "rgba(251,234,234,0.95)",
            color: "#B94040",
            fontSize: 15,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            width: "100%",
          }}
        >
          Remove from My Recipes
        </button>
      ) : (
        /* Step 4: destructive confirmation */
        <button
          type="button"
          onClick={onConfirm}
          disabled={isPending}
          style={{
            height: 50,
            borderRadius: 9999,
            background: isPending ? "rgba(180,170,158,0.12)" : "#B94040",
            color: isPending ? "var(--color-text-tertiary)" : "#fff",
            fontSize: 15,
            fontWeight: 700,
            border: "none",
            cursor: isPending ? "default" : "pointer",
            width: "100%",
          }}
        >
          {isPending ? "Removing…" : "Yes, remove it"}
        </button>
      )}

      <button
        type="button"
        onClick={onCancel}
        disabled={isPending}
        style={{
          height: 44,
          background: "none",
          border: "none",
          cursor: "pointer",
          fontSize: 14,
          color: "var(--color-text-tertiary)",
        }}
      >
        Cancel
      </button>
    </div>
  )
}
```

> **The 4-step count:** (1) Enter edit mode via "Edit" button → (2) Tap the remove icon on a card → (3) Tap "Remove from My Recipes" button in the sheet → (4) Tap "Yes, remove it" destructive button. This matches the epics spec requirement of "at least 4 deliberate steps."

---

## Dev Notes

### Use `useUpdateRecipe`, NOT `useRemoveRecipe`

`useRemoveRecipe` sets `status: 'removed'` which removes the recipe from both My Recipes AND the restaurant browse collection. That is intended for Story 4.4 (restaurant-level removal where all dishes are nuked). Story 5.3 is "un-keep" — returning the dish to the auto-captured browsing collection. Use:

```typescript
updateRecipe.mutate({ id: recipeId, updates: { status: 'auto_captured' } })
```

### `onSuccess` callback on `mutate()`

Pass the callbacks directly on `mutate()`, not in `useMutation` config, because we need to close the sheet and exit edit mode only after this specific mutation succeeds:

```typescript
updateRecipe.mutate(
  { id: removeCandidate, updates: { status: 'auto_captured' } },
  {
    onSuccess: () => {
      setRemoveCandidate(null)
      setIsEditMode(false)
    },
  }
)
```

### `BottomSheet` is already built

`src/components/ui/BottomSheet.tsx` exists with spring animation, focus trap, Escape key handler, and backdrop click handler. It takes `{ isOpen, onClose, children, label }`. Import it — do not recreate it.

### Edit mode interaction with card press

When in edit mode, tapping a RecipeGridCard should NOT navigate to the recipe detail. Pass `onPress={() => {}}` when `isEditMode` is true (making the card a no-op tap target — the remove icon is the only interactive element).

### `RemoveConfirmationPanel` internal state

The panel has its own local `confirmed` state (boolean). This state resets when the sheet is closed because the panel unmounts when `isOpen` becomes false (via `AnimatePresence` in `BottomSheet`).

### Key imports for RecipesScreen.tsx changes

| Need | Source |
|------|--------|
| `useUpdateRecipe` | `@/hooks/useRecipes` |
| `BottomSheet` | `@/components/ui/BottomSheet` |
| `useState` | `react` |

---

## Testing Requirements

### Framework

Vitest + React Testing Library. Update existing `src/components/screens/RecipesScreen.test.tsx`.

**New test cases:**

```
describe('Edit mode and removal flow')
  ├── shows Edit button when recipes exist
  ├── does NOT show Edit button when recipes list is empty
  ├── toggles edit mode — shows remove icons when in edit mode
  ├── hides remove icons when edit mode is toggled off (Done)
  ├── opens BottomSheet when remove icon is tapped
  ├── closes BottomSheet when Cancel is tapped
  ├── shows "Remove from My Recipes" button as step 3
  ├── shows "Yes, remove it" destructive button after step 3 is tapped
  ├── calls useUpdateRecipe with status "auto_captured" when step 4 is confirmed
  └── recipe cards are not navigable while in edit mode (onPress is no-op)
```

**Mock `useUpdateRecipe`:**
```typescript
const mockMutate = vi.fn()
vi.mock('@/hooks/useRecipes', () => ({
  useKeptRecipes: vi.fn(),
  useUpdateRecipe: () => ({ mutate: mockMutate, isPending: false }),
}))
```

---

## What Does NOT Change in This Story

| File | Reason |
|------|--------|
| `src/hooks/useRecipes.ts` | `useUpdateRecipe` already supports `status` updates |
| `src/components/ui/BottomSheet.tsx` | Already built; no changes |
| `src/components/ui/RecipeGridCard.tsx` | No changes to the card component itself |
| `src/app/api/**` | No API routes needed — direct Supabase mutation |
| Any migration files | No schema changes — `status` column and enum already exist |
| `planning/sprint-status.yaml` | Do NOT update |

---

## Architecture Guardrails

- **`useUpdateRecipe` not `useRemoveRecipe`** for My Recipes removal — see spec resolution note in AC4
- **4-step minimum** — no shortcuts; the `RemoveConfirmationPanel` must require two taps to confirm
- **No swipe-to-delete** — explicitly absent from spec (UX-DR22: "no swipe-to-delete on recipe cards — too easy, creates accidental deletion")
- **`invalidateQueries` via `useUpdateRecipe.onSuccess`** — already fires on `['recipes']`, `['recipes', id]`, and `['recipes', 'kept']`; no manual cache writes
- **No PII in logs** — recipe names are displayed in UI but never written to logs
- **TypeScript strict** — `removeCandidate` is `string | null`; all mutation types inferred from `useUpdateRecipe`

---

## Definition of Done

- [ ] `RecipesScreen.tsx` updated: "Edit" button visible when recipes > 0
- [ ] Edit mode toggle shows/hides remove icons on each card
- [ ] Remove icon tap opens `BottomSheet` with confirmation panel
- [ ] 4-step flow: edit mode → remove icon → "Remove from My Recipes" → "Yes, remove it"
- [ ] Confirmed removal calls `useUpdateRecipe({ status: 'auto_captured' })`; recipe disappears from My Recipes
- [ ] No rows deleted from database — only `status` column updated
- [ ] `RecipesScreen.test.tsx` updated with removal flow tests; all pass
- [ ] TypeScript strict: no new errors
- [ ] `planning/sprint-status.yaml` is NOT modified

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

No blockers or debug sessions required. Implementation was straightforward following the spec.

### Completion Notes List

- Updated `RecipesScreen.tsx`: added `isEditMode` + `removeCandidate` state, Edit/Done header button (only when recipes > 0), remove icon overlay per card in edit mode, `MinusIcon` SVG sub-component, `RemoveConfirmationPanel` with 2-stage confirm (`confirmed` local state), `BottomSheet` wired to `useUpdateRecipe` with `status: 'auto_captured'`.
- `useUpdateRecipe` (not `useRemoveRecipe`) used per spec — returns dish to restaurant browse collection.
- `onSuccess` callback passed directly on `mutate()` to close sheet and exit edit mode only on success.
- `RemoveConfirmationPanel` internal `confirmed` state resets on unmount (when sheet closes) via `AnimatePresence`.
- Card `onPress` is a no-op `() => {}` in edit mode — navigation intentionally disabled.
- 10 new tests added for edit mode and removal flow; 24 total tests pass; 47 test files / 601 tests total — zero regressions.

### File List

- src/components/screens/RecipesScreen.tsx (modified)
- src/components/screens/RecipesScreen.test.tsx (modified)
