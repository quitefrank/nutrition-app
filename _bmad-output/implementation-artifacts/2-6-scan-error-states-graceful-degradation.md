# Story 2.6: Scan Error States & Graceful Degradation

**Status:** done
**Story ID:** 2.6
**Epic:** 2 — Scan & AI Identification

---

## Story

As a user encountering service issues during a scan,
I want clear error messages and graceful fallback behaviour,
So that I always know what happened and can continue without losing the session.

---

## Acceptance Criteria

**Given** Gemini Vision is unavailable when a scan is submitted
**When** the API route returns HTTP 503
**Then** the client shows an error state within 15 seconds of the failure: failure cause in plain language ("Scan service is temporarily unavailable"), a retry button, and the option to try uploading a photo instead (FR35, NFR10)

**Given** an error state is displayed
**When** the user taps retry
**Then** the same scan is re-submitted with the same captured image; no duplicate processing strip appears

**Given** the error state component renders for any scan failure
**When** inspected
**Then** no raw error message, HTTP status code, stack trace, or internal service name is visible to the user; messaging is always plain-language

**Given** Google Places enrichment is unavailable during `/api/scan/enrich`
**When** the client receives the degraded response
**Then** the results screen continues displaying the Gemini-only result with `imageUrl: null`; no error state appears; the dish image slot shows a tasteful placeholder image or neutral colour; no user-facing notification of the enrichment failure (FR36, NFR11)

**Given** any error state on the results screen
**When** the error has been visible for more than 15 seconds
**Then** the retry button remains visible; the error state does not auto-dismiss; no silent failure occurs (NFR10)

---

## Tasks / Subtasks

- [x] Task 1: Update `src/hooks/use-scan.ts` — add retry capability
  - [x] Add `lastScanParams: { imageBase64: string; mimeType: string; thumbnailUrl: string } | null` to `ScanState`
  - [x] In `submitScan`: store `{ imageBase64, mimeType, thumbnailUrl }` into `lastScanParams` on state update (alongside setting status to 'processing')
  - [x] Add `retry()` function: if `state.lastScanParams` exists, call `submitScan(...)` with stored params; no-op if params are null
  - [x] Add `retry` to `UseScanReturn` interface and return value
  - [x] In `cancelScan`: also clear `lastScanParams` (set to null) alongside existing cleanup

- [x] Task 2: Create `src/components/ui/error-state.tsx` (NEW)
  - [x] Props: `message: string`, `onRetry: () => void`, `onUploadInstead?: () => void`
  - [x] Render plain-language `message` text (never exposes raw errors passed in by caller)
  - [x] Retry button (56pt height, radius-xl, full-width)
  - [x] Optional "Try uploading a photo instead" text-link button (only when `onUploadInstead` is provided)
  - [x] Glass styling matching processing strip: `background: var(--glass-strip-bg)`, `backdropFilter: blur(24px)`, `borderRadius: var(--radius-md)`, padding `12px 16px`
  - [x] No positioning — caller handles placement (fixed position in AppShell)
  - [x] No auto-dismiss logic — persistence is AppShell's responsibility

- [x] Task 3: Update `src/components/layout/app-shell.tsx` — show error state, wire retry/upload
  - [x] Destructure `retry` from `useScan()` (alongside existing destructured values)
  - [x] Add `ErrorState` import from `@/components/ui/error-state`
  - [x] Add condition: render `ErrorState` fixed-positioned when `showStrip && status === 'error'`
  - [x] `handleRetry`: calls `retry()` — status transitions from 'error' → 'processing', `showStrip` stays true (no new strip needed)
  - [x] `handleUploadInstead`: calls `cancelScan()` + `setShowStrip(false)` to clear error, then `setIsCameraModalOpen(true)` so user can use the photo library upload affordance inside `CameraModal`
  - [x] Keep existing condition unchanged: `showStrip && (status === 'processing' || status === 'ready')` still renders `ProcessingStrip`
  - [x] Add `status === 'error'` to `showStrip` control: when `handleStripCancel` fires, also hide if status is error (already calls `cancelScan()` + `setShowStrip(false)`)

- [x] Task 4: Write tests
  - [x] `src/hooks/use-scan.test.ts` — add retry tests (see Dev Notes)
  - [x] `src/components/ui/error-state.test.tsx` (NEW) — component tests (see Dev Notes)
  - [x] `src/components/layout/app-shell.test.tsx` — add error state render tests (see Dev Notes)

---

## Dev Notes

### File Locations

```
src/
  hooks/
    use-scan.ts                           ← MODIFY (Task 1)
    use-scan.test.ts                      ← MODIFY (Task 4)
  components/
    ui/
      error-state.tsx                     ← NEW (Task 2)
      error-state.test.tsx                ← NEW (Task 4)
    layout/
      app-shell.tsx                       ← MODIFY (Task 3)
      app-shell.test.tsx                  ← MODIFY (Task 4)
```

### What Already Exists (do NOT recreate or modify)

- **`use-scan.ts` error detection**: `onError` already sets `status: 'error'` for non-abort failures. The `status: 'error'` state exists — this story makes it *visible* in the UI.
- **`AppShell` error suppression (current bug)**: Line 86 — `showStrip && (status === 'processing' || status === 'ready')` — `status === 'error'` is excluded, so errors are silently hidden. Fix this by adding the `ErrorState` render alongside the `ProcessingStrip` render.
- **`scan-results.tsx` DishCard image placeholder**: Already renders `rgba(255,255,255,0.08)` div when `imageUrl` is null (lines 118-119). AC4 (Google Places degradation) is already satisfied for the dish list. **Do NOT modify.**
- **`dish-detail-sheet.tsx` image placeholder**: Already renders `rgba(255,255,255,0.08)` div when `imageUrl` is null (line 33). **Do NOT modify.**
- **`fireEnrichment` in `use-scan.ts`**: Lines 57-58 — `if (!res.ok) return` silently swallows enrichment failures. FR36/NFR11 (Google Places degradation) is already handled server-side and client-side. **Do NOT modify.**
- **`ProcessingStrip` component**: Feature-complete. Do not add error states to it.
- **`GlassCard` and `BottomSheet`**: Feature-complete. Do not modify.
- **API routes** (`menu/route.ts`, `dish/route.ts`): Already return `{ error: 'Gemini service unavailable', code: 'SCAN_SERVICE_UNAVAILABLE' }` with HTTP 503 on Gemini failure. No changes needed.

### Task 1: `use-scan.ts` — Retry Capability

Add `lastScanParams` to `ScanState`:

```typescript
interface ScanState {
  status: ScanStatus
  scanId: string | null
  thumbnailUrl: string | null
  lastScanParams: { imageBase64: string; mimeType: string; thumbnailUrl: string } | null  // NEW
}
```

Update initial state:
```typescript
const [state, setState] = useState<ScanState>({
  status: 'idle',
  scanId: null,
  thumbnailUrl: null,
  lastScanParams: null,  // NEW
})
```

In `submitScan`, save params when setting status to 'processing':
```typescript
const submitScan = (imageBase64: string, mimeType: string, thumbnailUrl: string) => {
  abortRef.current?.abort()
  const controller = new AbortController()
  abortRef.current = controller
  const gen = ++mutationGenRef.current
  setState({
    status: 'processing',
    scanId: null,
    thumbnailUrl,
    lastScanParams: { imageBase64, mimeType, thumbnailUrl },  // NEW — store for retry
  })
  // ... rest unchanged
}
```

Add `retry` function (after `cancelScan`):
```typescript
const retry = () => {
  if (state.lastScanParams) {
    const { imageBase64, mimeType, thumbnailUrl } = state.lastScanParams
    submitScan(imageBase64, mimeType, thumbnailUrl)
  }
}
```

Update `cancelScan` to clear `lastScanParams`:
```typescript
const cancelScan = () => {
  abortRef.current?.abort()
  if (state.scanId) queryClient.removeQueries({ queryKey: ['scan-thumbnail', state.scanId] })
  setState({ status: 'idle', scanId: null, thumbnailUrl: null, lastScanParams: null })  // added lastScanParams: null
}
```

Update `UseScanReturn` interface and return:
```typescript
export interface UseScanReturn {
  status: ScanStatus
  scanId: string | null
  thumbnailUrl: string | null
  submitScan: (imageBase64: string, mimeType: string, thumbnailUrl: string) => void
  cancelScan: () => void
  reset: () => void
  retry: () => void  // NEW
}

return {
  // ... existing fields
  retry,  // NEW
}
```

**Note on `reset()`**: `reset()` clears state to idle but does not clear `lastScanParams` so that retry is still possible after a soft reset. Leave `reset()` unchanged.

### Task 2: `error-state.tsx` Component

```typescript
'use client'

interface ErrorStateProps {
  message: string
  onRetry: () => void
  onUploadInstead?: () => void
}

export function ErrorState({ message, onRetry, onUploadInstead }: ErrorStateProps) {
  return (
    <div
      data-testid="error-state"
      style={{
        background: 'var(--glass-strip-bg)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
      }}
    >
      {/* Plain-language message — no raw errors */}
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', margin: '0 0 12px' }}>
        {message}
      </p>

      {/* Retry button */}
      <button
        onClick={onRetry}
        style={{
          width: '100%',
          height: '56px',
          borderRadius: 'var(--radius-xl)',
          background: 'rgba(255,255,255,0.90)',
          color: 'var(--text-on-button)',
          fontWeight: 600,
          fontSize: 'var(--text-base)',
          border: 'none',
          cursor: 'pointer',
          marginBottom: onUploadInstead ? '8px' : '0',
        }}
        aria-label="Retry scan"
      >
        Try again
      </button>

      {/* Upload alternative — only shown when handler provided */}
      {onUploadInstead && (
        <button
          onClick={onUploadInstead}
          style={{
            width: '100%',
            height: '44px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-secondary)',
            fontSize: 'var(--text-sm)',
          }}
          aria-label="Try uploading a photo instead"
        >
          Try uploading a photo instead
        </button>
      )}
    </div>
  )
}
```

### Task 3: `app-shell.tsx` — Error State Integration

Add the import at the top:
```typescript
import { ErrorState } from '@/components/ui/error-state'
```

Destructure `retry` from `useScan`:
```typescript
const { status, scanId, thumbnailUrl, submitScan, cancelScan, retry } = useScan()
```

Add handler functions:
```typescript
const handleRetry = () => {
  retry()  // re-submits same scan; status transitions to 'processing'; showStrip stays true
}

const handleUploadInstead = () => {
  cancelScan()         // abort in-flight and clear error state
  setShowStrip(false)  // hide the error strip
  setIsCameraModalOpen(true)  // open camera modal (user taps upload button inside)
}
```

Update the render section (after the existing `ProcessingStrip` block):
```tsx
{/* Error state — shown in same fixed position as ProcessingStrip */}
{showStrip && status === 'error' && (
  <div
    style={{
      position: 'fixed',
      bottom: 'calc(49px + env(safe-area-inset-bottom, 0px) + 8px)',
      left: '16px',
      right: '16px',
      zIndex: 40,
    }}
  >
    <ErrorState
      message="Scan service is temporarily unavailable"
      onRetry={handleRetry}
      onUploadInstead={handleUploadInstead}
    />
  </div>
)}
```

**No other changes to AppShell.** The existing `showStrip && (status === 'processing' || status === 'ready')` ProcessingStrip block is UNCHANGED.

**Behaviour flow:**
1. Scan submitted → `showStrip = true`, `status = 'processing'` → ProcessingStrip visible
2. Scan fails → `status = 'error'` (set by `use-scan.ts` `onError`) → ProcessingStrip hidden, ErrorState appears (both use `showStrip = true`)
3. User taps retry → `retry()` → `status = 'processing'` → ErrorState hidden, ProcessingStrip appears again (no new strip, same `showStrip = true`)
4. User taps upload instead → `cancelScan()` + `setShowStrip(false)` + camera modal opens → ErrorState hidden
5. User swipes to cancel (existing `handleStripCancel`) → `cancelScan()` + `setShowStrip(false)` — this also dismisses error state correctly (no change needed)

### Task 4: Test Approach

**Environment:** Vitest + jsdom. **All 193 existing tests must continue passing** (no regressions).

**Required mocks for `app-shell.test.tsx` (already established — extend, do not duplicate):**
```typescript
// Existing mocks in app-shell.test.tsx already cover: next/navigation, CameraModal, ProcessingStrip
// Add new mock for ErrorState:
vi.mock('@/components/ui/error-state', () => ({
  ErrorState: ({ onRetry, onUploadInstead }: { message: string; onRetry: () => void; onUploadInstead?: () => void }) =>
    React.createElement('div', { 'data-testid': 'error-state' },
      React.createElement('button', { onClick: onRetry, 'aria-label': 'Retry scan' }, 'Retry'),
      onUploadInstead && React.createElement('button', { onClick: onUploadInstead, 'aria-label': 'Try uploading a photo instead' }, 'Upload instead'),
    ),
}))
```

**`use-scan.test.ts`** — add:
```typescript
// Test: retry() after error re-submits scan with same imageBase64, mimeType, thumbnailUrl
// Test: retry() is a no-op when no lastScanParams (idle state, nothing to retry)
// Test: submitScan stores lastScanParams in state
// Test: cancelScan clears lastScanParams
```

**`error-state.test.tsx`** (new):
```typescript
// Test: renders message text
// Test: renders retry button
// Test: clicking retry button calls onRetry
// Test: upload alternative not rendered when onUploadInstead is not provided
// Test: upload alternative rendered when onUploadInstead is provided
// Test: clicking upload alternative calls onUploadInstead
```

**`app-shell.test.tsx`** — add:
```typescript
// Test: ErrorState is NOT rendered when showStrip=false (initial state)
// Test: ErrorState renders when useScan returns status='error' (requires mocking useScan)
// Test: ProcessingStrip renders when status='processing' (not ErrorState)
// Test: clicking retry in ErrorState triggers retry()
// Test: clicking upload-instead in ErrorState calls cancelScan, closes strip, opens camera modal
```

**Mock `useScan` in `app-shell.test.tsx`:**
```typescript
import { useScan } from '@/hooks/use-scan'
vi.mock('@/hooks/use-scan')
// In each test, configure via:
vi.mocked(useScan).mockReturnValue({
  status: 'error',
  scanId: null,
  thumbnailUrl: null,
  submitScan: vi.fn(),
  cancelScan: vi.fn(),
  reset: vi.fn(),
  retry: mockRetry,
})
```

**Note on `showStrip` in tests**: AppShell sets `showStrip = true` inside `handleCapture`. In tests, trigger capture by calling `handleCapture` directly or by simulating `onCapture` on the mocked `CameraModal`. Check existing `app-shell.test.tsx` tests for the established pattern.

### Architecture Enforcement

| Rule | Detail |
|---|---|
| Server-only boundary | `route.ts` files already have error shapes — no changes to API routes in this story |
| API key access | `getApiKeys()` used in all routes — no changes needed |
| No raw errors in UI | `ErrorState` hardcodes `message` from AppShell ("Scan service is temporarily unavailable"); the raw `err.message` from `onError` is NEVER passed to `ErrorState.message` |
| Error shape | `{ error: string, code: string }` — routes already comply, no changes |
| TQ key conventions | No new TQ keys in this story |
| `lastScanParams` is NOT in TQ | Stored in `useState` within `use-scan.ts` — it's transient UI state, not cacheable data |
| Image safety | `imageBase64` stored in `lastScanParams` is client-side component state only — never sent anywhere except back to the scan API on retry |
| Existing test mocks | Reuse established mock patterns exactly (framer-motion, focus-trap-react, next/navigation) |
| Test count | 193 tests must pass; add ~12+ new tests |

### Anti-Patterns to Prevent

```typescript
// ❌ Don't pass the raw error message to ErrorState
onError: (err) => {
  setState((prev) => ({ ...prev, status: 'error' }))
  setErrorMessage((err as Error).message)  // ← NEVER DO THIS — raw messages visible to user
}

// ✅ AppShell always uses plain-language message regardless of error
<ErrorState message="Scan service is temporarily unavailable" ... />

// ❌ Don't set showStrip to false on error
// The showStrip flag controls the strip's lifecycle — it stays true through error
// so retry can re-use the existing strip slot
if (status === 'error') setShowStrip(false)  // ← WRONG — breaks retry flow

// ✅ showStrip stays true; ErrorState replaces ProcessingStrip visually via status

// ❌ Don't modify fireEnrichment to surface Google Places errors
// FR36 explicitly says: enrichment failure = silent degradation, NOT error state
// use-scan.ts line 57 `if (!res.ok) return` is CORRECT and must stay

// ❌ Don't add error-state.tsx as a fixed-position component
// ErrorState is a pure, position-agnostic UI component
// Positioning is AppShell's responsibility via the wrapper div

// ❌ Don't add 'error' to ProcessingStrip's status type
// ProcessingStrip only handles 'processing' and 'ready' — do not add 'error' to it
// ErrorState is the separate component for error rendering

// ❌ Don't auto-dismiss the error state after 15 seconds
// NFR10 says the error must APPEAR within 15s (it already does, via onError)
// and must NOT auto-dismiss — the retry button stays visible indefinitely

// ❌ Don't use a toast for the scan error
// Toasts are for confirmations and secondary failures (enrichment, etc.)
// Primary scan failure needs persistent, full-width error with retry affordance
```

### Story 2.5 Intelligence (Previous Story Learnings)

- **193 tests passing** — do NOT regress
- `use-scan.ts`: `setState` in `submitScan` previously only set 4 fields. Adding `lastScanParams` requires updating the full initial state object and all setState calls to include the new field to avoid stale state.
- `app-shell.test.tsx`: Uses `vi.mock('@/hooks/use-scan')` or renders fully — check current test pattern before adding mocks. The `createWrapper` utility wraps with QueryClientProvider.
- `scan-results.tsx` and `dish-detail-sheet.tsx`: Both already handle `imageUrl: null` gracefully with `rgba(255,255,255,0.08)` placeholders. AC4 requires zero code changes — the story just confirms existing behaviour.
- **`reset()` vs `cancelScan()`**: `reset()` clears to idle without aborting; `cancelScan()` aborts and clears. For `handleUploadInstead`, use `cancelScan()` (abort the in-flight error, fully clean up). For `retry()`, neither is called — we go directly from error state into a new `submitScan`.
- Processing strip and error state share the same `showStrip` gate — this means they're mutually exclusive by status, which is the desired behaviour.

### Story Forward Context

**Story 3.1 (Recipe Save Flow)** — the `ErrorState` component created here may be reused for recipe save failures. Design it generically (message + retry + optional secondary action) to support this.

**Story 6.3 (Complete Error States)** — will audit ALL error states across the app. The `ErrorState` component is the canonical primitive for that audit. Keep it clean and reusable.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Added `lastScanParams` to `ScanState` in `use-scan.ts`; stored on every `submitScan` call so `retry()` can re-submit with identical image data
- `retry()` is a no-op when `lastScanParams` is null (idle state); `cancelScan()` clears it
- `reset()` intentionally preserves `lastScanParams` (functional per spec — retry still available after soft reset)
- Created `ErrorState` component: pure, position-agnostic, glass-styled with retry + optional upload-instead affordance
- `AppShell` wires `ErrorState` in fixed position (same slot as `ProcessingStrip`); `showStrip` flag controls lifecycle across both states — no new strip created on retry
- `handleUploadInstead` aborts via `cancelScan()`, hides strip, reopens `CameraModal`
- AC4 (Google Places degradation) already satisfied by existing `fireEnrichment` silent-fail — zero code changes needed
- 208 tests pass (193 pre-existing + 15 new); no regressions

### File List

- src/hooks/use-scan.ts
- src/hooks/use-scan.test.ts
- src/components/ui/error-state.tsx (NEW)
- src/components/ui/error-state.test.tsx (NEW)
- src/components/layout/app-shell.tsx
- src/components/layout/app-shell.test.tsx

### Change Log

- 2026-03-21: Story 2.6 implemented — scan error states & graceful degradation. Added retry capability to `use-scan.ts`, new `ErrorState` component, wired error UI in `AppShell`. 15 new tests added.
- 2026-03-21: **Amendment** — party mode session (pre-implementation) aligned on differentiated empty states keyed to `emptyReason`. Original spec omitted this decision. See Amendment section below.

---

## Amendment: Differentiated Empty States (Party Mode Decision)

**Status:** Implemented (2026-03-21)
**Source:** Party mode session — multi-agent alignment between UX (Sally), PM (John), Architect (Winston), QA (Quinn), and Developer (Amelia). AI Studio testing confirmed `emptyReason` signal availability.

### Background

During a party mode session before Story 2.6 implementation, the team aligned on a strategy for differentiated empty result states. This decision was not captured in the original spec, creating an intent gap. This amendment documents the agreed strategy.

The strategy distinguishes between two categories of scan failure:

| Category | Trigger | Where shown | Copy |
|---|---|---|---|
| **Service error** | Gemini returns HTTP 503 | AppShell strip (`ErrorState`) | "Scan service is temporarily unavailable" (unchanged) |
| **Empty result** | Gemini returns `dishes: []` | Results page | Differentiated by `emptyReason` (this amendment) |

### The `emptyReason` Signal

Gemini's OCR capability is robust enough to distinguish *why* it returned no dishes. Three values are defined:

| `emptyReason` | Meaning | User scenario |
|---|---|---|
| `"image_quality"` | Image too dark, blurry, or obscured for OCR | User photographed in poor conditions |
| `"not_menu"` | Image is not a menu/food photo (e.g. a street scene) | User scanned wrong thing |
| `"no_dishes_found"` | Image is a menu but Gemini couldn't extract dish data | Unusual menu layout, decorative, etc. |
| `null` | Fallback — empty dishes with no specific reason given | Treat same as `"no_dishes_found"` |

AI Studio testing confirmed:
- Dark/blurry images reliably return `"image_quality"`
- Non-menu images trigger `"not_menu"` routing
- Gemini's OCR handles even quite blurry well-lit images (returns full dish arrays) — `"image_quality"` is only for genuinely unusable photos

### Accepted Copy Per State

| `emptyReason` | Headline | CTA |
|---|---|---|
| `"image_quality"` | "The photo was a bit blurry — try again with better lighting or a steadier shot" | "↺ Retake" |
| `"not_menu"` | "That doesn't look like a menu — try scanning a restaurant menu or food photo" | "↺ Retake" |
| `"no_dishes_found"` / `null` | "We couldn't spot any dishes — try a different angle or better lighting" | "↺ Retake" |

### Implementation Scope

**Scope boundary confirmed in party mode:**
- Story 2.3 scope: one unified fallback (already shipped)
- Story 2.6 scope: differentiated empty states with `emptyReason`-keyed copy (this amendment)
- Story 6.3 scope: full error state audit across the app — `ErrorState` is the canonical primitive

**Files to change:**

1. **`src/types/api.ts`** — add `emptyReason?: 'image_quality' | 'not_menu' | 'no_dishes_found' | null` to `ScanResult`
2. **`src/app/api/scan/menu/route.ts`** — update `MENU_SCAN_PROMPT` to request `emptyReason` in the JSON schema; update `parseGeminiMenuResponse` to extract it; include in `scanResult`
3. **`src/components/scan/scan-results.tsx`** — when `dishes.length === 0`, render differentiated empty state with copy from the table above, keyed to `result.emptyReason`
4. **Tests** — update `menu/route.test.ts` (new `emptyReason` field assertions) and `scan-results.test.tsx` (empty state per reason)

**Files unchanged:**
- `src/components/ui/error-state.tsx` — service error component, not for empty results
- `src/components/layout/app-shell.tsx` — `"Scan service is temporarily unavailable"` message stays; `emptyReason` never flows through AppShell
- `src/hooks/use-scan.ts` — `onSuccess` → `status: 'ready'` unchanged; empty dishes still navigates to results page

### Anti-Patterns

```typescript
// ❌ Don't handle emptyReason in AppShell or useScan
// Empty results are a successful scan (200 OK) that navigates to the results page.
// AppShell only surfaces 503 service errors.

// ❌ Don't skip navigation to results when dishes is empty
// The results page is the right place to show why zero results were returned.
// Intercepting in useScan onSuccess would add complexity with no UX benefit.

// ❌ Don't require emptyReason — make it optional
// Gemini may not always return it, or future routes may not support it.
// Fallback to "no_dishes_found" copy when emptyReason is null/undefined.

// ❌ Don't show emptyReason to the user literally
// The value "image_quality" is a machine code, not user copy. Map it to the accepted copy above.
```
