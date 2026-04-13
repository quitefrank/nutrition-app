# Story 6.1: ScanConfidenceBanner & Recovery Entry Points

Status: review
Epic: 6 — Graceful Failure & Progressive Recovery
Story ID: 6.1
Story Key: 6-1-scanconfidencebanner-recovery-entry-points
Created: 2026-04-13

---

## Story

As a user,
I want to see a clear banner when my scan didn't capture all the menu's dishes, with specific actions I can take,
So that I'm never left wondering if something went wrong or what to do about it.

---

## Acceptance Criteria

**AC1 — Banner slides up when dishes were missed**
**Given** one or more dishes from a menu scan were not recognised
**When** the restaurant dish list renders
**Then** the ScanConfidenceBanner slides up from the bottom of the content area (above the nav bar) using spring animation (`stiffness: 380, damping: 24`); it shows the count of read vs. total dishes (e.g. "8 of 10 dishes read") plus secondary context text ("2 couldn't be identified")

**AC2 — Banner absent when all dishes were recognised**
**Given** a scan where `recipes.length >= totalDetected`
**When** the restaurant dish list renders
**Then** no banner is shown; the guard lives in `RestaurantScreen`'s `AnimatePresence` condition (`totalDetected > 0 && recipes.length < totalDetected`)

**AC3 — Banner shows 3 recovery action buttons**
**Given** the ScanConfidenceBanner is visible
**When** it renders
**Then** it shows 3 recovery action buttons: "Retake photo", "Add manually", and "Continue with N dishes"; surface is amber tint (`rgba(251,243,226,0.95)`); it has `role="alert"` and `aria-live="assertive"`

**AC4 — "Continue with N dishes" dismisses the banner**
**Given** the ScanConfidenceBanner is visible
**When** the user taps "Continue with N dishes"
**Then** the banner dismisses via `AnimatePresence` exit animation; the user proceeds with the partial dish set; unrecognised dish slots remain suppressed (no empty cards)

**AC5 — Banner absent on search-path visits**
**Given** a user navigates to a restaurant via search (not a camera scan)
**When** the restaurant screen loads
**Then** no banner is shown because `totalDetected` is `0` on search-path visits (the sessionStorage key `plately_scan_*` is never written on the search path, so `loadTotalDetected` returns `0`)

**AC6 — Reduced motion: opacity fade only**
**Given** the banner appears on a device with `prefers-reduced-motion: reduce`
**When** it renders
**Then** it appears immediately with opacity fade only (`initial: { opacity: 0 }`, `animate: { opacity: 1 }`); no spring slide animation; `transition: { duration: 0.15 }`

**AC7 — "Retake photo" and "Add manually" are stubs for 6.2/6.3**
**Given** the user taps "Retake photo" or "Add manually"
**When** the action is taken
**Then** the handler fires (calling a `console.warn` stub); the banner does not auto-dismiss on these actions — the wiring is completed in Stories 6.2 and 6.3 respectively

---

## What This Story Changes

### Current state (after Story 2.7)

Story 2.7 already delivered a static confidence indicator. The full `ScanConfidenceBanner` component (`src/components/scan/ScanConfidenceBanner.tsx`) and its integration inside `RestaurantScreen.tsx` were implemented as part of that story's delivery. The component is complete and already passes the test suite.

**This story's job is to verify correctness, lock down the spec as final, and prepare Stories 6.2 and 6.3 for their wiring.** No structural changes to the component are required.

### File: `src/components/scan/ScanConfidenceBanner.tsx` — verify, no changes needed

The component already implements the full spec:

- `role="alert"` and `aria-live="assertive"` on the root element
- Spring animation `{ type: "spring", stiffness: 380, damping: 24 }` for entry/exit
- Reduced motion guard via `useReducedMotion()` — opacity fade only when `shouldReduceMotion` is true
- Amber tint surface `rgba(251,243,226,0.95)`
- Primary count text: `"{recognisedCount} of {totalDetected} dishes read"`
- Secondary text: `"{missedCount} couldn't be identified"` — `missedCount` floored at `0`
- Three action buttons: "Retake photo", "Add manually", "Continue with {recognisedCount}"

```typescript
// Current component signature — no changes:
export interface ScanConfidenceBannerProps {
  recognisedCount: number;
  totalDetected: number;
  onRetake: () => void;
  onAddManually: () => void;
  onContinue: () => void;
}
```

The stub handlers in `RestaurantScreen` that Stories 6.2/6.3 will replace:

```typescript
// RestaurantScreen.tsx — lines 903–906 (already in place, do NOT change in this story):
onRetake={() => console.warn("[ScanConfidenceBanner] retake — Story 6.2")}
onAddManually={() => console.warn("[ScanConfidenceBanner] add manually — Story 6.3")}
onContinue={() => console.warn("[ScanConfidenceBanner] continue — Story 6.1")}
```

### File: `src/components/screens/RestaurantScreen.tsx` — dismiss wiring for "Continue"

The `onContinue` stub currently fires a `console.warn`. Story 6.1 upgrades this to a real dismiss handler — the banner needs `dismissed` state so `AnimatePresence` can animate it out.

**Add `bannerDismissed` state and update the `AnimatePresence` condition:**

```typescript
// Add alongside other useState declarations (around line 203):
const [bannerDismissed, setBannerDismissed] = useState(false);
```

**Update the `AnimatePresence` condition (currently around line 898):**

```typescript
{/* Scan confidence banner — camera-scan path only (AC2, AC3, AC5) */}
<AnimatePresence>
  {!recipesPending && !bannerDismissed && totalDetected > 0 && recipes.length < totalDetected && (
    <ScanConfidenceBanner
      key="scan-confidence-banner"
      recognisedCount={recipes.length}
      totalDetected={totalDetected}
      onRetake={() => console.warn("[ScanConfidenceBanner] retake — Story 6.2")}
      onAddManually={() => console.warn("[ScanConfidenceBanner] add manually — Story 6.3")}
      onContinue={() => setBannerDismissed(true)}
    />
  )}
</AnimatePresence>
```

The `bannerDismissed` flag persists only for the current page load — navigating away and back resets it. This is intentional: if the user returns from a retake or manual entry flow (Stories 6.2/6.3), the banner should re-evaluate based on fresh data.

### File: `src/components/scan/ScanConfidenceBanner.test.tsx` — add dismiss test

The existing test file covers component-level rendering and button callbacks. Add one integration-level test for the dismiss behaviour:

```
describe('ScanConfidenceBanner — dismiss via onContinue (AC4)')
  └── banner exits AnimatePresence when onContinue fires (via setBannerDismissed)
```

See the Testing Requirements section for the full test case.

---

## Dev Notes

### How unrecognised dishes are detected

The `photo_status = 'suppressed'` field on recipe rows (Supabase) is the canonical marker for dishes that Gemini attempted to scan but could not identify. However, the `ScanConfidenceBanner` does **not** query `photo_status` directly — it uses two sessionStorage-derived values computed when the page loads:

1. **`totalDetected`** — the raw Gemini count stored in the scan session key (`plately_scan_*`) under `totalDetected`. This is the number of dish slots Gemini saw in the menu image. Computed by `loadTotalDetected(placeId)` in `RestaurantScreen`.

2. **`recipes.length`** — the number of recipes that were actually parsed and persisted (Supabase + session-only merged list). When `recipes.length < totalDetected`, some dishes were unrecognised.

The banner condition in `RestaurantScreen`:
```
totalDetected > 0 && !bannerDismissed && recipes.length < totalDetected
```

`totalDetected === 0` on the search path because `loadTotalDetected` only reads keys prefixed with `plately_scan_` — no such key is written on a search-path navigation. This is the natural guard for AC5 (no banner on search visits).

### Spring preset

The banner uses `SPRING_MODAL_ENTER` from `src/lib/springs.ts`, but the value is inlined directly in the component to keep it self-contained and avoid coupling the banner to the springs module. Both express `{ type: "spring", stiffness: 380, damping: 24 }`. If the team later wants to centralise this, the component can import `SPRING_MODAL_ENTER`.

### Slide direction

The banner slides **up from the bottom** (`initial: { opacity: 0, y: "100%" }`). This matches UX-DR12: "slides up from bottom of restaurant screen content, above nav bar". The `bottom` CSS positions it just above the tab bar using the CSS custom property `--tab-bar-height`.

### Stories 6.2/6.3 wiring points

Stories 6.2 and 6.3 replace the stubs in `RestaurantScreen`:

| Button | Current stub | Future wiring |
|--------|-------------|---------------|
| "Retake photo" | `console.warn("[ScanConfidenceBanner] retake — Story 6.2")` | Open `CameraModal` — Story 6.2 |
| "Add manually" | `console.warn("[ScanConfidenceBanner] add manually — Story 6.3")` | Open manual entry form — Story 6.3 |
| "Continue with N" | `setBannerDismissed(true)` | Already wired in this story |

Stories 6.2/6.3 should replace the `console.warn` calls and are permitted to remove the `bannerDismissed` state if a more sophisticated dismiss model is needed (e.g. dismissing on camera open). They should not change `ScanConfidenceBanner.tsx` itself.

### No changes to `SmartBanner.tsx`

`SmartBanner.tsx` (`src/components/banners/SmartBanner.tsx`) is a separate component for return-visit / location nudges. It is not touched by this story — the two banner types coexist independently.

---

## Testing Requirements

### Framework

Vitest + React Testing Library.

### Existing test file: `src/components/scan/ScanConfidenceBanner.test.tsx`

All 9 existing tests are already passing. Verify they remain green after the `RestaurantScreen` changes:

```
describe('ScanConfidenceBanner')
  ├── renders primary count text ("8 of 10 dishes read")                         ✓ existing
  ├── renders secondary text ("2 couldn't be identified")                        ✓ existing
  ├── has role="alert"                                                            ✓ existing
  ├── has aria-live="assertive"                                                   ✓ existing
  ├── calls onRetake when "Retake photo" button is pressed                       ✓ existing
  ├── calls onAddManually when "Add manually" button is pressed                  ✓ existing
  ├── calls onContinue when "Continue with 8" button is pressed                  ✓ existing
  ├── computes missed count dynamically (5 of 9 → "4 couldn't be identified")   ✓ existing
  ├── "Continue with N" button label reflects recognisedCount                    ✓ existing
  ├── shows 0 missed count when recognisedCount equals totalDetected             ✓ existing
  └── (todo) banner not rendered on search-path visit — verified via RestaurantScreen (AC5)
```

**Add one new test to `ScanConfidenceBanner.test.tsx`:**

```typescript
it('calls onContinue when "Continue with N" is tapped (dismiss handler hook)', async () => {
  const onContinue = vi.fn()
  render(
    <ScanConfidenceBanner
      recognisedCount={8}
      totalDetected={10}
      onRetake={vi.fn()}
      onAddManually={vi.fn()}
      onContinue={onContinue}
    />
  )
  await userEvent.click(screen.getByRole('button', { name: 'Continue with 8' }))
  expect(onContinue).toHaveBeenCalledTimes(1)
})
```

> Note: this test is nearly identical to the existing "calls onContinue" test. Its purpose is to document that `onContinue` is the dismiss hook — when Stories 6.2/6.3 replace stubs, the test name makes the intent explicit.

### New test file: `src/components/screens/RestaurantScreen.test.tsx`

> **Note:** If a test file for this screen already exists, add the new tests there.

**Mock setup:**

```typescript
// Mock Framer Motion to avoid spring animation side-effects in tests
vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>()
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    motion: {
      div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
      button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button>,
    },
    useReducedMotion: () => false,
  }
})

// Mock TanStack Query hooks used by RestaurantScreen
vi.mock('@/hooks/useRestaurants', () => ({
  useRestaurants: () => ({ data: [], isPending: false }),
}))
vi.mock('@/hooks/useRecipes', () => ({
  useRecipesByRestaurant: () => ({ data: [], isPending: false }),
  useRemoveRecipe: () => ({ mutate: vi.fn() }),
  useUpdateRecipe: () => ({ mutate: vi.fn() }),
  useRecipe: () => ({ data: null, isError: false }),
}))
vi.mock('@/hooks/useEnrichment', () => ({
  useEnrichment: () => ({ enrich: vi.fn() }),
}))
```

**Test cases:**

```
describe('ScanConfidenceBanner integration — RestaurantScreen (Story 6.1)')
  ├── banner is absent when totalDetected is 0 (search path — AC5)
  ├── banner is absent when all dishes recognised (recipes.length === totalDetected — AC2)
  ├── banner is absent while recipesPending is true
  ├── banner is absent after "Continue" is tapped (bannerDismissed=true — AC4)
  └── banner is present when totalDetected > recipes.length (scan path — AC1)
```

**Representative test for AC4 (dismiss):**

```typescript
describe('ScanConfidenceBanner integration — RestaurantScreen (Story 6.1)', () => {
  it('banner dismisses after "Continue with N" is tapped (AC4)', async () => {
    // Arrange: sessionStorage with a scan key showing 10 detected, only 8 recognised
    sessionStorage.setItem('plately_scan_test', JSON.stringify({
      type: 'menu',
      restaurantName: 'Test Restaurant',
      restaurantPlaceId: 'test-place-id',
      allDishes: Array.from({ length: 8 }, (_, i) => ({ name: `Dish ${i + 1}` })),
      totalDetected: 10,
      scannedAt: Date.now(),
    }))

    render(<RestaurantScreen placeId="test-place-id" />)

    // Banner should be present
    expect(screen.getByRole('alert')).toBeTruthy()
    expect(screen.getByText('8 of 10 dishes read')).toBeTruthy()

    // Tap "Continue"
    await userEvent.click(screen.getByRole('button', { name: /Continue with 8/i }))

    // Banner should be gone
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
```

---

## What Does NOT Change in This Story

| File | Reason |
|------|--------|
| `src/components/scan/ScanConfidenceBanner.tsx` | Already fully implemented; no changes needed |
| `src/components/scan/InferenceState.tsx` | Low-confidence single-dish flow; unrelated |
| `src/components/banners/SmartBanner.tsx` | Return-visit / location nudge; separate concern |
| `src/components/scan/CameraModal.tsx` | Camera integration is Story 6.2 |
| `src/lib/springs.ts` | Spring presets already correct; no changes needed |
| `src/types/database.ts` | No new types needed |
| Any API routes | No API work in this story |
| Any migration files | No schema changes |
| `planning/sprint-status.yaml` | Do NOT update |

---

## Architecture Guardrails

- **No empty cards for suppressed dishes** — unrecognised dishes are filtered at the Supabase query level (recipes with `photo_status = 'suppressed'` are not rendered) and at the sessionStorage merge level; the banner is the only surface that communicates their existence
- **`role="alert"` + `aria-live="assertive"`** — required by UX-DR12; screen readers announce the banner immediately on mount; do not change these values
- **`bannerDismissed` is local state, not sessionStorage** — dismiss is intentionally ephemeral; returning to the restaurant after a retake or manual entry (Stories 6.2/6.3) should re-evaluate the banner condition against fresh data
- **Stub handlers must not throw** — `console.warn` is intentional; throwing would break the UX before 6.2/6.3 are implemented
- **`SPRING_MODAL_ENTER` equivalence** — the inline spring values `{ type: "spring", stiffness: 380, damping: 24 }` match `SPRING_MODAL_ENTER` exactly; importing from `src/lib/springs.ts` is acceptable if the team prefers DRY over self-containment, but is not required
- **No PII in logs** — the `console.warn` stubs do not log dish names or user data
- **TypeScript strict** — `bannerDismissed` is `boolean`; `setBannerDismissed(true)` is type-safe

---

## Definition of Done

- [x] `ScanConfidenceBanner.tsx`: verified correct (no changes needed) — amber surface, spring animation, reduced motion guard, `role="alert"`, `aria-live="assertive"`, 3 action buttons, count + secondary text
- [x] `RestaurantScreen.tsx`: `bannerDismissed` state added; `AnimatePresence` condition updated to include `!bannerDismissed`; `onContinue` wired to `setBannerDismissed(true)`
- [x] `onRetake` and `onAddManually` remain as `console.warn` stubs (not yet wired — Stories 6.2/6.3)
- [x] Banner dismisses with exit animation when "Continue with N" is tapped
- [x] Unrecognised dish slots remain suppressed after dismiss (no empty cards appear)
- [x] Banner absent on search-path visits (`totalDetected === 0`)
- [x] Banner absent when all dishes recognised (`recipes.length >= totalDetected`)
- [x] Reduced motion: opacity-only fade, no slide animation
- [x] All existing `ScanConfidenceBanner.test.tsx` tests continue to pass
- [x] New dismiss integration test in `RestaurantScreen.test.tsx` passes
- [x] TypeScript strict: no new errors
- [x] `planning/sprint-status.yaml` is NOT modified

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was straightforward; no debugging needed.

### Completion Notes List

- `ScanConfidenceBanner.tsx` verified correct — all props, animation, accessibility attributes, and button handlers match spec exactly. No changes needed.
- Added `bannerDismissed` boolean state to `RestaurantScreen.tsx` alongside existing `totalDetected` state declaration (~line 202).
- Updated `AnimatePresence` condition to include `!bannerDismissed` guard, and wired `onContinue` to `setBannerDismissed(true)`. `onRetake` and `onAddManually` remain as `console.warn` stubs per spec.
- Added one new test to `ScanConfidenceBanner.test.tsx` documenting `onContinue` as the dismiss handler hook (AC4 documentation intent).
- Created `RestaurantScreen.test.tsx` with 5 integration tests covering AC1, AC2, AC4, AC5, and the recipesPending guard. All 5 pass.
- Full regression suite: 615 tests pass, 1 todo. Zero regressions. TypeScript: no new errors introduced.

### File List

- `src/components/screens/RestaurantScreen.tsx` (modified — `bannerDismissed` state + condition + onContinue wiring)
- `src/components/scan/ScanConfidenceBanner.test.tsx` (modified — added dismiss handler documentation test)
- `src/components/screens/RestaurantScreen.test.tsx` (created — 5 integration tests for banner visibility/dismiss)

### Change Log

- 2026-04-13: Story 6.1 implemented — `bannerDismissed` state wired to `onContinue`; `RestaurantScreen.test.tsx` created with 5 integration tests; dismiss documentation test added to `ScanConfidenceBanner.test.tsx`
