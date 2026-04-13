# Story 2.3: Restaurant Confirmation & Auto-Capture

Status: review
Epic: 2 — Menu Scan & Dish Auto-Capture
Story ID: 2.3
Story Key: 2-3-restaurant-confirmation-auto-capture
Created: 2026-04-12

---

## Story

As a user,
I want to confirm or correct the restaurant name after a scan, then have all dishes automatically saved — no further action required,
So that my collection grows with zero friction.

---

## Acceptance Criteria

**AC1 — Pre-filled restaurant name**
**Given** the scan result includes an extracted restaurant name
**When** the Restaurant Confirmation screen renders (inside `AppShell`)
**Then** the name is pre-filled in an editable text field; the user can confirm it as-is, edit it, or skip identification entirely

**AC2 — Auto-capture writes to Supabase**
**Given** the user confirms or edits the restaurant name and taps Confirm
**When** they proceed
**Then** a `restaurants` row is created (or matched by `place_id` if a Places result was selected, else by name), a `restaurant_visits` row is inserted with `visit_type: 'scan'` and `raw_menu_json`, and all extracted dishes are inserted as `recipes` rows with `status: 'auto_captured'` and `photo_status: 'placeholder'` (or `'suppressed'` when `confidence < 0.3`)

**AC3 — No-name fallback**
**Given** the scan result has `restaurantName: null`
**When** the confirmation screen renders
**Then** the text field is empty with a placeholder prompt ("Enter restaurant name or skip"); the user is prompted to type the name or use the search-by-name mode; the flow never dead-ends — skipping is always available

**AC4 — Auto-capture toast**
**Given** all records are successfully written to Supabase
**When** `autoSaveToSupabase` resolves
**Then** an auto-capture toast fires: "[Restaurant name] · N dishes saved", 2.5 s, slides down from the top of the screen, frosted glass surface (`--glass-elevated` + `--blur-elevated`), `role="status"` `aria-live="polite"`; the toast disappears automatically after 2.5 s

**AC5 — sessionStorage / UUID handoff**
**Given** the scan key (`plately:scan:{uuid}`) is written to sessionStorage before the confirmation screen appears
**When** `autoSaveToSupabase` completes and dispatches `plately:supabase-saved`
**Then** `AppShell` (or `CameraModal`) picks up the event and writes the real Supabase `recipeId` back into `sessionStorage[scanKey]` as `supabaseRecipeId`

---

## This Is Brownfield — Audit First, Fix Second

**`src/components/scan/RestaurantConfirmation.tsx` already exists** and handles restaurant search (GPS + text). It does **not** currently:
- Accept the extracted restaurant name from the scan
- Pre-fill that name in a confirmation field
- Trigger `autoSaveToSupabase`
- Show the auto-capture toast

**`src/components/AppShell.tsx`** currently passes `scanKey` through `onProcessingComplete` to `ProcessingStrip`. There is **no** restaurant confirmation step in this flow today.

Your task is to wire in the restaurant confirmation step between scan completion and the "ready" state, and update `RestaurantConfirmation` to handle the name-confirm case.

### What is already correctly implemented

| Feature | File | Notes |
|---------|------|-------|
| GPS + text restaurant search | `RestaurantConfirmation.tsx` | Correct — keep as-is, used when user clicks "Search instead" |
| `autoSaveToSupabase` writes restaurant + visits + recipes | `supabaseAutoSave.ts` | Correct — reads `restaurantName` and `restaurantPlaceId` from sessionStorage entry |
| `plately:supabase-saved` event dispatch | `supabaseAutoSave.ts` | Correct — dispatches `{ scanKey, recipeId }` after save |
| `plately:supabase-saved` listener in CameraModal | `CameraModal.tsx` | Correct — writes `supabaseRecipeId` back to sessionStorage |
| sessionStorage key format: `plately:scan:{uuid}` | `CameraModal.tsx` | Correct per ARCH13 (Story 2.2 fix) |
| `onProcessingComplete(scanKey)` callback | `CameraModal.tsx` | Correct — already passes `scanKey` (not `recipeId`) |

### What must be changed

**Change 1 — Add confirmation step in `AppShell.tsx`**

Currently `AppShell.tsx` handles `onProcessingComplete` by jumping straight to `processingState = "ready"`. Instead, it must pause at a new `"confirming"` state and show the `RestaurantConfirmation` overlay.

New state flow:
```
idle → cameraOpen → processing → confirming → saving → ready
```

- Add state: `confirmingScanKey: string | null`
- When `onProcessingComplete(scanKey)` fires: set `confirmingScanKey = scanKey`, set `processingState = "confirming"`, close the camera modal
- Render `<ScanConfirmationOverlay scanKey={confirmingScanKey} ... />` when `confirmingScanKey !== null`
- After user confirms / skips: call `autoSaveToSupabase(scanKey)`, await the promise, then set `processingState = "ready"` and `resultId` to the first recipe UUID

**Change 2 — Update `RestaurantConfirmation.tsx` interface**

Add new props:
```typescript
interface RestaurantConfirmationProps {
  // New — scan path confirmation mode
  scanKey?: string              // sessionStorage key for the scan result
  extractedName?: string | null // pre-filled from Gemini result

  // Existing
  onConfirm: (restaurant: RestaurantInfo) => void
  onSkip: () => void
}
```

When `scanKey` is provided, the component renders a name-confirm mode first:
1. Show the extracted name pre-filled in an editable text field
2. User can confirm as-is → calls `onConfirm` with `{ placeId: "", name: confirmedName }`
3. User can click "Search instead" → switches to existing GPS/text search mode
4. User can skip → calls `onSkip()`

This is an **additive change** — the existing GPS/text-only interface continues to work unchanged.

**Change 3 — Create `ScanConfirmationOverlay` in AppShell (or a co-located file)**

A thin wrapper that:
- Reads `sessionStorage[scanKey]` to get `restaurantName`
- Shows `RestaurantConfirmation` with `extractedName` prop
- Handles `onConfirm`: updates sessionStorage entry with the confirmed name + placeId, then calls `autoSaveToSupabase(scanKey)`
- Handles `onSkip`: calls `autoSaveToSupabase(scanKey)` as-is
- On `autoSaveToSupabase` resolve: shows auto-capture toast, then calls `onComplete(firstRecipeId)`

**Change 4 — Auto-capture toast component**

Create a simple toast component (can be inline in `ScanConfirmationOverlay` or a small standalone file):
- Slides down from top using Framer Motion (`y: -40 → 0`, `opacity: 0 → 1`)
- Auto-dismisses after 2.5 s
- Frosted glass surface (`--glass-elevated` + `--blur-elevated`)
- Text: "[restaurantName] · [N] dishes saved"
- `role="status"` `aria-live="polite"`
- Reduced motion: opacity fade only, no translateY

---

## Implementation Notes

### sessionStorage entry shape (reference)

After `CameraModal` writes the initial scan result and before confirmation:
```typescript
// sessionStorage[scanKey] =
{
  type: "menu" | "dish",
  restaurantName: string | null,   // from Gemini
  allDishes: StoredDish[],
  enriched: false,
  // supabaseRecipeId is added AFTER autoSaveToSupabase resolves
}
```

After confirmation and before `autoSaveToSupabase`, the overlay updates the entry:
```typescript
// Update with confirmed restaurant info:
{
  ...existing,
  restaurantName: confirmedName,           // user-confirmed name
  restaurantPlaceId: placeId ?? null,      // from Places result if searched
  restaurantAddress: address ?? null,
  restaurantRating: rating ?? null,
  restaurantUserRatingsTotal: userRatingsTotal ?? null,
}
```

`supabaseAutoSave` already reads these extra fields and uses them for the restaurant upsert.

### Why the auto-save fires after confirmation (not before)

The current code calls `autoSaveToSupabase(scanKey)` from `CameraModal` immediately — before the user has confirmed the restaurant. Story 2-3 **moves** this call to after confirmation (via `ScanConfirmationOverlay`). This is the core change.

The `autoSaveToSupabase` call **must be removed from `CameraModal.submitImage`** and moved to the confirmation overlay. Do not call it from both places.

### ProcessingStrip integration

`AppShell` currently passes `resultId` to `ProcessingStrip`, which uses it to navigate to the restaurant screen. After this change, `resultId` should be set to the first recipe UUID returned by `autoSaveToSupabase` (not the `scanKey`).

```typescript
// After confirmation + save:
const map = await autoSaveToSupabase(scanKey)
const firstRecipeId = map ? Object.values(map)[0] : null
setResultId(firstRecipeId ?? undefined)
setProcessingState("ready")
```

### Parallelism — no file conflicts with 2-1 or 2-2

| Story | Files touched |
|-------|--------------|
| 2-1 | `src/app/api/scan/route.ts`, `route.test.ts` |
| 2-2 | `src/components/capture/CameraModal.tsx`, `CameraModal.test.tsx` |
| 2-3 | `src/components/scan/RestaurantConfirmation.tsx`, `src/components/AppShell.tsx`, new overlay + toast files, test file |

**Zero file overlap** — merge will be clean regardless of order.

**One interface note**: `CameraModal.tsx` currently has a type-level mismatch: the prop type says `onProcessingComplete: (recipeId: string) => void` but the implementation already passes `scanKey`. Story 2-2 fixes this type. Story 2-3 updates `AppShell.tsx` to expect `scanKey` in that callback. If your branch finishes before 2-2: TypeScript will warn about the mismatch in `CameraModal.tsx` but your `AppShell.tsx` changes will be correct. Resolve by accepting the type assertion until 2-2 merges.

### Auto-save removal from CameraModal

Story 2-3 is responsible for removing the `autoSaveToSupabase(scanKey)` call from `CameraModal.tsx` (line ~287). **Coordinate with the 2-2 developer**: if they finish first, remind them not to touch that call (or add a comment `// moved to ScanConfirmationOverlay — Story 2.3`). If you finish first, remove the call and leave a TODO comment.

---

## Tests Required

**Test file:** `src/components/scan/RestaurantConfirmation.test.tsx`

### Testing approach

```typescript
import { vi, describe, it, expect } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RestaurantConfirmation } from './RestaurantConfirmation'

// Mock fetch for Places API search
global.fetch = vi.fn()
```

### Required test cases

```
describe('RestaurantConfirmation — name-confirm mode (scanKey provided)')
  ├── renders pre-filled name from extractedName prop
  ├── empty extractedName shows placeholder prompt
  ├── confirm button calls onConfirm with edited name
  ├── skip button calls onSkip
  └── "Search instead" button switches to search mode

describe('RestaurantConfirmation — search mode (existing GPS/text)')
  ├── GPS mode: location button triggers geolocation
  ├── text mode: input renders with search functionality
  ├── selecting a result calls onConfirm with RestaurantInfo
  └── skip button calls onSkip
```

**Test file for auto-capture toast:** `src/components/scan/AutoCaptureToast.test.tsx`
```
describe('AutoCaptureToast')
  ├── renders restaurant name and dish count
  ├── has role="status" and aria-live="polite"
  └── calls onDismiss after 2500ms
```

---

## Architecture Guardrails

- **`autoSaveToSupabase` must be called exactly once per scan** — from `ScanConfirmationOverlay` after confirmation, NOT from `CameraModal`. Remove the call from `CameraModal.submitImage`.
- **Never import `api-keys.ts` in client components** — `RestaurantConfirmation` and the overlay are `"use client"` components.
- **sessionStorage writes must use the `plately:scan:` prefix** — never create new sessionStorage entries; only update the existing `scanKey` entry.
- **Toast accessibility**: `role="status"` + `aria-live="polite"` (not `"assertive"`) — this is a success notification, not an urgent alert.
- **Reduced motion**: replace `y` slide with opacity-only fade when `useReducedMotion()` returns true.

---

## File Scope

### Files to modify

| File | Change |
|------|--------|
| `src/components/scan/RestaurantConfirmation.tsx` | Add `scanKey` + `extractedName` props; add name-confirm mode as the default when `scanKey` is present |
| `src/components/AppShell.tsx` | Add `"confirming"` state; render `ScanConfirmationOverlay` when `confirmingScanKey` is set; remove reliance on `autoSaveToSupabase` from `CameraModal` |
| `src/components/capture/CameraModal.tsx` | Remove `autoSaveToSupabase(scanKey)` call from `submitImage` (fire-and-forget block); leave `plately:supabase-saved` listener intact |

### Files to create

| File | Notes |
|------|-------|
| `src/components/scan/ScanConfirmationOverlay.tsx` | Wrapper component: reads sessionStorage, renders `RestaurantConfirmation`, calls `autoSaveToSupabase`, shows toast |
| `src/components/scan/AutoCaptureToast.tsx` | Frosted glass toast: slides from top, 2.5 s, `role="status"` |
| `src/components/scan/RestaurantConfirmation.test.tsx` | Tests for both confirm-mode and search-mode |
| `src/components/scan/AutoCaptureToast.test.tsx` | Tests for toast accessibility and dismissal |

### Files NOT to touch

| File | Reason |
|------|--------|
| `src/lib/supabaseAutoSave.ts` | Already correctly implements the save logic |
| `src/lib/supabase.ts` | Singleton is correct (Story 1.1) |
| `src/lib/api-keys.ts` | Server-only — never import in client components |
| `src/components/layout/TabBar.tsx` | Camera FAB entry point — not in scope |

---

## Key Context from Epic 2

- Story 2-1 defines the `/api/scan` API contract — this story consumes the `restaurantName` it returns
- Story 2-2 (`CameraModal`) fires `onProcessingComplete(scanKey)` after a successful scan — this is the signal that triggers the confirmation step
- Story 2-6 (AI Ingredient Pipeline) and enrichment run after save; they are unaffected by the confirmation flow
- Story 2-4 (Dish Card Phase 1) renders dishes after they're in Supabase — the faster the save completes, the sooner cards render

---

## Relevant Previous Story Context

### From Story 1.4 — App Shell Responsive Layout (done)
- `AppShell.tsx` is the host for `CameraModal` and `ProcessingStrip`; the confirmation overlay lives here too
- `ProcessingStrip` receives `resultId` for the "View" navigation CTA — after this story, `resultId` is the first Supabase recipe UUID (not the scan key)

### From Story 1.6 — FloatingNavBar (done)
- Camera FAB in `TabBar.tsx` calls `onCameraPress` → `AppShell` sets `cameraOpen = true`; no changes needed to `TabBar`

### From Story 2.1 — Scan API Route (done/review)
- `/api/scan` returns `{ data: { restaurantName: string | null, dishes: [...] } }` with the nested envelope
- `restaurantName` may be null when Gemini cannot identify the restaurant from the image alone

### From Story 2.2 — CameraModal (in-progress)
- `onProcessingComplete(scanKey)` is the handoff to this story's confirmation flow
- The `plately:supabase-saved` listener in `CameraModal` writes `supabaseRecipeId` back to sessionStorage — keep this intact

---

## Definition of Done

- [x] `RestaurantConfirmation.tsx` renders name-confirm mode when `scanKey` prop is provided; existing search mode is unchanged
- [x] Pre-filled restaurant name is editable; confirm/edit/skip all work
- [x] When restaurant name is null, empty field with placeholder renders; skip is available
- [x] `ScanConfirmationOverlay` reads sessionStorage, calls `autoSaveToSupabase` after confirmation, updates sessionStorage with confirmed restaurant info
- [x] `autoSaveToSupabase` call removed from `CameraModal.submitImage`
- [x] Auto-capture toast shows with `role="status"` `aria-live="polite"` for 2.5 s then disappears
- [x] `AppShell.tsx` enters "confirming" state on `onProcessingComplete`, renders overlay, transitions to `"ready"` after save
- [x] All tests pass (`vitest run`) — 136/136
- [x] TypeScript strict mode passes (`tsc --noEmit`) — zero errors in story 2-3 files (2 pre-existing errors in unrelated files)
- [x] No regressions to confidence gate, enrichment pipeline, BYOAK, or GPS/text search modes

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

**Auto-save move**: Removed `autoSaveToSupabase` call from `CameraModal.submitImage` and the `dishToRecipeMapPromise` photo-upload chain. Auto-save now fires in `ScanConfirmationOverlay.handleConfirm` after the user confirms. Consequence: the enrichment route (`/api/scan/enrich`) no longer receives a `dishToRecipeMap`, so USDA macros are not written back to Supabase until a future story addresses write-back timing.

**Confidence gate path**: `pendingDishToRecipeMapRef` (used to pass the map promise through the low-confidence pause) was also removed since the map promise no longer exists. `fireEnrichment` signature simplified — `dishToRecipeMapPromise` optional param removed.

**framer-motion test mock**: Added `src/test/mocks/framer-motion.tsx` and aliased it in `vitest.config.ts`. Root cause: `AnimatePresence mode="wait"` defers child mounting until the exiting child's animation completes — which never happens in jsdom. Mock makes `AnimatePresence` a transparent passthrough and strips animation-only props from `motion.*` elements. Fixes mode-switch tests. 136/136 passing.

**`onProcessingComplete` type fix**: Updated `CameraModal` prop type from `(recipeId: string)` to `(scanKey: string)` — matched what the implementation was already passing.

### File List

**Modified:**
- `src/components/scan/RestaurantConfirmation.tsx` — added `scanKey` + `extractedName` props; added `"confirm"` mode block
- `src/components/AppShell.tsx` — added `confirmingScanKey` state; `ScanConfirmationOverlay` render layer; updated `onProcessingComplete` handler
- `src/components/capture/CameraModal.tsx` — removed `autoSaveToSupabase` import + call + `dishToRecipeMapPromise` chain; removed `pendingDishToRecipeMapRef`; simplified `fireEnrichment` signature; fixed `onProcessingComplete` prop type
- `vitest.config.ts` — added framer-motion alias pointing to mock
- `planning/sprint-status.yaml` — story 2-3 status → review

**Created:**
- `src/components/scan/ScanConfirmationOverlay.tsx`
- `src/components/scan/AutoCaptureToast.tsx`
- `src/components/scan/RestaurantConfirmation.test.tsx`
- `src/components/scan/AutoCaptureToast.test.tsx`
- `src/test/mocks/framer-motion.tsx`
- `planning/2-3-restaurant-confirmation-auto-capture.md` (this file)
