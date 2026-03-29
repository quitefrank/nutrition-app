# Story 6.1: Accessibility Audit & Screen Reader Support

**Status:** review
**Story ID:** 6.1
**Epic:** 6 — Accessibility, PWA & Production Readiness

---

## Story

As a user with accessibility needs,
I want the app to work with VoiceOver and honour my motion preferences,
So that I can use Plately fully regardless of how I interact with my device.

---

## Acceptance Criteria

**AC1 — AI-generated alt text on dish images (UX-DR17)**
Given any dish image in the app
When VoiceOver reads it
Then it announces AI-generated descriptive alt text (e.g., "Duck Confit — crispy duck leg with cherry jus"); never announces "image" or nothing

**AC2 — Evidence block and reference photos labelled for VoiceOver**
Given the evidence block in any confidence state
When VoiceOver reads it
Then the full evidence text is announced; side-by-side reference photos are labelled "Your photo" and "Reference: [dish name]"

**AC3 — Bottom sheet VoiceOver modal behaviour**
Given a bottom sheet opens
When VoiceOver is active
Then the sheet is announced as a modal region; focus moves into the sheet on open; when dismissed, focus returns to the triggering element

**AC4 — Processing strip state change announced**
Given the processing strip changes state from "processing" to "result ready"
When VoiceOver is active
Then the state change is announced: "Your results are ready"; the user does not need to monitor the strip visually

**AC5 — WCAG AA contrast check for atmospheric palettes (UX-DR1, UX-DR17)**
Given any atmospheric palette change is about to be applied
When the programmatic contrast check runs
Then `text-primary` over the composite background passes WCAG AA (4.5:1 for body text, 3:1 for large text); failing palettes fall back one tier without rendering

**AC6 — Reduce Motion support throughout app (UX-DR10)**
Given the iOS Reduce Motion setting is enabled on the test device
When the app is opened
Then all spring animations throughout the app are replaced with 150ms opacity-only fades; no scale transforms apply anywhere; atmospheric crossfades shorten to 150ms

**AC7 — 44×44pt minimum touch targets (NFR15)**
Given all interactive elements throughout the app
When measured
Then every tappable element meets 44×44pt minimum touch target; grocery list item rows are 56pt minimum

**AC8 — Confidence indicators use both visual and text (NFR16)**
Given any confidence indicator at any confidence level
When rendered
Then it communicates certainty using both a visual element (icon or colour) AND a text label; colour is never the sole indicator

---

## Tasks / Subtasks

### Task 1: Audit and fix dish image alt text (AC1)

- [x] Audit all `<img>` elements that display dish images across the entire app
- [x] **`src/components/scan/scan-results.tsx` — `DishCard`**: Updated to `alt={dish.description ? \`${dish.name} — ${dish.description}\` : dish.name}`
- [x] **`src/components/scan/dish-detail-sheet.tsx`**: Updated full-bleed 200pt image alt to same descriptive pattern
- [x] **`src/components/scan/processing-strip.tsx`**: `alt="Captured scan"` left unchanged (correct — it's user's photo)
- [x] **`src/components/recipes/recipe-detail.tsx`**: `Recipe` type has no `description` field — `alt={recipe.name}` is correct as-is
- [x] **`src/components/recipes/recipe-card.tsx`**: Same — `Recipe` has no description; `alt={recipe.name}` is correct
- [x] **`src/components/recipes/featured-recipe-card.tsx`**: Same — `alt={recipe.name}` is correct
- [x] **`src/components/search/search-screen.tsx`**: `RestaurantSearchResult` has no description field — `alt={result.name}` is correct
- [x] **`src/components/grocery/grocery-recipe-view.tsx`**: No dish image in grocery view — no change needed
- [x] **`src/app/search/restaurants/[googlePlacesId]/page.tsx`**: No DishCard in search results page — dishes shown differently
- [x] Write unit tests: 2 new tests in `scan-results.test.tsx` + 2 in `dish-detail-sheet.test.tsx` covering format "Name — description" and name-only fallback

### Task 2: Verify evidence block and reference photo labelling (AC2)

- [x] **`src/components/scan/inference-state.tsx`**: Confirmed `alt="Your photo"` and `alt={\`Reference: ${dish.name}\`}` — already compliant
- [x] `<span>` labels are plain text (not `aria-hidden`) — correct
- [x] `EvidenceBlock` text renders as `<p>` — no `aria-hidden` — VoiceOver-readable
- [x] Evidence pills in `<span>` have no `aria-hidden` — readable as-is
- [x] Tests in `inference-state.test.tsx` already cover alt attributes — no new tests needed

### Task 3: Audit bottom sheet modal behaviour (AC3)

- [x] **`src/components/ui/bottom-sheet.tsx`**: Confirmed `role="dialog"`, `aria-modal="true"`, `aria-label={label}`, FocusTrap with `returnFocusOnDeactivate: true` — fully compliant
- [x] Confirmed `dish-detail-sheet.tsx` passes `label={dish?.name ?? 'Dish detail'}` — meaningful label
- [x] `returnFocusOnDeactivate: true` confirmed in `bottom-sheet.tsx`
- [x] Added `aria-modal="true"` test to `bottom-sheet.test.tsx` (existing tests already covered `role="dialog"`, `aria-label`)

### Task 4: Verify processing strip live region (AC4)

- [x] Confirmed `aria-live="polite"` on root `motion.div` — correct
- [x] Confirmed dynamic `aria-label` on same DOM node (no dismount/remount) — live region fires correctly
- [x] Existing tests in `processing-strip.test.tsx` cover `aria-live` and `aria-label` per status

### Task 5: Verify atmospheric contrast gate (AC5)

- [x] `buildTieredBackground` confirmed using `checkWcagContrast` with 4.5:1 threshold on all tiers
- [x] Neutral tier `#0a0a0a` always passes (contrast ~21:1)
- [x] `use-atmospheric.ts` calls `buildTieredBackground` on every palette change
- [x] Existing `atmospheric.test.ts` covers contrast gate — audit only, no code changes needed

### Task 6: Audit and fix Reduce Motion compliance (AC6)

- [x] Audited all `motion.*` components — all use `shouldReduceMotion` guard except `AnimatedEllipsis` and `Spinner`
- [x] `glass-card.tsx` confirmed: `scale: 0.96` only when NOT reduce motion ✓
- [x] `scan-results.tsx` confirmed: no scale/spring animations without guard ✓
- [x] **Fixed** `AnimatedEllipsis` in `processing-strip.tsx`: now returns static `<span>{text}...</span>` when `shouldReduceMotion`
- [x] **Fixed** `Spinner` in `processing-strip.tsx`: now renders static SVG (no `animate`/`transition`) when `shouldReduceMotion`; `ProcessingStrip` passes `shouldReduceMotion` prop down
- [x] Added 4 new reduce-motion tests in `processing-strip.test.tsx` using `vi.hoisted()` + `vi.fn()` pattern for overridable mock

### Task 7: Audit touch target sizes (AC7)

- [x] All tab bar, save/remove, confirm, retake, back buttons confirmed ≥44pt
- [x] `src/app/groceries/page.tsx`: check-off rows have `minHeight: 56px` ✓
- [x] `src/components/grocery/grocery-recipe-view.tsx`: ingredient rows `height: 56` ✓
- [x] `src/components/grocery/grocery-ingredient-view.tsx`: rows `minHeight: 56px` ✓
- [x] `processing-strip.tsx` strip is `height: 56px` — drag target meets 44pt ✓
- [x] No touch target gaps found — audit only, no code changes needed

### Task 8: Add confidence indicators with visual + text (AC8)

- [x] Located all confidence display points: `EvidenceBlock` in `dish-detail-sheet.tsx` and `inference-state.tsx` (intentionally no confidence level — confirmation prompt only)
- [x] **Fixed** `EvidenceBlock` in `dish-detail-sheet.tsx`:
  - High confidence: checkmark SVG (`aria-hidden`) + text "Identified from your scan"
  - Medium confidence: info-circle SVG (`aria-hidden`) + text "Identified from your scan — ingredients match common preparation" + ingredient pills
- [x] `src/app/scan/dish/page.tsx`: Existing ⚠ icon + text for low confidence — already compliant ✓
- [x] No colour-only confidence indicators found
- [x] Added 2 AC8 tests in `dish-detail-sheet.test.tsx` confirming SVG icon + text present for both confidence paths

---

## Dev Notes

### What Already Works (Do NOT Rework)

This story is primarily an **audit and gap-fill**. Most accessibility infrastructure is already in place:

| Concern | Status | Location |
|---|---|---|
| Bottom sheet `role="dialog"` + `aria-modal` | **Already done** | `bottom-sheet.tsx` — `role="dialog" aria-modal="true"` |
| Focus trap on bottom sheet open | **Already done** | `focus-trap-react` in `bottom-sheet.tsx` with `returnFocusOnDeactivate: true` |
| Escape key dismissal | **Already done** | `useEffect` keydown handler in `bottom-sheet.tsx` |
| Processing strip `aria-live` region | **Already done** | `aria-live="polite"` + dynamic `aria-label` on root div |
| Reference photos labelled | **Already done** | `alt="Your photo"` and `alt={\`Reference: ${dish.name}\`}` in `inference-state.tsx` |
| `useReducedMotion` in most components | **Already done** | Bottom sheet, atmospheric bg, processing strip, camera modal, tab bar, FAB, template |
| Atmospheric contrast gate (3-tier fallback) | **Already done** | `buildTieredBackground` in `src/lib/atmospheric.ts` with 4.5:1 WCAG gate |
| Save/Remove button aria-labels | **Already done** | `aria-label` on both buttons in `dish-detail-sheet.tsx` |

### Gaps to Actually Fix

1. **Dish image alt text** — currently `alt={dish.name}` everywhere. Should be `alt={dish.description ? \`${dish.name} — ${dish.description}\` : dish.name}`. This is the most impactful change (AC1).
2. **`AnimatedEllipsis` and `Spinner`** in `processing-strip.tsx` — no reduce-motion guard on infinite animations (AC6).
3. **Confidence indicators** — no visual icon alongside text evidence copy (AC8). `EvidenceBlock` needs a checkmark or info icon.
4. **Grocery list row heights** — verify 56pt minimum (AC7). Touch targets mostly look good elsewhere.

### Architecture References

| Concern | Location |
|---|---|
| Atmospheric contrast logic | `src/lib/atmospheric.ts` — `buildTieredBackground()`, `checkWcagContrast()` |
| Atmospheric hook | `src/hooks/use-atmospheric.ts` — drives `AtmosphericBackground` via context |
| Reduce motion pattern | `framer-motion`'s `useReducedMotion()` — import from `'framer-motion'` |
| Focus trap library | `focus-trap-react` — already installed and used in `bottom-sheet.tsx` |
| Bottom sheet accessibility | `src/components/ui/bottom-sheet.tsx` — all ARIA attributes are on the root `motion.div` |
| Processing strip | `src/components/scan/processing-strip.tsx` |
| Evidence block | `EvidenceBlock` function inside `src/components/scan/dish-detail-sheet.tsx` |
| Inference state photos | `src/components/scan/inference-state.tsx` lines ~75–95 |

### Alt Text Pattern

Apply consistently across all dish image `<img>` elements:

```typescript
// BEFORE (current)
alt={dish.name}

// AFTER (AC1-compliant)
alt={dish.description ? `${dish.name} — ${dish.description}` : dish.name}
```

The description field from Gemini is already a short sentence (e.g., "crispy duck leg with cherry jus"). The combined alt becomes exactly the UX-DR17 example format: "Duck Confit — crispy duck leg with cherry jus".

### AnimatedEllipsis Reduce Motion Fix

```typescript
// BEFORE
function AnimatedEllipsis({ text }: { text: string }) {
  return (
    <span>
      {text}
      <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}>
        ...
      </motion.span>
    </span>
  )
}

// AFTER — add useReducedMotion check
function AnimatedEllipsis({ text }: { text: string }) {
  const shouldReduceMotion = useReducedMotion()
  if (shouldReduceMotion) {
    return <span>{text}...</span>
  }
  return (
    <span>
      {text}
      <motion.span animate={{ opacity: [1, 0, 1] }} transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}>
        ...
      </motion.span>
    </span>
  )
}
```

Similarly for `Spinner` — when `shouldReduceMotion` is true, render a static SVG (no `animate` or `transition` prop):

```typescript
function Spinner({ shouldReduceMotion }: { shouldReduceMotion: boolean }) {
  if (shouldReduceMotion) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round" aria-hidden="true" style={{ flexShrink: 0 }}>
        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
      </svg>
    )
  }
  return (
    <motion.svg ... animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} ...>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </motion.svg>
  )
}
```

Pass `shouldReduceMotion` down from `ProcessingStrip` (which already calls `useReducedMotion()`).

### Confidence Indicator Icon Pattern (AC8)

The `EvidenceBlock` function in `dish-detail-sheet.tsx` needs a visual icon to accompany confidence text. Keep styling consistent with existing design tokens:

```typescript
// High confidence path — add a checkmark icon before the text
return (
  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 'var(--spacing-2) 0' }}>
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0 }}>
      Identified from your scan{calorieText}
    </p>
  </div>
)

// Medium confidence path — add an info icon
// Use ● (filled circle) or an info SVG at 12×12
```

The icon is `aria-hidden="true"` because the text already conveys the meaning — the icon is purely visual reinforcement per AC8 (colour/visual is never the SOLE indicator).

### Grocery List Touch Target Check

Confirm in `src/app/groceries/page.tsx` that each check-off row has `minHeight: 56px` (or equivalent Tailwind class). The architecture NFR15 specifies 56pt minimum for grocery rows. If rows are shorter, add:

```typescript
style={{ minHeight: '56px', display: 'flex', alignItems: 'center' }}
```

### Testing Setup Notes

- `useReducedMotion` is mocked in every existing test file as `vi.mock('framer-motion', () => ({ useReducedMotion: () => false, ... }))`. For reduce-motion tests, add a second `describe` block with `useReducedMotion: () => true`.
- `jsdom` does not support `matchMedia` — the `src/test/setup.ts` polyfill handles this. Do not add a separate polyfill.
- Pattern for testing `AnimatedEllipsis` with reduce motion:
  ```typescript
  vi.mocked(useReducedMotion).mockReturnValue(true)
  // then assert static "..." text renders, no motion.span
  ```

### File Locations

| File | AC | Action |
|---|---|---|
| `src/components/scan/dish-detail-sheet.tsx` | AC1, AC2, AC8 | Update alt text, audit evidence block, add confidence icon |
| `src/components/scan/scan-results.tsx` | AC1 | Update DishCard alt text |
| `src/components/scan/processing-strip.tsx` | AC4, AC6 | Verify aria-live (already done); fix AnimatedEllipsis + Spinner for reduce motion |
| `src/components/scan/inference-state.tsx` | AC2 | Verify reference photo labels (already done — confirm only) |
| `src/components/ui/bottom-sheet.tsx` | AC3 | Verify modal behaviour (already done — confirm only) |
| `src/lib/atmospheric.ts` | AC5 | Verify contrast gate (already done — confirm only) |
| `src/app/groceries/page.tsx` | AC7 | Verify 56pt row heights |
| `src/components/recipes/recipe-detail.tsx` | AC1 | Update alt text if description available |
| `src/components/recipes/recipe-card.tsx` | AC1 | Update alt text if description available |
| `src/components/recipes/featured-recipe-card.tsx` | AC1 | Update alt text if description available |
| `src/components/search/search-screen.tsx` | AC1 | Update alt text if description available |
| `src/app/scan/dish/page.tsx` | AC8 | Check confidence display |

### Regression Risk

1. **Alt text change** — changing `alt={dish.name}` to the descriptive format is a low-risk visual-only change. Existing tests that assert `alt={dish.name}` will need to be updated to match the new format.
2. **AnimatedEllipsis / Spinner** — adding `useReducedMotion()` to these internal functions is backward-compatible. Test mocks in `processing-strip.test.tsx` already set `useReducedMotion: () => false` so existing tests are unaffected.
3. **EvidenceBlock icon addition** — adding a wrapper `<div>` around the existing `<p>` is safe. Tests asserting text content will still pass. Tests that assert exact DOM structure (`.textContent`) may need minor updates.
4. **Bottom sheet** — confirmed fully compliant. Do NOT change its ARIA structure.

### Cross-Story Context

| Story | Relationship |
|---|---|
| **2.3** — DishDetailSheet origin | `DishDetailSheet` and `EvidenceBlock` were created here. This story audits and enhances them for AC1/AC8. |
| **2.4/2.5** — Processing strip | `ProcessingStrip` was built for async confidence enrichment. This story adds reduce-motion fix for infinite animations. |
| **1.3** — Atmospheric background | `AtmosphericBackground` + `src/lib/atmospheric.ts` contrast gate was built here. AC5 is a verification pass. |
| **1.2** — Glass component library | `BottomSheet` and `GlassCard` were built here with `useReducedMotion`. AC3/AC6 are verification passes. |
| **4.2** — Grocery list | The ingredient/item check-off rows were built here. AC7 grocery row height audit targets this work. |

### What This Story Does NOT Change

- `src/components/ui/bottom-sheet.tsx` — fully compliant; only add tests, no code changes
- `src/lib/atmospheric.ts` — contrast gate already correct; only add tests if missing
- `src/hooks/use-atmospheric.ts` — no changes
- Any API routes — accessibility is purely frontend
- Database schema — no changes
- `src/integrations/supabase/types.ts` — no changes

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
- Pre-existing test failures confirmed: `scan-results.test.tsx` undo-toast tests (2), `recipe-detail.test.tsx` nutrition panel tests (3), `grocery-recipe-view.test.tsx` empty state test (1) — all fail on unmodified main branch; not caused by this story.

### Completion Notes List
- `Recipe` type has no `description` field; recipe card/detail alt text stays `alt={recipe.name}` — correct as-is.
- `RestaurantSearchResult` has no description field; restaurant image alt stays `alt={result.name}`.
- `inference-state.tsx` intentionally has no confidence level displayed — it's a confirmation prompt, not a result display.
- `src/app/scan/dish/page.tsx` was already AC8-compliant with ⚠ icon + text for low confidence.
- Refactored `useReducedMotion` mock in `processing-strip.test.tsx` from inline `() => false` to `vi.hoisted()` + `vi.fn()` pattern to enable per-test overrides for reduce-motion tests.
- 83 story-relevant tests pass; 6 pre-existing failures are unchanged.

### File List

**Modified (code changes):**
- `src/components/scan/scan-results.tsx` — DishCard alt text: `dish.name` → descriptive pattern (AC1)
- `src/components/scan/dish-detail-sheet.tsx` — full-bleed image alt + EvidenceBlock confidence icons (AC1, AC8)
- `src/components/scan/processing-strip.tsx` — AnimatedEllipsis + Spinner reduce-motion guards (AC6)

**Modified (tests only):**
- `src/components/scan/scan-results.test.tsx` — updated enrichment test name + 2 new alt text tests
- `src/components/scan/dish-detail-sheet.test.tsx` — 2 alt text tests (AC1) + 2 confidence icon tests (AC8)
- `src/components/scan/processing-strip.test.tsx` — refactored mock + 4 reduce-motion tests (AC6)
- `src/components/ui/bottom-sheet.test.tsx` — 1 aria-modal test (AC3)

**Verified only (no code changes):**
- `src/components/ui/bottom-sheet.tsx` — role/aria-modal/FocusTrap already compliant (AC3)
- `src/lib/atmospheric.ts` — contrast gate already correct (AC5)
- `src/components/scan/inference-state.tsx` — reference photo labels already correct (AC2)
- `src/components/grocery/grocery-recipe-view.tsx` — 56pt rows confirmed (AC7)
- `src/components/grocery/grocery-ingredient-view.tsx` — 56pt rows confirmed (AC7)
- `src/app/scan/dish/page.tsx` — ⚠ icon + text already present (AC8)

---

## Known Deferred Issues

### D3 — AC4: `aria-label` mutation on live region may not reliably fire announcements

~~**Deferred:** 2026-03-28 (code review)~~ **Resolved:** 2026-03-29

The processing strip uses `aria-live="polite"` on its wrapper `motion.div` with a changing `aria-label` attribute (`"Identifying your menu"` → `"Your results are ready"`). ARIA live regions announce changes to their **text content**, not to their own `aria-label` attribute. Screen reader behaviour on `aria-label` mutations is not universally reliable across VoiceOver/TalkBack implementations.

**Correct fix:** Remove `aria-label` from the wrapper and instead place the status text as visible text content inside a dedicated `aria-live="polite"` child element. This requires restructuring the ProcessingStrip layout and updating existing tests.

**Why deferred:** The existing implementation was already in place before Story 6.1 (AC4 was audit-only). Fixing it requires non-trivial layout restructure — tracked here for a future accessibility story.

---

## Change Log

- 2026-03-28: Story 6.1 created — accessibility audit and screen reader support
- 2026-03-28: Story 6.1 implemented — all 8 tasks complete; status → review
- 2026-03-28: Code review patches applied — P1 (unused import), P2 (.trim() on description), D2 (calorieEstimate !== null guard), D4 (formatDishAlt shared util); D3 documented as deferred
- 2026-03-29: D3 resolved — moved aria-live="polite" from wrapper to text content div; removed aria-label from wrapper
