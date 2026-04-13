# Story 3.5: Portion Adjustment & Macro Recalculation

Status: review
Epic: 3 — Dish Photos, USDA Nutrition & Portion Control
Story ID: 3.5
Story Key: 3-5-portion-adjustment-macro-recalculation
Created: 2026-04-12

---

## Story

As a user,
I want to adjust the serving portion of a dish and see macros recalculate instantly,
So that I can get accurate nutrition info for the amount I actually eat.

---

## Acceptance Criteria

**AC1 — Portion stepper is visible in expanded state**
**Given** a dish is expanded (DishRowExpanded)
**When** a portion size control is visible
**Then** the user can increase or decrease the serving multiplier using fixed options: 0.5×, 1×, 1.5×, 2×

**AC2 — Macros recalculate client-side, within 100ms, no API call**
**Given** the user changes the portion multiplier
**When** macros are recalculated
**Then** calories, protein, carbs, fat, and fibre update within ≤100ms — no API call is made; recalculation is client-side only

**AC3 — All MacroBar cells and calorie header update**
**Given** a portion is adjusted
**When** the MacroBar re-renders
**Then** all 4 cells (Protein / Carbs / Fat / Fibre) reflect the scaled values; the calorie total in the header also updates

**AC4 — Portion resets to 1× on collapse**
**Given** the user closes and reopens the expanded dish
**When** it renders
**Then** the portion multiplier resets to 1× (portion adjustment is not persisted)

---

## This Is Brownfield — Audit First, Fix Second

**`src/components/scan/DishRowExpanded.tsx` already exists** with a working implementation. Do NOT reinvent it. Your task is to add portion state and the stepper UI, wire up scaled derived values, and add tests to the existing test file.

### What is already correctly implemented

| Feature | Notes |
|---------|-------|
| `dismissed` state + double-tap guard on collapse button | Correct — do not change |
| `onCollapse` callback wired to collapse chevron | Correct — add `setPortion(1)` here |
| Calorie display at line ~120 (`recipe.estimatedCalories != null`) | Must be updated to use `scaledCalories` |
| `MacroBar` usage at line ~134 with four null-safe props | Must be updated to use scaled values |
| Ingredient list (loading skeleton, error state, "+N more") | No changes needed |
| `+ Add to My Recipes` CTA button | No changes needed |
| Hero photo via `PhotoFrame` | No changes needed |
| `ChevronDownIcon` SVG | No changes needed |
| Accessibility: `role="region"`, `aria-label` on section | No changes needed |

### What must be added

1. `const [portion, setPortion] = useState(1)` — local state for the multiplier
2. Portion stepper UI — a row of 4 pill buttons placed **between the calorie display and the MacroBar** (i.e. after the `recipe.estimatedCalories` block, before `<MacroBar />`)
3. Five synchronous derived values: `scaledCalories`, `scaledProtein`, `scaledCarbs`, `scaledFat`, `scaledFibre`
4. Update calorie display to use `scaledCalories` instead of `recipe.estimatedCalories`
5. Update `<MacroBar />` props to use the five scaled values
6. `setPortion(1)` called inside the collapse button's `onClick`, alongside the existing `setDismissed(true)` and `onCollapse()`

### What must NOT change

- Existing `dismissed` state and double-tap guard logic
- `PhotoFrame` rendering and `photoStatus !== "suppressed"` guard
- Ingredient list rendering (skeleton, error, max-5, "+N more")
- `+ Add to My Recipes` button and its `onAddToRecipes` callback
- `ChevronDownIcon` component
- All existing test cases in `DishRowExpanded.test.tsx` — new tests are added; nothing is removed or rewritten

---

## Implementation Notes

### 1. Local portion state

Add immediately after the existing `dismissed` state declaration:

```typescript
const [portion, setPortion] = useState(1)
```

The `useState` import is already present.

### 2. Reset on collapse

The existing collapse button `onClick`:

```typescript
onClick={() => {
  setDismissed(true)
  onCollapse()
}}
```

Must become:

```typescript
onClick={() => {
  setPortion(1)
  setDismissed(true)
  onCollapse()
}}
```

### 3. Scaled derived values

Place these derived constants immediately before the `return` statement (or just above the MacroBar usage block):

```typescript
const scaledCalories = recipe.estimatedCalories != null
  ? Math.round(recipe.estimatedCalories * portion)
  : null

const scaledProtein = totalProtein != null ? +(totalProtein * portion).toFixed(1) : null
const scaledCarbs   = totalCarbs   != null ? +(totalCarbs   * portion).toFixed(1) : null
const scaledFat     = totalFat     != null ? +(totalFat     * portion).toFixed(1) : null
const scaledFibre   = totalFibre   != null ? +(totalFibre   * portion).toFixed(1) : null
```

These are synchronous derived values — no `useEffect`, no `useMemo`, no debounce. The ≤100ms AC is trivially satisfied.

### 4. Calorie display update

Change line ~129 from:

```typescript
{recipe.estimatedCalories} cal
```

to:

```typescript
{scaledCalories} cal
```

The outer `null` guard (`recipe.estimatedCalories != null`) remains unchanged. `scaledCalories` is null only when `recipe.estimatedCalories` is null, so the guard still works correctly.

### 5. MacroBar props update

Change the existing `<MacroBar />` call from:

```typescript
<MacroBar
  proteinG={totalProtein ?? null}
  carbsG={totalCarbs ?? null}
  fatG={totalFat ?? null}
  fibreG={totalFibre ?? null}
/>
```

to:

```typescript
<MacroBar
  proteinG={scaledProtein}
  carbsG={scaledCarbs}
  fatG={scaledFat}
  fibreG={scaledFibre}
/>
```

The `?? null` coercions are no longer needed because the scaled derived values already handle the null case explicitly.

### 6. Portion stepper UI

Insert this block **after** the calorie display block and **before** `<MacroBar />`:

```typescript
{/* Portion stepper — 4 fixed options */}
<div
  role="group"
  aria-label="Serving size"
  style={{ display: "flex", gap: 8 }}
>
  {([0.5, 1, 1.5, 2] as const).map((value) => (
    <button
      key={value}
      type="button"
      onClick={() => setPortion(value)}
      aria-pressed={portion === value}
      aria-label={`${value} serving${value !== 1 ? "s" : ""}${portion === value ? ", selected" : ""}`}
      style={{
        flex: 1,
        height: 34,
        borderRadius: 9999,
        border: portion === value ? "none" : "var(--border-glass)",
        background: portion === value ? "var(--color-accent)" : "var(--glass-base)",
        color: portion === value ? "#ffffff" : "var(--color-text-secondary)",
        fontSize: 13,
        fontWeight: portion === value ? 600 : 400,
        cursor: "pointer",
      }}
    >
      {value}×
    </button>
  ))}
</div>
```

**Visual spec:**
- Active pill: terracotta fill (`--color-accent`), white text, no border, font-weight 600
- Inactive pill: `--glass-base` background, `--color-text-secondary` text, `--border-glass` border, font-weight 400
- Height: 34px, border-radius: 9999px (full pill), gap: 8px between pills
- Each pill takes equal width (`flex: 1`) within the group

**Accessibility:**
- The container has `role="group"` and `aria-label="Serving size"`
- Each pill button has `aria-pressed={portion === value}`
- Each pill's `aria-label` describes the value and includes ", selected" for the active one

**No animation:** The stepper is a simple state toggle. No spring animation, no Framer Motion, no transition on the pill switch. Framer Motion's `SPRING_CARD_EXPAND` preset is used by the parent accordion, not this component.

---

## Tests Required

**Test file location:** `src/components/scan/DishRowExpanded.test.tsx`

The test file already exists with a full suite of passing tests. **Add new test cases only — do not modify or delete any existing tests.** All existing 14 test cases must continue to pass.

### New `describe` block to add

Add a new `describe('portion stepper', ...)` block after the existing `describe('reduced motion', ...)` block. Import `fireEvent` from `@testing-library/react` if not already imported (check the existing import — `screen` and `render` are already imported; `fireEvent` may need to be added).

### Required new test cases

```
describe('portion stepper')
  ├── default portion is 1× — MacroBar receives unscaled values
  ├── tapping 2× scales calories × 2 in the calorie header
  ├── tapping 2× scales protein, carbs, fat × 2 in MacroBar
  ├── tapping 0.5× halves the calorie display
  ├── collapsing resets portion to 1× (next render shows 1× pill as active)
  ├── when totalProtein is null, scaledProtein passed to MacroBar is also null (not 0)
  └── portion pills have aria-pressed set correctly (active = true, inactive = false)
```

### Testing approach notes

- To check calorie display after scaling: after clicking the `2×` button, assert `screen.getByText('1040 cal')` (baseRecipe has `estimatedCalories: 520`).
- To check MacroBar values: pass numeric `totalProtein`, `totalCarbs`, `totalFat` props, click a multiplier pill, then query the rendered macro value text (e.g. `24g` for protein at 2× when `totalProtein={12}`).
- To test collapse reset: render, click `2×` pill to confirm it's active, click the Collapse button, re-render (or check that calling `onCollapse` also triggered `setPortion(1)` by re-rendering the component with a fresh instance — use `rerender` from RTL).
- The stepper container has `role="group"` and `aria-label="Serving size"` — use `screen.getByRole('group', { name: /serving size/i })` to assert presence.
- Each pill button can be queried by `aria-label`: `screen.getByRole('button', { name: /1 serving, selected/i })` when portion is 1.

### Fixture note

The existing `baseRecipe` fixture (`estimatedCalories: 520`) and `defaultProps` are the right base for portion stepper tests. Add `totalProtein={12}` etc. inline when the test needs macro values.

---

## Architecture Guardrails

- **All recalculation is synchronous client-side** — no API call, no `useEffect`, no debounce. The ≤100ms AC is a non-event; derived values compute in microseconds.
- **Portion is ephemeral UI state** — it lives in `useState`, is never written to Supabase, never serialised to sessionStorage. Resetting on collapse (`setPortion(1)`) is the only persistence concern.
- **Null propagation is explicit** — `scaledProtein` is `null` when `totalProtein` is `null`; it is never coerced to `0`. The MacroBar renders "—" for null values (existing behaviour; do not change MacroBar).
- **No new animations** — the stepper is a CSS state toggle only. Do not introduce `motion.div` or spring presets for the pill switch.
- **`aria-pressed` is required** — each pill button must declare `aria-pressed` per the accessibility spec. This is a boolean attribute on a toggle button, not a role.
- **No PII in logs (SEC-DAT-1.00)** — this component has no logging; do not add any.
- **TypeScript strict mode** — `([0.5, 1, 1.5, 2] as const)` ensures the array has a literal type. `portion === value` comparison is type-safe. No `any` casts.

---

## File Scope

### Files to modify

| File | Change |
|------|--------|
| `src/components/scan/DishRowExpanded.tsx` | Add `portion` state, stepper UI between calorie display and MacroBar, scaled derived values, reset on collapse |
| `src/components/scan/DishRowExpanded.test.tsx` | Add new `describe('portion stepper', ...)` block with 7 test cases; do not touch existing tests |

### Files NOT to touch

| File | Reason |
|------|--------|
| `src/components/ui/MacroBar.tsx` | MacroBar's null-rendering behaviour is already correct; this story only changes what is passed to it |
| `src/components/ui/PhotoFrame.tsx` | Not in scope |
| `src/components/scan/DishRowCompact.tsx` | Story 2.4 scope; compact row is unaffected by expanded portion state |
| `src/app/api/scan/enrich/route.ts` | API route is not involved; all recalculation is client-side |
| `src/lib/springs.ts` | No new animations in this story |
| `src/types/database.ts` | Portion is ephemeral UI state — no schema changes |
| Any Supabase migration files | Portion is never persisted |
| `planning/sprint-status.yaml` | Do not update sprint status |

---

## Key Context from Epic 3

Story 3.5 is the UX payoff for the USDA macro pipeline built in Stories 3.2–3.4. By this point in the epic, dishes have USDA-verified macro values for each ingredient (`proteinG`, `carbsG`, `fatG`). The portion stepper makes those values actionable — a user ordering a half-portion or a double serving can see accurate numbers without touching any input field.

**Upstream dependency:** The `totalProtein`, `totalCarbs`, `totalFat`, `totalFibre` props passed into `DishRowExpanded` are computed by the parent (`RestaurantScreen` or the scan session hook) by summing ingredient-level macros. Story 3.5 does not change how those totals are computed — it only scales them for display.

**Downstream:** Story 3.6 (if planned) may add a "Save with this portion" affordance. For now, the portion is display-only and ephemeral.

**Parallel work notice:** Stories 3.2–3.4 (USDA pipeline) and 3.5 (portion stepper) have independent file scope. This story only touches `DishRowExpanded.tsx` and its test file. No coordination with the USDA pipeline stories is required.

---

## Definition of Done

- [x] `src/components/scan/DishRowExpanded.tsx` renders a portion stepper with four pills (0.5×, 1×, 1.5×, 2×) between the calorie display and MacroBar
- [x] Active pill renders with terracotta fill (`--color-accent`) and white text; inactive pills render with `--glass-base` background and `--border-glass` border
- [x] Tapping any pill updates `portion` state and immediately re-renders scaled calorie and MacroBar values — no API call made
- [x] `scaledCalories` uses `Math.round`; `scaledProtein/Carbs/Fat/Fibre` use `.toFixed(1)` with `+` coercion to number
- [x] Collapsing (tapping the chevron) resets `portion` to `1` before calling `onCollapse`
- [x] Stepper container has `role="group"` and `aria-label="Serving size"`
- [x] Each pill button has `aria-pressed={portion === value}` and a descriptive `aria-label`
- [x] When `totalProtein` (or any macro prop) is `null`, the corresponding scaled value is `null` — never `0`
- [x] All 7 new test cases in `describe('portion stepper', ...)` pass
- [x] All 14 pre-existing tests in `DishRowExpanded.test.tsx` continue to pass (16 original total, all pass)
- [x] TypeScript strict mode passes (`tsc --noEmit`) with no new errors
- [x] No Framer Motion or spring animation added to the stepper

---

## Dev Agent Record

### Implementation Notes

Added `portion` state and synchronous derived values to the existing `DishRowExpanded` component. The stepper renders between the calorie display and MacroBar, exactly as specified. All recalculation is synchronous (no `useEffect`, no debounce) — the ≤100ms AC is trivially satisfied.

Key decisions:
- `([0.5, 1, 1.5, 2] as const)` preserves the literal tuple type so `portion === value` comparisons are type-safe
- Calorie guard (`recipe.estimatedCalories != null`) remains unchanged — `scaledCalories` is null iff `recipe.estimatedCalories` is null
- `setPortion(1)` placed first in the collapse onClick to match the story spec ordering
- `?? null` coercions removed from MacroBar props since scaled values already handle the null case explicitly

### Completion Notes

**Story 3.5 complete.** Implementation touched exactly 2 files:
- `src/components/scan/DishRowExpanded.tsx` — portion state, stepper UI, 5 scaled derived values, MacroBar prop update, collapse reset
- `src/components/scan/DishRowExpanded.test.tsx` — 7 new test cases in `describe('portion stepper', ...)`; 16 original tests unchanged

Test results: 23/23 pass (16 original + 7 new). No regressions in the broader suite (290 other passing tests unchanged; 16 pre-existing failures in `src/app/api/usda/verify/route.test.ts` are story 3.2 work-in-progress, unrelated).

### File List

- `src/components/scan/DishRowExpanded.tsx` — modified
- `src/components/scan/DishRowExpanded.test.tsx` — modified

### Change Log

- Added `portion` state and portion stepper UI to `DishRowExpanded` — 4 pill buttons (0.5×, 1×, 1.5×, 2×) between calorie display and MacroBar (Date: 2026-04-12)
- Added 7 test cases in `describe('portion stepper', ...)` to `DishRowExpanded.test.tsx` (Date: 2026-04-12)
