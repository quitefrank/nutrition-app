# Story 2.7: Scan Confidence Indicator

Status: review
Epic: 2 — Menu Scan & Dish Auto-Capture
Story ID: 2.7
Story Key: 2-7-scan-confidence-indicator
Created: 2026-04-12

---

## Story

As a user,
I want to see how many dishes from my menu were successfully recognised immediately after scanning,
So that I know if the capture was complete or if some dishes were missed.

---

## Acceptance Criteria

**AC1 — Confidence summary always visible after scan**
**Given** the scan completes and dishes are auto-captured
**When** the restaurant dish list renders
**Then** the recognised/total count is available (e.g. "8 of 10 dishes read")

**AC2 — All dishes recognised → no banner**
**Given** all detected dishes were recognised (totalDetected === recognisedCount)
**When** the confidence indicator renders
**Then** no `ScanConfidenceBanner` is shown; no recovery prompt appears

**AC3 — Partial recognition → ScanConfidenceBanner shown**
**Given** one or more dishes were not recognised (recognisedCount < totalDetected)
**When** the restaurant dish list renders
**Then** `ScanConfidenceBanner` is visible with amber tint surface, count text, and 3 recovery action buttons; unrecognised slots do NOT appear as empty cards or skeletons

**AC4 — Accessibility**
**Given** the `ScanConfidenceBanner` is visible
**When** inspected for accessibility
**Then** it has `role="alert"` and `aria-live="assertive"` so VoiceOver announces it immediately on appearance

**AC5 — Scan path only**
**Given** a restaurant was reached via the search path (not camera scan)
**When** the dish list renders
**Then** no `ScanConfidenceBanner` is shown (no `totalDetected` data available)

---

## Tasks / Subtasks

- [x] Task 1: Extend scan API response with `totalDetected` (AC1)
  - [x] 1.1 In `src/app/api/scan/route.ts`, capture `validatedCount = validated.data.dishes.length` BEFORE the name-filter step
  - [x] 1.2 Add `totalDetected: validatedCount` alongside `dishes` in the success `{ data: ... }` response
  - [x] 1.3 Update the route's Zod success type / any TypeScript return type annotations

- [x] Task 2: Persist `totalDetected` through the session storage scan result (AC1, AC5)
  - [x] 2.1 Locate the sessionStorage write path (search for `sessionStorage.setItem` near scan key writes in `CameraModal.tsx` or related helpers)
  - [x] 2.2 Add `totalDetected` to the persisted scan result object
  - [x] 2.3 Locate `loadRecipesForRestaurant` (or equivalent reader) and surface `totalDetected` to `RestaurantScreen`

- [x] Task 3: Create `ScanConfidenceBanner` component (AC2, AC3, AC4)
  - [x] 3.1 Create `src/components/scan/ScanConfidenceBanner.tsx`
  - [x] 3.2 Props: `recognisedCount: number`, `totalDetected: number`, `onRetake: () => void`, `onAddManually: () => void`, `onContinue: () => void`
  - [x] 3.3 Primary text: `"{recognisedCount} of {totalDetected} dishes read"`
  - [x] 3.4 Secondary text: `"{totalDetected - recognisedCount} couldn't be identified"`
  - [x] 3.5 Three action buttons: "Retake photo", "Add manually", "Continue with {recognisedCount}" — wire to props (stubs; implementations in stories 6.2 / 6.3)
  - [x] 3.6 Visual: amber tint `bg-[rgba(251,243,226,0.95)]`, rounded top corners, positioned at bottom of content area above nav bar
  - [x] 3.7 Framer Motion spring animation: slides up from translateY(100%) → translateY(0), `stiffness: 380, damping: 24`
  - [x] 3.8 Reduced motion: `@media (prefers-reduced-motion: reduce)` → opacity fade only, no translateY (mirror the pattern in `AnimationSystem` / existing components)
  - [x] 3.9 Add `role="alert"` and `aria-live="assertive"` to the root element

- [x] Task 4: Wire `ScanConfidenceBanner` into `RestaurantScreen` (AC2, AC3, AC5)
  - [x] 4.1 Read `totalDetected` from session storage scan result (available after Task 2)
  - [x] 4.2 Derive `recognisedCount` from the rendered dish list length (Supabase-backed + session-backed dishes)
  - [x] 4.3 Conditionally render `ScanConfidenceBanner` only when `totalDetected > 0 && recognisedCount < totalDetected`
  - [x] 4.4 Pass stub callbacks for recovery actions (console.warn is fine; full impls are Epic 6)
  - [x] 4.5 Position banner inside the scroll area at the bottom, above `FloatingNavBar` — do not overlap the tab bar

- [x] Task 5: Tests (AC1–AC5)
  - [x] 5.1 Create `src/components/scan/ScanConfidenceBanner.test.tsx`
    - [x] Renders with correct count text ("8 of 10 dishes read")
    - [x] Renders secondary text ("2 couldn't be identified")
    - [x] Has `role="alert"` attribute
    - [x] Has `aria-live="assertive"` attribute
    - [x] Calls `onRetake` when "Retake photo" pressed
    - [x] Calls `onAddManually` when "Add manually" pressed
    - [x] Calls `onContinue` when "Continue with 8" pressed
  - [x] 5.2 Update `src/app/api/scan/route.test.ts`
    - [x] Assert `totalDetected` is present in the success response `data`
    - [x] Assert `totalDetected >= dishes.length` (can't have more recognised than detected)
    - [x] Assert empty-named dishes count in `totalDetected` but are filtered from `dishes`

---

## Dev Notes

### Critical Data Flow

```
POST /api/scan
  Gemini returns N dish entries
  → validated.data.dishes.length  ← totalDetected (capture BEFORE filter)
  → validDishes = filter(d => d.name.trim().length > 0)
  → return { data: { type, restaurantName, dishes: validDishes, totalDetected } }
         ↑ ADD THIS FIELD
```

`totalDetected` is the raw Gemini dish count — it includes partially parsed entries (empty name = unrecognised). The client uses `totalDetected - dishes.length` to know how many were missed.

### Files to Touch

| File | Change |
|------|--------|
| `src/app/api/scan/route.ts` | Add `totalDetected` to success response |
| sessionStorage write path (find via grep) | Persist `totalDetected` in scan result object |
| `loadRecipesForRestaurant` or session reader | Surface `totalDetected` to RestaurantScreen |
| `src/components/screens/RestaurantScreen.tsx` | Read `totalDetected`, conditionally render banner |
| `src/components/scan/ScanConfidenceBanner.tsx` | **CREATE** — new component |
| `src/components/scan/ScanConfidenceBanner.test.tsx` | **CREATE** — co-located tests |
| `src/app/api/scan/route.test.ts` | Assert `totalDetected` in response |

**DO NOT touch:** `src/app/api/scan/enrich/route.ts`, `src/lib/api-keys.ts`, `src/lib/supabase.ts`, `src/types/database.ts`, `src/components/capture/CameraModal.tsx` (unless it's the sessionStorage write path — check first)

### Story 2.8 Coexistence

Story 2-8 (currently in-progress) explicitly does **not** touch `src/app/api/scan/route.ts` — it targets `enrich/route.ts` only. There is no conflict. However, 2-8 will standardise the `{ data: T }` success envelope — the `totalDetected` field must live inside `data`, which it already does in this story's design.

### ScanConfidenceBanner — Component Contract

```tsx
// src/components/scan/ScanConfidenceBanner.tsx
interface ScanConfidenceBannerProps {
  recognisedCount: number;
  totalDetected: number;
  onRetake: () => void;
  onAddManually: () => void;
  onContinue: () => void;
}
```

Visual spec (from UX-DR12):
- Background: `rgba(251,243,226,0.95)` (warm amber)
- Position: slides up from bottom of restaurant screen content, above nav bar
- Spring: `stiffness: 380, damping: 24` (matches `AutoCaptureToast` spring values — check that component for the exact Framer Motion pattern)
- Reduced motion: opacity only, no `y` transform (check existing `AnimationSystem` or `AutoCaptureToast` for the `useReducedMotion()` hook pattern)
- `role="alert"` + `aria-live="assertive"` — NOT `polite`; assertive is intentional so VoiceOver announces immediately

Recovery buttons are **stubs** in this story. Do NOT implement retake/manual-entry logic. Pass the callbacks through and let the caller no-op. Stories 6.2 and 6.3 own those flows.

### Suppressed Dishes — Don't Break DishRowCompact

`DishRowCompact` already filters `photoStatus === "suppressed"` (line ~42). This is about Places photo enrichment, not scan recognition. Do NOT conflate these two concepts:
- `suppressed` photoStatus = Supabase enrichment path, dish hidden in card list
- `totalDetected > recognisedCount` = scan-time miss, shown as banner count only

Unrecognised dishes from the scan never reach Supabase (they were filtered before saving), so they will never appear as suppressed cards. The banner is the only UI surface for scan-time misses.

### Scan Path vs. Search Path

`RestaurantScreen` serves both scan-path (camera → auto-capture) and search-path (restaurant name search) restaurants. The `ScanConfidenceBanner` must only show for scan-path results.

Guard: only render the banner if `totalDetected > 0`. For search-path restaurants, `totalDetected` will be `undefined` or `0` in session storage, so the guard naturally suppresses the banner.

### Architecture Constraints

- **No Zustand / Redux.** `totalDetected` from session is local state: `useState<number>(0)`, populated in a `useEffect` that reads session storage (same pattern as existing recipe loading in `RestaurantScreen`).
- **TanStack Query** is for server state only — `totalDetected` is ephemeral scan session data, do not put it in a query.
- **Framer Motion** already in the project — use it for the slide-up animation. Check `AutoCaptureToast` for the exact spring/exit pattern to stay consistent.
- **`import 'server-only'`** must remain at top of scan route — do not remove.
- Tests co-located with source (`*.test.tsx` next to the component file).

### Testing Approach

Follow the pattern from `src/components/scan/AutoCaptureToast.test.tsx` (already exists). That test validates render, text content, and button interactions using React Testing Library — mirror that approach for `ScanConfidenceBanner.test.tsx`.

For `route.test.ts`, check the existing scan route test (`src/app/api/scan/route.test.ts`) for the mock pattern used for `GoogleGenerativeAI`. Add assertions for `totalDetected` on the existing success cases.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

No blockers. All five tasks completed in a single pass.

### Completion Notes List

- **Task 1**: Added `totalDetected` to `/api/scan` response. Captured `validated.data.dishes.length` immediately after Zod parse, before the empty-name filter. This ensures the count includes partially-parsed entries (Gemini edge cases with blank names) — the gap between `totalDetected` and `dishes.length` tells the client how many dishes were unrecognised.

- **Task 2**: Updated `ScanResult` interface in `InferenceState.tsx` with optional `totalDetected?: number`. CameraModal now reads `data.totalDetected` from the scan API response and writes it to session storage as part of `initialResult`. Added `loadTotalDetected(placeId)` helper to `RestaurantScreen` (mirrors `loadMenuPhotoUrl` pattern) and wired it into the session storage `useEffect` via new `totalDetected` state.

- **Task 3**: Created `ScanConfidenceBanner.tsx`. Uses `useReducedMotion` hook from framer-motion — reduced motion path gives an opacity-only fade; default path slides up from `y: "100%"` with spring `stiffness: 380, damping: 24` (matches `SPRING_MODAL_ENTER` constants). Root element has `role="alert"` and `aria-live="assertive"`. Three recovery buttons are stubs (`console.warn`) — Epic 6 owns the implementations.

- **Task 4**: Wired banner into `RestaurantScreen` wrapped in `AnimatePresence` for the spring enter/exit. Guard condition: `totalDetected > 0 && recipes.length < totalDetected`. `recognisedCount = recipes.length` (merged Supabase + session list). AC5 (search path suppression) works naturally: search-path entries have no `totalDetected` in session storage, so `loadTotalDetected` returns 0 and the banner never renders.

- **Task 5**: 9 tests in `ScanConfidenceBanner.test.tsx` (all AC1-AC5 assertions from the story). 4 new tests in `route.test.ts` covering `totalDetected` presence, `>= dishes.length` invariant, and the empty-name filter case. Full suite: 263 tests, 0 failures.

### File List

- `src/app/api/scan/route.ts` — Added `totalDetected` capture + response field
- `src/app/api/scan/route.test.ts` — Added `totalDetected` test group (4 tests)
- `src/components/scan/InferenceState.tsx` — Added `totalDetected?: number` to `ScanResult` interface
- `src/components/capture/CameraModal.tsx` — Read `totalDetected` from API response; persist in `initialResult`
- `src/components/screens/RestaurantScreen.tsx` — Added `loadTotalDetected` helper, `totalDetected` state, banner render
- `src/components/scan/ScanConfidenceBanner.tsx` — **NEW** — banner component
- `src/components/scan/ScanConfidenceBanner.test.tsx` — **NEW** — 9 component tests

---

## Change Log

- 2026-04-12 — Story implemented. Added `totalDetected` to `/api/scan` response, persisted through session storage via `ScanResult`, surfaced to `RestaurantScreen` via `loadTotalDetected` helper. Created `ScanConfidenceBanner` component with Framer Motion spring animation, reduced-motion support, and ARIA alert semantics. Wired into `RestaurantScreen` with guard condition `totalDetected > 0 && recipes.length < totalDetected`. 263 tests passing, 0 regressions.
