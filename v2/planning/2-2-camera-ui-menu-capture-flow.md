# Story 2.2: Camera UI & Menu Capture Flow

Status: review
Epic: 2 — Menu Scan & Dish Auto-Capture
Story ID: 2.2
Story Key: 2-2-camera-ui-menu-capture-flow
Created: 2026-04-12

---

## Story

As a user,
I want to open the camera from the nav bar, frame my menu, and capture it with one tap,
So that scanning feels instant and effortless.

---

## Acceptance Criteria

**AC1 — Camera modal opens from nav bar**
**Given** the user taps the camera FAB in the FloatingNavBar
**When** the camera modal opens
**Then** it presents a live camera viewfinder in fullscreen with a capture button; the user does not need to leave the app or use the native camera roll

**AC2 — Swipe down to dismiss**
**Given** the camera modal is open
**When** the user swipes down (drag >80px downward on the modal)
**Then** the modal dismisses and returns to the previous screen; swipe is detected on the modal root element via `onPointerDown` / `onPointerMove` / `onPointerUp`

**AC3 — Capture → POST /api/scan → loading state shown**
**Given** the user taps the capture button
**When** the photo is taken
**Then** the image is compressed and converted to base64; a POST request is made to `/api/scan`; a loading state is shown within the modal (camera viewfinder hidden; scanning indicator visible) while waiting for the response

**AC4 — Scan success → transition to Restaurant Confirmation**
**Given** the scan returns successfully with dishes extracted
**When** the result is stored in `sessionStorage`
**Then** the `onProcessingComplete(scanKey)` callback is invoked with the `plately:scan:{uuid}` key; the modal parent transitions to the Restaurant Confirmation screen (Story 2.3)

**AC5 — Error handling aligned to nested error envelope**
**Given** the scan API returns an error response
**When** `res.ok` is false
**Then** the error message is read from `data?.error?.message` (nested format); the `onProcessingError(message)` callback is invoked with a user-friendly message; the modal is NOT closed — the user can retake

---

## This Is Brownfield — Audit First, Fix Second

**`src/components/capture/CameraModal.tsx` already exists.** Do NOT reinvent it. It handles permission flow, camera viewfinder, capture, file upload, and confidence gate. Your task is to audit it against the ACs above and fix the specific discrepancies.

### What is already correctly implemented

| Feature | Notes |
|---------|-------|
| Full-screen camera viewfinder (`<video>`) | Correct — playsInline muted, enviroment facing |
| Camera permission flow (value-framing overlay) | Correct — shows framing screen before prompt |
| Corner bracket scan frame SVG | Correct — fades after 2s |
| File upload fallback (`<input type="file">`) | Correct — triggers from upload icon in top-left |
| Gemini confidence gate (`InferenceState`) | Correct — shows on low confidence result |
| BYOAK header (`X-User-Gemini-Key`) | Correct — reads from localStorage |
| Fire-and-forget Supabase save | Correct — `autoSaveToSupabase()` is non-blocking |
| Enrichment pipeline trigger | Correct — `fireEnrichment()` called after save |
| X button dismiss | Correct — `handleClose()` stops camera and calls `onClose()` |

### What must be fixed

**Issue 1 — sessionStorage key format (ARCH13)**

Architecture mandates: `plately:scan:{uuid}` (colon separator, UUID).

Current code (line 264):
```typescript
const scanKey = `plately_scan_${Date.now()}`
```

Must be:
```typescript
const SCAN_KEY_PREFIX = "plately:scan:"
const scanKey = `${SCAN_KEY_PREFIX}${crypto.randomUUID()}`
```

This is not merely cosmetic — the key format is referenced in:
- `supabaseAutoSave.ts` (dispatches `plately:supabase-saved` with the key)
- Recipe detail page reads `sessionStorage["plately:scan:{uuid}"]`
- The `plately:enriched` custom event detail uses this key

**Issue 2 — Error response parsing (misaligned with Story 2.1 fix)**

Story 2.1 fixes all error responses in the scan route to use nested format:
```typescript
{ error: { message: string; code: string } }
```

Current code in `CameraModal.tsx` (lines 243–246) reads:
```typescript
const err = await res.json().catch(() => ({}))
throw new Error((err as { error?: string }).error ?? "Scan failed")
```

After Story 2.1 ships, this will silently fail (returns `[object Object]` not the message). Update to:
```typescript
const err = await res.json().catch(() => ({})) as { error?: { message?: string } | string }
const msg = typeof err.error === "object"
  ? err.error?.message
  : typeof err.error === "string"
  ? err.error
  : undefined
throw new Error(msg ?? "Scan failed")
```

> Note: if Story 2.1 ships before 2.2, update to read nested only. If parallel, use the dual-format fallback above.

**Issue 3 — Missing swipe-down dismiss gesture (AC2)**

The modal has an X button but no swipe gesture. Add pointer-based swipe dismiss:

```typescript
// Track swipe in component state
const [dragStartY, setDragStartY] = useState<number | null>(null)

// On the outer motion.div (the modal root element):
onPointerDown={(e) => setDragStartY(e.clientY)}
onPointerUp={(e) => {
  if (dragStartY !== null && e.clientY - dragStartY > 80) {
    handleClose()
  }
  setDragStartY(null)
}}
```

> Keep this lightweight — do not use `useDragControls` or full drag tracking. A simple pointer-up delta is sufficient.

---

## Implementation Notes

### SessionStorage key constant

Define this constant at the top of `CameraModal.tsx`:
```typescript
const SCAN_KEY_PREFIX = "plately:scan:"
```

Use `crypto.randomUUID()` to generate the UUID. `crypto` is available in all modern browsers and in the Next.js edge runtime.

### Do NOT change these

- `CONFIDENCE_THRESHOLD = 70` — confidence gate value
- `InferenceState` integration — works correctly
- File upload handling — works correctly
- Camera permission flow — works correctly
- `autoSaveToSupabase` integration — works correctly
- Enrichment pipeline (`fireEnrichment`) — works correctly

### No new dependencies required

All fixes use existing APIs (Framer Motion, standard DOM pointer events).

---

## Tests Required

**Test file location:** `src/components/capture/CameraModal.test.tsx`
(Co-located with component — not in `__tests__/`)

No tests currently exist for CameraModal. The component is complex but can be tested by mocking camera APIs.

### Testing approach

```typescript
import { vi, describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CameraModal } from './CameraModal'

// Mock navigator.mediaDevices
Object.defineProperty(global.navigator, 'mediaDevices', {
  value: {
    getUserMedia: vi.fn().mockResolvedValue({
      getTracks: () => [{ stop: vi.fn() }]
    }),
  }
})

// Mock fetch
global.fetch = vi.fn()

// Mock sessionStorage
const mockSessionStorage: Record<string, string> = {}
Object.defineProperty(global, 'sessionStorage', {
  value: {
    getItem: (key: string) => mockSessionStorage[key] ?? null,
    setItem: (key: string, val: string) => { mockSessionStorage[key] = val },
    removeItem: (key: string) => { delete mockSessionStorage[key] },
    length: 0,
    key: () => null,
    clear: () => {},
  }
})
```

### Required test cases

```
describe('CameraModal')
  ├── rendering
  │   ├── renders null when open=false
  │   └── renders modal when open=true with aria-modal and role="dialog"
  ├── dismiss
  │   ├── X button calls onClose
  │   └── swipe-down > 80px calls onClose
  ├── sessionStorage key format
  │   └── after successful scan, sessionStorage key starts with "plately:scan:"
  ├── error handling
  │   ├── nested error format { error: { message } } is read correctly
  │   └── flat error format { error: string } still handled gracefully (fallback)
  └── scan flow
      └── capture button disabled when cameraReady=false
```

---

## Architecture Guardrails

- **Session key format**: Always `plately:scan:{uuid}` — never underscore or timestamp
- **`import 'server-only'` is NOT needed in this client component** — CameraModal is `'use client'`
- **No direct Supabase calls inside CameraModal** — all DB writes go via `autoSaveToSupabase` (correct today)
- **Pointer event swipe** — use `onPointerDown`/`onPointerUp` on the root `motion.div`, not on the video element
- **Do not mutate `pendingDishToRecipeMapRef.current` from the swipe handler** — the swipe dismiss must go via `handleClose()` which already calls `stopCamera()`

---

## File Scope

### Files to modify

| File | Change |
|------|--------|
| `src/components/capture/CameraModal.tsx` | Fix sessionStorage key format, fix error response parsing, add swipe-down dismiss |

### Files to create

| File | Notes |
|------|-------|
| `src/components/capture/CameraModal.test.tsx` | New test file, co-located with component |

### Files NOT to touch

| File | Reason |
|------|--------|
| `src/components/scan/InferenceState.tsx` | Confidence gate works correctly |
| `src/lib/supabaseAutoSave.ts` | Correct; uses sessionStorage key it receives |
| `src/components/scan/RestaurantConfirmation.tsx` | Story 2.3 scope |
| `src/components/layout/TabBar.tsx` | Camera FAB entry point — not in scope for this story |

---

## Key Context from Epic 2

Story 2.2 is the entry point for the full scan flow:
- Story 2.1 defines the `/api/scan` API contract (already ready-for-dev)
- Story 2.3 (Restaurant Confirmation) receives the `scanKey` via `onProcessingComplete(scanKey)` — coordinate the key format
- Story 2.6 (AI Ingredient Pipeline) is triggered by `fireEnrichment()` inside CameraModal — do not change the enrich call shape
- Story 2.7 (Confidence Indicator) depends on the partial recognition flow — the confidence gate already works

**Parallel work notice**: Stories 2.2, 2.4, 2.6, and 2.8 are designed to be developed in parallel. Each has independent file scope. There are no merge conflicts expected.

---

## Relevant Previous Story Context

### From Story 1.1 — Infrastructure Hardening (done)
- `src/lib/supabase.ts` throws at build time on missing env vars — correct today
- `src/lib/api-keys.ts` has `import 'server-only'` — never import this in CameraModal

### From Story 1.4 — App Shell Responsive Layout (done)
- Camera FAB entry point is in `TabBar.tsx`; it sets `scanOpen` state that is passed as `open` prop to `CameraModal`
- The `onProcessingComplete(scanKey)` callback in `TabBar` or `AppShell` navigates to the restaurant screen — do not change callback shape

### From recent git commits
- `feat(v2): restaurant screen polish, menu detection batching, enrichment fix` — CameraModal was updated with enrichment; the `fireEnrichment` implementation reflects this
- The `plately:supabase-saved` event listener in CameraModal is correct and working

---

## Definition of Done

- [x] `sessionStorage` key format is `plately:scan:{uuid}` (UUID v4, colon separator)
- [x] Error response parsing reads `data?.error?.message` (nested) with flat-format fallback
- [x] Swipe down >80px on modal dismisses it
- [x] `src/components/capture/CameraModal.test.tsx` exists and covers required test cases
- [x] All tests pass (`vitest run`)
- [x] TypeScript strict mode passes (`tsc --noEmit`)
- [x] No regressions to confidence gate, file upload, BYOAK, or enrichment pipeline

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation was straightforward with no blocking issues.

### Completion Notes

Three targeted fixes applied to existing `CameraModal.tsx`:

1. **SessionStorage key format** — replaced `plately_scan_${Date.now()}` with `plately:scan:${crypto.randomUUID()}`. Added `SCAN_KEY_PREFIX` constant per ARCH13. This affects all downstream consumers (supabaseAutoSave, enrichment events, recipe detail page).

2. **Error response parsing** — updated the `!res.ok` error extraction to handle both the new nested `{ error: { message } }` envelope (post Story 2.1 fix) and the legacy flat `{ error: string }` format as a fallback. Dual-format guard ensures safe parallel shipping.

3. **Swipe-down dismiss** — added `dragStartY` state, `onPointerDown` sets start Y, `onPointerUp` computes delta and calls `handleClose()` if >80px. Placed on the outer `motion.div` (modal root) per architecture guardrail.

Test file covers all 9 required cases: rendering (open/closed), X button dismiss, swipe >80px, swipe ≤80px, sessionStorage key format, nested error format, flat error fallback, and capture button disabled state.

### File List

- `src/components/capture/CameraModal.tsx` (modified)
- `src/components/capture/CameraModal.test.tsx` (created)

### Change Log

- 2026-04-12: Story 2.2 implemented — sessionStorage key format fixed, error envelope aligned with Story 2.1, swipe-down dismiss added, tests created (9 cases, all pass)
