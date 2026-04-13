# Story 5.4: Cooking Instructions Gate

Status: review
Epic: 5 — My Recipes & Cook-at-Home
Story ID: 5.4
Story Key: 5-4-cooking-instructions-gate
Created: 2026-04-13

---

## Story

As a user,
I want cooking instructions to be available only for dishes I've saved to My Recipes — never visible while I'm browsing a restaurant,
So that the browse experience stays focused on deciding what to order, not how to cook it.

---

## Acceptance Criteria

**AC1 — No cooking instructions in restaurant browse**
**Given** a dish is displayed anywhere in the restaurant browse view (compact or expanded)
**When** the `DishRowExpanded` card renders at any expansion level from `RestaurantScreen.tsx`
**Then** no cooking instructions are shown or hinted at — not as a locked element, greyed-out section, teaser text, or "unlock when saved" prompt; the card body ends with the "Add to My Recipes" CTA

**AC2 — "How to make it" placeholder in My Recipes detail**
**Given** a dish has `status: 'kept'` and is viewed via its recipe detail page (`/recipe/[id]`)
**When** the recipe detail renders
**Then** a "How to make it" section is present as a clearly-labelled placeholder slot below the ingredients; it indicates that cooking instructions will be available here (e.g. a dashed-border empty state with the label "Cooking instructions coming soon"); the slot is structurally present and styled but contains no real content at this stage

**AC3 — Gate is context-driven, not prop-driven**
**Given** a dish with `status: 'auto_captured'` is expanded in `RestaurantScreen`
**When** the "Add to My Recipes" CTA is tapped and status becomes `'kept'`
**Then** cooking instructions still do NOT appear in the restaurant browse view — the gate is enforced by which component renders the card: `DishRowExpanded` structurally has no cooking slot, so the gate cannot be bypassed by passing a prop like `showCookingSlot`; the `status === 'kept'` check that reveals the slot lives in `/recipe/[id]/page.tsx`, which is the only rendering context where cooking instructions are appropriate

**AC4 — Growth story structural readiness**
**Given** the cooking instructions gate is implemented
**When** a developer adds cooking instruction content in a future Growth story (G.1)
**Then** the gating logic does not need to change — the "How to make it" content slot already exists in the My Recipes detail view; the Growth story only fills the slot with real content

---

## What This Story Changes

### No changes to `DishRowExpanded.tsx`

`DishRowExpanded` is the restaurant browse component. It currently ends with the "Add to My Recipes" CTA (after Story 5.1). It does NOT render any cooking instructions at any point — this is already the correct state after Story 5.1. **No changes are needed to `DishRowExpanded.tsx` in this story.**

This is by design: the cooking instructions gate is enforced structurally — `DishRowExpanded` simply never contains a cooking instructions slot. Adding a conditional `showCookingSlot` prop would be the wrong approach; it pollutes the restaurant browse component with My Recipes concerns.

### Modified File: `src/app/recipe/[id]/page.tsx`

The existing recipe detail page at `/recipe/[id]` is used for all recipe detail views, including My Recipes dishes accessed from the Recipes tab.

**Add "How to make it" section below the ingredients list, gated to `status === 'kept'`:**

```typescript
// After the existing ingredients section (around line 510 in the file):
{/* Cooking instructions gate — Story 5.4 */}
{idIsUUID && supabaseRecipe?.status === 'kept' && (
  <motion.div variants={itemVariants} className="px-4 pb-4">
    <div className="flex items-center justify-between mb-3">
      <h2
        className="text-xs font-semibold uppercase tracking-widest"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        How to Make It
      </h2>
    </div>
    <CookingInstructionsPlaceholder />
  </motion.div>
)}
```

**Add `CookingInstructionsPlaceholder` sub-component (inline in `/recipe/[id]/page.tsx`):**

```typescript
function CookingInstructionsPlaceholder() {
  return (
    <div
      style={{
        borderRadius: 14,
        border: "1.5px dashed rgba(180,170,158,0.35)",
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "24px 16px",
        minHeight: 96,
      }}
      role="region"
      aria-label="Cooking instructions"
    >
      <p
        style={{
          fontSize: 13,
          color: "var(--color-text-disabled, var(--color-text-tertiary))",
          textAlign: "center",
          lineHeight: 1.5,
          maxWidth: 220,
        }}
      >
        Cooking instructions coming soon
      </p>
    </div>
  )
}
```

**Gate condition explained:**

- `idIsUUID` — only show for Supabase-backed recipes (not sessionStorage scan results)
- `supabaseRecipe?.status === 'kept'` — only show for recipes the user has explicitly saved to My Recipes; `auto_captured` and `removed` recipes never see this section

This means:
- If the user navigates directly to `/recipe/[id]` from a restaurant's dish list (where `status: 'auto_captured'`), no cooking slot is shown
- If the user navigates from My Recipes to `/recipe/[id]` (where `status: 'kept'`), the slot is shown
- The context is derived from the recipe's own status — reliable even for deep-links or page refreshes

---

## Dev Notes

### Why not a `showCookingSlot` prop on `DishRowExpanded`?

`DishRowExpanded` is a restaurant browse component. Injecting a My Recipes-specific concern into it via props would couple two distinct UX contexts. The correct architecture is:

- `DishRowExpanded` — always the restaurant browse accordion, never contains cooking instructions
- `/recipe/[id]` detail page — the My Recipes detail view; conditionally shows the cooking slot based on `status`

This is exactly what the spec (FR12, FR13) requires: cooking instructions are only accessible after the dish is "kept" AND accessed from a dedicated detail view, not from the inline expansion.

### Checking `idIsUUID && supabaseRecipe?.status === 'kept'`

`supabaseRecipe` is the result of `useRecipe(idIsUUID ? id : null)` already present in the page. It is `null/undefined` while loading and fully populated once the query resolves. The gate is safe to check because:
- When `supabaseRecipe` is undefined (loading), the condition is `false` → slot not shown yet
- When the query resolves with `status: 'kept'`, slot appears
- When the recipe is `auto_captured`, slot never appears

### No changes to `DishRowExpanded.tsx` or `RestaurantScreen.tsx`

Both files are left exactly as they were after Story 5.1. The gate is enforced by structure, not by adding/removing props.

### Growth story G.1 compatibility

Story G.1 (Cooking Instructions in My Recipes) will fill the `CookingInstructionsPlaceholder` with real AI-generated content. To prepare the hook point cleanly, ensure:
1. The `role="region"` and `aria-label="Cooking instructions"` on the container are correct — G.1 will add content inside without touching the shell
2. The gate condition (`idIsUUID && supabaseRecipe?.status === 'kept'`) stays unchanged — G.1 only replaces the inner `CookingInstructionsPlaceholder` component

---

## Testing Requirements

### Framework

Vitest + React Testing Library.

### New test file: `src/app/recipe/[id]/recipe-page.test.tsx`

> **Note:** If a test file for this page already exists, add the new tests there.

**Test cases:**

```
describe('Cooking Instructions Gate')
  ├── renders "How to make it" section when recipe status is "kept"
  ├── does NOT render "How to make it" section when recipe status is "auto_captured"
  ├── does NOT render "How to make it" section for sessionStorage (non-UUID) ids
  └── cooking instructions placeholder shows "Cooking instructions coming soon" text
```

**Mock data:**

```typescript
// Mock useRecipe to return a kept recipe
const mockKeptRecipe: DomainRecipe = {
  id: "recipe-uuid-1",
  restaurantId: "rest-1",
  visitId: null,
  name: "Pad Thai",
  description: "Classic Thai noodle dish",
  dishImageUrl: null,
  estimatedCalories: 480,
  status: "kept",
  photoStatus: "placeholder",
  geminiConfidence: null,
  dishRating: null,
  dishReviewSnippet: null,
  totalProteinG: 18,
  totalCarbsG: 52,
  totalFatG: 12,
  totalFibreG: null,
  createdAt: new Date().toISOString(),
  ingredients: [],
}

const mockAutoCapturedRecipe: DomainRecipe = {
  ...mockKeptRecipe,
  id: "recipe-uuid-2",
  status: "auto_captured",
}
```

**Verify DishRowExpanded has no cooking slot:**

In `src/components/scan/DishRowExpanded.test.tsx`, add:

```
describe('No cooking instructions in restaurant browse')
  └── does NOT render "How to make it" or any cooking section regardless of recipe.status
```

This test confirms the gate is structurally enforced — `DishRowExpanded` has no conditional rendering path that could ever show cooking instructions.

---

## What Does NOT Change in This Story

| File | Reason |
|------|--------|
| `src/components/scan/DishRowExpanded.tsx` | Already correct — no cooking instructions slot exists; no changes needed |
| `src/components/screens/RestaurantScreen.tsx` | No changes needed |
| `src/hooks/useRecipes.ts` | No new hooks needed |
| `src/types/database.ts` | No type changes needed |
| Any API routes | No API work |
| Any migration files | No schema changes — `status` column already present |
| `planning/sprint-status.yaml` | Do NOT update |

---

## Architecture Guardrails

- **Structural gate, not prop-based** — do not add `showCookingSlot` to `DishRowExpanded`; `DishRowExpanded` has no cooking slot at all, enforcing the gate by structure rather than by prop; the `status === 'kept'` check lives in `/recipe/[id]/page.tsx` (the My Recipes detail page), which has the appropriate context to make that decision
- **No stub for Growth story** — `CookingInstructionsPlaceholder` is self-contained; G.1 can replace it without hunting for a conditional prop
- **No PII in logs** — no logging of recipe names or status values
- **TypeScript strict** — `supabaseRecipe?.status` is `RecipeStatus | undefined`; the equality check is type-safe

---

## Definition of Done

- [x] `DishRowExpanded.tsx`: verified no cooking instructions content or slot (no changes needed, just confirm)
- [x] `/recipe/[id]/page.tsx` updated: "How to make it" section appears when `idIsUUID && supabaseRecipe?.status === 'kept'`
- [x] "How to make it" section contains `CookingInstructionsPlaceholder` with correct dashed-border styling and aria attributes
- [x] "How to make it" section is completely absent when `status === 'auto_captured'` or `status === 'removed'`
- [x] "How to make it" section is completely absent for sessionStorage (non-UUID) recipe IDs
- [x] New tests for gate condition in `/recipe/[id]` page pass
- [x] Confirmation test in `DishRowExpanded.test.tsx` that no cooking instructions ever render
- [x] TypeScript strict: no new errors
- [x] `planning/sprint-status.yaml` is NOT modified

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Test IDs must be valid UUIDs for `isUUID()` to pass — `'recipe-uuid-1'` is not a UUID; fixed to use `'a1b2c3d4-e5f6-7890-abcd-ef1234567890'` format in tests.

### Completion Notes List

- `DishRowExpanded.tsx` confirmed unchanged — no cooking instructions slot exists anywhere in the component; the gate is structurally enforced.
- Added `CookingInstructionsPlaceholder` inline sub-component to `/recipe/[id]/page.tsx` — dashed-border placeholder with `role="region"` and `aria-label="Cooking instructions"`, G.1-ready.
- Added "How to make it" section in `/recipe/[id]/page.tsx` after the ingredients block, gated by `idIsUUID && supabaseRecipe?.status === 'kept'`.
- Created `src/app/recipe/[id]/recipe-page.test.tsx` with 4 tests covering all gate conditions.
- Added "No cooking instructions in restaurant browse" describe block to `DishRowExpanded.test.tsx` confirming structural enforcement across both `auto_captured` and `kept` statuses.
- Full suite: 47 test files, 584 tests passing, 0 failures.

### File List

- `src/app/recipe/[id]/page.tsx` — modified: added "How to make it" gate section + `CookingInstructionsPlaceholder` component
- `src/app/recipe/[id]/recipe-page.test.tsx` — created: 4 gate condition tests
- `src/components/scan/DishRowExpanded.test.tsx` — modified: added structural confirmation test

### Change Log

- 2026-04-13: Story 5.4 implemented — cooking instructions gate added to `/recipe/[id]` page; `DishRowExpanded` confirmed unchanged; 5 new tests added.
