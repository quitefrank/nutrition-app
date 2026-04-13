# Story 6.5: External API Degraded States — End-to-End Validation

Status: review
Epic: 6 — Graceful Failure & Progressive Recovery
Story ID: 6.5
Story Key: 6-5-external-api-degraded-states-end-to-end-validation
Created: 2026-04-13

---

## Story

As a user,
I want the app to handle any external service going down gracefully — showing me what it can and telling me what it can't,
So that a temporary outage never leaves me with a broken or confusing experience.

---

## Acceptance Criteria

**AC1 — Gemini unavailable: inline error in camera modal**
**Given** the Gemini API is unavailable during a scan (both primary `gemini-2.5-flash` and fallback `gemini-2.0-flash` fail)
**When** the `AI_UNAVAILABLE` error code is returned by `/api/scan`
**Then** the scan error state is shown inline inside the `CameraModal` frame (dusty rose tinted overlay, stays visible until the user acts); a "Try again" retry button is presented; the camera modal remains open and interactive; no navigation to an error page occurs; no generic toast is shown

**AC2 — Google Places unavailable: silent warm placeholder**
**Given** the Google Places API is unavailable during enrichment (network failure, 4xx/5xx, or no results)
**When** the enrichment hook handles the error
**Then** all dish cards render with warm placeholder tiles (via `PhotoFrame` with `photoStatus: 'placeholder'`); no broken `<img>` elements appear; no error notification is shown to the user (silent degradation); the rest of enrichment (macros, rating) is unaffected

**AC3 — USDA unavailable: AI-estimated macros with "Est." label**
**Given** the USDA FoodData Central API is unavailable during enrichment (network failure, 4xx/5xx, or key not configured)
**When** the enrichment hook handles the error
**Then** AI-estimated macros (from Gemini `calorieEstimate`) are displayed with an "Est." label; no macro values go blank; no macro values show an error state; the `MacroBar` renders with the fallback values

**AC4 — Single API failure is isolated**
**Given** any single external API fails (Gemini scan, Places, or USDA)
**When** the app continues running
**Then** all other features remain fully functional; the failure is isolated to only the specific data it affects; the restaurant browse screen remains navigable; no React error boundary is triggered; no unhandled promise rejections occur in the console

**AC5 — No unhandled rejections or crashes**
**Given** all degraded states are exercised end-to-end
**When** each API failure mode is triggered in tests
**Then** no unhandled promise rejections occur; no `console.error` calls reference uncaught exceptions; the app does not unmount or navigate to an error page; all `Promise.allSettled` paths produce settled (not rejected) results

---

## What This Story Changes

This story is primarily **validation and hardening**, not new feature development. Most of the error handling infrastructure already exists — this story identifies gaps, fills them, and adds comprehensive test coverage across all three external API failure modes.

### Gap Audit — Current State vs. Required

#### Gap 1: CameraModal has no inline scan error UI (NEW CODE REQUIRED)

**Current state:** `CameraModal.tsx` delegates error handling entirely to the parent via `onProcessingError(message)`. When Gemini fails, the modal closes and the parent shows an error somewhere outside the modal frame. There is no inline error state inside the camera view itself.

**Required state (AC1):** The scan error is shown inline within the camera modal — a dusty rose tinted overlay with a retry button — and the modal stays open.

**Gap:** `CameraModal` must be extended with an internal `scanError` state. When `submitImage` catches a scan error, instead of calling `onProcessingError`, it should set `scanError` and render an inline error overlay inside the camera frame. The retry button clears `scanError` and restarts the camera.

**Fix:** Add `scanErrorState` to `CameraModal.tsx` and render `ScanErrorOverlay` inline. See Dev Notes for the full implementation.

#### Gap 2: MacroBar has no "Est." label for AI-estimated values (NEW CODE REQUIRED)

**Current state:** `MacroBar.tsx` accepts `proteinG`, `carbsG`, `fatG`, `fibreG` — all nullable — and renders `"—"` when null. There is no mechanism to distinguish "USDA-confirmed macro" from "AI-estimated macro" or to display an "Est." label.

**Required state (AC3):** When USDA enrichment fails, `MacroBar` must display AI-estimated macros with a visible "Est." label per value cell, falling back to the Gemini `calorieEstimate` for total calories when per-ingredient USDA data is unavailable.

**Gap:** `MacroBar` needs an `isEstimated?: boolean` prop. When `true`, each non-null value cell renders the "Est." label below the number. The recipe detail page and `DishRowExpanded` must pass `isEstimated` based on whether USDA enrichment ran.

**Fix:** Update `MacroBar.tsx` to accept `isEstimated?: boolean` and render the label. See Dev Notes for the full implementation.

#### Gap 3: useEnrichment silently swallows all errors without inspection (ACCEPTABLE — verify only)

**Current state:** `useEnrichment.ts` wraps the entire enrichment pipeline in `try/catch` with an empty `catch` block (`catch { // Non-blocking — enrichment is best-effort }`). This is correct for Places and USDA failures (silent degradation), but means no diagnostic information is captured.

**Required state:** The existing silent catch is correct and intentional. This story verifies it remains in place and that `Promise.allSettled` is used for the Supabase write-back so individual write failures do not propagate.

**Status:** No code change needed. The `Promise.allSettled(allWrites)` pattern is already present in `useEnrichment.ts` (line 151). Verify in tests only.

#### Gap 4: lookupUsdaMacros returns nullResult on any error (ALREADY CORRECT — verify only)

**Current state:** `lookupUsdaMacros` in `enrich/route.ts` has a `try/catch` at lines 147–149 that returns `nullResult` on any fetch failure. This means USDA failures produce null macros, not errors.

**Required state:** Null macros are the correct degraded state. The "Est." label distinction is handled in the UI layer (Gap 2 above), not the API route.

**Status:** No code change needed in the API route. Verify in tests only.

#### Gap 5: Places photo failure degrades to null photoUrl (ALREADY CORRECT — verify only)

**Current state:** In `places/nearby/route.ts`, the photo resolution at line 125 already uses `.catch(() => [])`:
```typescript
const photos = await getRestaurantPhotos({ placeId: r.placeId }, apiKey, 1).catch(() => []);
return { ...r, photoUrl: photos[0] ?? null };
```

`PhotoFrame.tsx` already handles `photoStatus: 'placeholder'` with a warm tile (plate icon, "No photo available" label) and never renders a broken `<img>`. No broken image elements are possible.

**Status:** No code change needed. Verify in tests only.

---

## Dev Notes

### Inline scan error state in CameraModal.tsx

Add an internal `scanError` state and `ScanErrorOverlay` component. When `submitImage` fails, set `scanError` instead of calling `onProcessingError`. Retry clears the error and restarts the camera.

```typescript
// Add to CameraModal state (after existing state declarations):
const [scanError, setScanError] = useState<string | null>(null);

// Modify submitImage error handling (replace the existing catch block):
} catch (err) {
  console.error("[CameraModal] scan error:", err);
  const msg = err instanceof Error ? err.message : "Couldn't identify the dish — tap to try again.";
  setScanError(msg);
  // Do NOT call onProcessingError — error stays inline in the modal
}

// Add retry handler (near other handler functions):
function handleScanRetry() {
  setScanError(null);
  setBracketsVisible(true);
  startCamera();
}

// Reset scanError on close:
const handleClose = () => {
  stopCamera();
  setScanError(null);  // add this line
  onClose();
};

// Also reset in the open effect:
setScanError(null);  // add alongside the existing setPendingResult(null) reset
```

**Add `ScanErrorOverlay` sub-component (inline in `CameraModal.tsx`):**

```typescript
interface ScanErrorOverlayProps {
  message: string;
  onRetry: () => void;
}

function ScanErrorOverlay({ message, onRetry }: ScanErrorOverlayProps) {
  return (
    <motion.div
      data-testid="scan-error-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 40,
        // Dusty rose tint — Story 6.5 AC1
        background: "rgba(188, 108, 110, 0.22)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        display: "flex",
        flexDirection: "column" as const,
        alignItems: "center",
        justifyContent: "center",
        padding: "32px",
        gap: "20px",
      }}
    >
      <p
        style={{
          fontSize: "0.9375rem",
          color: "rgba(255,255,255,0.9)",
          textAlign: "center",
          lineHeight: 1.5,
          maxWidth: 260,
        }}
      >
        {message}
      </p>
      <button
        onClick={onRetry}
        aria-label="Retry scan"
        className="btn-pill btn-primary"
        style={{ minWidth: 120 }}
      >
        Try again
      </button>
    </motion.div>
  );
}
```

**Add `ScanErrorOverlay` to the camera viewfinder render block** (inside the `<div className="relative flex-1 overflow-hidden">`, after the `InferenceState` AnimatePresence block):

```typescript
{/* ── Scan error overlay ─────────────────────────────────── */}
<AnimatePresence>
  {scanError && (
    <ScanErrorOverlay
      key="scan-error"
      message={scanError}
      onRetry={handleScanRetry}
    />
  )}
</AnimatePresence>
```

**The `onProcessingError` prop is retained** — it remains in the interface for camera-hardware errors (permission denied, stream failure via `cameraError`). Only Gemini scan failures use the new inline path.

### MacroBar "Est." label for USDA degraded state

Add `isEstimated` prop to `MacroBar.tsx`:

```typescript
interface MacroBarProps {
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fibreG: number | null
  isEstimated?: boolean  // NEW: true when USDA enrichment failed; shows "Est." label
  className?: string
}

// In the value cell render (replace the existing value span):
<span
  style={{
    fontSize: 14,
    fontWeight: 600,
    color: "var(--color-text-primary)",
    marginTop: 2,
  }}
>
  {values[cell.key] != null && Number.isFinite(values[cell.key])
    ? `${Math.round(values[cell.key]!)}g`
    : "—"}
</span>
{isEstimated && values[cell.key] != null && (
  <span
    style={{
      fontSize: 9,
      color: "var(--color-text-tertiary)",
      fontWeight: 500,
      marginTop: 1,
    }}
    aria-label="estimated value"
  >
    Est.
  </span>
)}
```

**Where `isEstimated` is set:** The recipe detail page (`/recipe/[id]/page.tsx`) and any dish card that renders `MacroBar` determine whether enrichment has run. The field `enriched: boolean` on the session storage `ScanResult` is the signal — if `enriched: false` or if the recipe row has no ingredient rows (i.e., USDA never ran), pass `isEstimated={true}`.

For the session scan flow, `MacroBar` receives macros from the `ScanResult` allDishes entry. If `enriched: false`, those macros came from Gemini estimates only — pass `isEstimated={true}`. If `enriched: true`, USDA ran successfully — pass `isEstimated={false}`.

For the Supabase recipe flow (`/recipe/[id]`), if `recipe_ingredients` rows exist with non-null `calories_per_serving`, USDA ran — `isEstimated={false}`. Otherwise `isEstimated={true}`.

**Important:** `isEstimated` defaults to `false` — existing callers that do not pass the prop are unaffected.

### Error handling patterns (confirmed correct, do not change)

| API | Failure mode | Degraded state | User visibility |
|-----|-------------|----------------|-----------------|
| Gemini (scan) | Both models fail → `AI_UNAVAILABLE` 503 | Inline `ScanErrorOverlay` in `CameraModal` | Visible — dusty rose overlay + retry |
| Gemini (enrich) | Ingredient inference fails | `inferIngredients` returns `{ servings: 1, ingredients: [] }` | None — empty ingredients |
| Google Places (nearby) | `PLACES_ERROR` 502 | `apiError` response; client renders no results | None — no restaurant suggestions |
| Google Places (photos) | `.catch(() => [])` in route | `photoUrl: null` → `PhotoFrame` placeholder tile | None — warm placeholder |
| USDA | Network failure or bad response | `lookupUsdaMacros` returns `nullResult` | None without "Est." label fix |
| USDA | Key not configured | `usdaKey` is falsy → `enrichedIngredients` built with null macros | None without "Est." label fix |

### NFR compliance

- **NFR15** — Failure of any single external API does not crash the application. Validated by AC4 + AC5 tests.
- **NFR16** — Places photo fetch failures produce warm placeholder tile. Already enforced by `PhotoFrame`; validated by AC2 tests.
- **NFR17** — USDA lookup failures produce AI-estimated macros with "Est." label. Requires `MacroBar` `isEstimated` fix (Gap 2); validated by AC3 tests.
- **NFR18** — Gemini parsing failures produce inline error with retry, not a generic error page. Requires `CameraModal` inline error fix (Gap 1); validated by AC1 tests.

---

## Testing Requirements

### Framework

Vitest + React Testing Library. All test files use `vi.fn()` / `vi.spyOn()` for mocking and `vi.mock()` for module-level mocks.

---

### Test file 1: `src/components/capture/CameraModal.degraded.test.tsx`

> **Note:** Gemini scan failure modes — augments the existing `CameraModal.test.tsx` rather than replacing it.

```
describe('CameraModal — Gemini scan degraded states')
  ├── shows ScanErrorOverlay when /api/scan returns 503 AI_UNAVAILABLE
  ├── shows ScanErrorOverlay when /api/scan returns 503 SCAN_SERVICE_UNAVAILABLE
  ├── shows ScanErrorOverlay on network failure (fetch throws)
  ├── ScanErrorOverlay has dusty rose tint (background contains rgba(188, 108, 110))
  ├── ScanErrorOverlay renders "Try again" retry button
  ├── clicking retry clears ScanErrorOverlay and restarts camera
  ├── modal stays open (does not call onClose) when scan fails
  ├── onProcessingError is NOT called when scan fails (inline error only)
  ├── onProcessingError IS called when cameraError occurs (hardware failure)
  ├── ScanErrorOverlay is absent when scan succeeds
  └── ScanErrorOverlay is absent when modal is first opened
```

**Mock setup:**

```typescript
// Mock fetch to simulate API failure modes
vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
  if (url.includes('/api/scan')) {
    return new Response(
      JSON.stringify({ error: { message: 'Scan service temporarily unavailable', code: 'AI_UNAVAILABLE' } }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
  return new Response('{}', { status: 200 });
});
```

---

### Test file 2: `src/app/api/scan/scan-route-gemini-degraded.test.ts`

> API route unit tests for Gemini failure modes.

```
describe('/api/scan — Gemini degraded states')
  ├── returns AI_UNAVAILABLE 503 when both gemini-2.5-flash and gemini-2.0-flash fail
  ├── falls back to gemini-2.0-flash when primary fails with 503
  ├── falls back to gemini-2.0-flash when primary fails with 429 (quota)
  ├── falls back to gemini-2.0-flash when primary fails with "overloaded"
  ├── does NOT fall back to gemini-2.0-flash on 400 (bad request — non-transient)
  ├── returns GEMINI_RESPONSE_UNPARSEABLE 422 when Gemini returns malformed JSON
  ├── returns GEMINI_RESPONSE_INVALID 422 when Gemini returns valid JSON but wrong schema
  ├── returns NO_DISHES 422 when all dishes have empty names
  ├── returns SCAN_SERVICE_UNAVAILABLE 503 when no Gemini API key is configured
  └── outer try/catch returns INTERNAL_ERROR 500 on unexpected throws
```

**Mock setup:**

```typescript
import { GoogleGenerativeAI } from '@google/generative-ai';

vi.mock('@google/generative-ai');
vi.mock('@/lib/api-keys', () => ({
  getApiKeys: () => ({ gemini: 'test-key', usda: null, places: null }),
}));
vi.mock('@/lib/menuCache', () => ({
  getCachedMenu: vi.fn().mockResolvedValue(null),
  cacheMenu: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));

// Simulate both models failing:
const mockGenerateContent = vi.fn()
  .mockRejectedValueOnce(new Error('503 Service Unavailable'))  // primary fails
  .mockRejectedValueOnce(new Error('503 Service Unavailable')); // fallback fails

(GoogleGenerativeAI as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => ({
  getGenerativeModel: () => ({ generateContent: mockGenerateContent }),
}));
```

---

### Test file 3: `src/app/api/places/places-degraded.test.ts`

> API route unit tests for Places failure modes.

```
describe('/api/places/nearby — Places API degraded states')
  ├── returns PLACES_ERROR 502 when Places API returns 500
  ├── returns PLACES_ERROR 502 when Places API returns 429
  ├── returns PLACES_ERROR 502 when Places API returns 403 (invalid key)
  ├── returns SERVICE_UNAVAILABLE 503 when no Places API key is configured
  ├── degrades to empty places array when response schema is malformed
  ├── photo resolution failure (.catch(() => [])) yields photoUrl: null, not an error
  ├── photo resolution timeout (AbortController fires) yields photoUrl: null
  └── returns INTERNAL_ERROR 500 on unexpected throws
```

**Key assertion for photo degradation:**

```typescript
it('photo resolution failure yields photoUrl: null with no error', async () => {
  // mock getRestaurantPhotos to throw
  vi.mocked(getRestaurantPhotos).mockRejectedValue(new Error('network failure'));

  const req = new NextRequest('http://localhost/api/places/nearby', {
    method: 'POST',
    body: JSON.stringify({ lat: 43.6532, lng: -79.3832 }),
  });
  const res = await POST(req);
  const body = await res.json();

  expect(res.status).toBe(200);
  expect(body.data[0].photoUrl).toBeNull();  // degraded to null, not an error
});
```

---

### Test file 4: `src/app/api/scan/enrich-degraded.test.ts`

> API route unit tests for USDA and Gemini enrichment failure modes.

```
describe('/api/scan/enrich — USDA degraded states')
  ├── returns null macros for all ingredients when USDA API returns 500
  ├── returns null macros for all ingredients when USDA API returns 429
  ├── returns null macros for all ingredients when USDA API times out (AbortController)
  ├── returns null macros when usdaKey is not configured
  ├── returns null macros when USDA returns malformed JSON (Zod catch fires)
  ├── USDA failure for one ingredient does not block others (Promise.allSettled)
  └── dish totals (totalCalories etc.) are null when all USDA lookups fail

describe('/api/scan/enrich — Gemini ingredient inference degraded states')
  ├── returns empty ingredients array when Gemini inference fails
  ├── returns empty ingredients array when Gemini returns invalid JSON
  ├── returns empty ingredients array when Zod schema validation fails
  ├── Gemini inference failure for one dish does not block other dishes
  └── returns ENRICH_SERVICE_UNAVAILABLE 503 when no Gemini key configured
```

**Mock setup for USDA failure:**

```typescript
vi.mock('@/lib/api-keys', () => ({
  getApiKeys: () => ({
    gemini: 'test-gemini-key',
    usda: 'test-usda-key',
    places: null,
    cseKey: null,
    cseCx: null,
  }),
}));

// Simulate USDA 500:
vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
  const url = typeof input === 'string' ? input : (input as Request).url;
  if (url.includes('api.nal.usda.gov')) {
    return new Response('Internal Server Error', { status: 500 });
  }
  // ... other mocks
});
```

---

### Test file 5: `src/hooks/useEnrichment.degraded.test.ts`

> Hook-level tests for the enrichment pipeline when external APIs fail.

```
describe('useEnrichment — degraded states')
  ├── /api/scan/enrich 503 is handled silently — no error thrown, isEnriching returns to false
  ├── /api/scan/enrich network failure is handled silently
  ├── enrichment failure does not dispatch plately:enriched event
  ├── enrichment failure does not modify sessionStorage
  ├── Supabase write failure in Promise.allSettled does not throw
  ├── Supabase write for one recipe failing does not block other recipe writes
  └── queryClient.invalidateQueries is NOT called when enrichment fails before write step
```

**Key isolation test:**

```typescript
it('Supabase write failure does not throw or call console.error', async () => {
  const consoleSpy = vi.spyOn(console, 'error');
  // Setup: enrich returns valid data, but Supabase update throws
  vi.mocked(supabase.from).mockReturnValue({
    update: vi.fn().mockRejectedValue(new Error('Supabase connection error')),
    eq: vi.fn(),
  } as never);

  const { result } = renderHook(() => useEnrichment(), { wrapper: QueryClientWrapper });
  act(() => {
    result.current.enrich('plately:scan:test-key', { 'dish-id-1': 'recipe-uuid-1' });
  });
  await waitFor(() => expect(result.current.isEnriching).toBe(false));

  expect(consoleSpy).not.toHaveBeenCalledWith(expect.stringContaining('Uncaught'));
});
```

---

### Test file 6: `src/components/ui/MacroBar.estimated.test.tsx`

> MacroBar "Est." label rendering for USDA degraded state.

```
describe('MacroBar — isEstimated prop')
  ├── renders "Est." label for each non-null macro when isEstimated is true
  ├── does NOT render "Est." label when isEstimated is false
  ├── does NOT render "Est." label when isEstimated is omitted (defaults false)
  ├── does NOT render "Est." label for null macro values (—) even when isEstimated is true
  ├── "Est." label has aria-label="estimated value"
  └── all four macro cells render correctly when all macros are null and isEstimated is true
```

---

### Test coverage summary

| Failure mode | Coverage | NFR |
|-------------|---------|-----|
| Gemini scan — both models fail | `CameraModal.degraded.test.tsx` + `scan-route-gemini-degraded.test.ts` | NFR18 |
| Gemini scan — malformed JSON | `scan-route-gemini-degraded.test.ts` | NFR18 |
| Gemini scan — 429/503 transient → fallback | `scan-route-gemini-degraded.test.ts` | NFR18 |
| Gemini enrichment inference failure | `enrich-degraded.test.ts` | NFR15 |
| Places API failure | `places-degraded.test.ts` | NFR16 |
| Places photo resolution failure | `places-degraded.test.ts` | NFR16 |
| USDA 500/429/timeout | `enrich-degraded.test.ts` | NFR17 |
| USDA — one ingredient fails, others succeed | `enrich-degraded.test.ts` | NFR15 |
| useEnrichment total pipeline failure | `useEnrichment.degraded.test.ts` | NFR15 |
| MacroBar "Est." label display | `MacroBar.estimated.test.tsx` | NFR17 |

---

## What Does NOT Change in This Story

| File | Reason |
|------|--------|
| `src/app/api/scan/route.ts` | Error handling and fallback logic are already correct; only test coverage is added |
| `src/app/api/places/nearby/route.ts` | Photo `.catch(() => [])` degradation is already correct; only test coverage is added |
| `src/app/api/scan/enrich/route.ts` | `lookupUsdaMacros` null-return on failure is already correct; only test coverage is added |
| `src/hooks/useEnrichment.ts` | Silent-catch and `Promise.allSettled` patterns are already correct; only test coverage is added |
| `src/components/ui/PhotoFrame.tsx` | Already handles `photoStatus: 'placeholder'` with warm tile; no changes needed |
| `src/types/database.ts` | No type changes needed |
| Any migration files | No schema changes |
| `src/components/screens/RestaurantScreen.tsx` | No changes needed |
| `planning/sprint-status.yaml` | Do NOT update |

---

## Architecture Guardrails

- **Inline error, not toast** — Gemini scan failure (`AI_UNAVAILABLE`) must produce a dusty rose overlay inside `CameraModal`. Do not route this through `onProcessingError` (which leads to a toast or parent-level error UI). The modal stays open and the user retries from within it.
- **Silent degradation for Places + USDA** — Neither Places nor USDA failures produce any user-visible notification. `useEnrichment` and the API routes already swallow these silently. Do not add toasts or banners for these cases.
- **`onProcessingError` is NOT removed** — It remains on the `CameraModalProps` interface for hardware camera errors (stream failures, permission denials via `cameraError`). Only Gemini scan errors use the new inline path.
- **`MacroBar` backward compatibility** — `isEstimated` defaults to `false`. All existing `MacroBar` call sites that do not pass the prop are unaffected.
- **`Promise.allSettled` is mandatory** — Any parallel async work in enrichment hooks must use `Promise.allSettled`, never `Promise.all`. A single Supabase write failure must never propagate to the top-level catch.
- **No PII in logs** — Do not log recipe names, dish names, or user identifiers in error paths. Log only error messages and codes.
- **TypeScript strict** — All new props and state must be fully typed. No `any` in new code.

---

## Implementation Order

> **This story must be implemented LAST in Epic 6**, after stories 6-1 through 6-4 are complete. It serves as the end-to-end validation pass that confirms all degraded states defined in prior stories are working as a cohesive system.

The recommended implementation order within this story:

1. **Audit only** — Read the current state of all five key files. Confirm which gaps exist (do not assume the gap audit above is still accurate at implementation time; verify against the current code).
2. **Gap 2 (MacroBar)** — Add `isEstimated` prop and render the "Est." label. Update all call sites. Write `MacroBar.estimated.test.tsx`.
3. **Gap 1 (CameraModal)** — Add `scanError` state, `ScanErrorOverlay` component, retry handler. Write `CameraModal.degraded.test.tsx`.
4. **API route tests** — Write `scan-route-gemini-degraded.test.ts`, `places-degraded.test.ts`, `enrich-degraded.test.ts`.
5. **Hook tests** — Write `useEnrichment.degraded.test.ts`.
6. **Full suite pass** — Run all tests; confirm no regressions.

---

## Definition of Done

- [ ] Gap audit performed against current code; any discrepancies from this story's audit are noted in the Dev Agent Record
- [ ] `CameraModal.tsx` updated: `scanError` state, `ScanErrorOverlay` sub-component (dusty rose tint, retry button), retry handler, modal stays open on Gemini failure
- [ ] `onProcessingError` prop is retained and still fires for hardware camera errors
- [ ] `MacroBar.tsx` updated: `isEstimated?: boolean` prop, "Est." label renders per non-null cell when true, defaults to false
- [ ] All call sites of `MacroBar` updated to pass `isEstimated` appropriately
- [ ] `src/components/capture/CameraModal.degraded.test.tsx` — all cases passing
- [ ] `src/app/api/scan/scan-route-gemini-degraded.test.ts` — all cases passing
- [ ] `src/app/api/places/places-degraded.test.ts` — all cases passing
- [ ] `src/app/api/scan/enrich-degraded.test.ts` — all cases passing
- [ ] `src/hooks/useEnrichment.degraded.test.ts` — all cases passing
- [ ] `src/components/ui/MacroBar.estimated.test.tsx` — all cases passing
- [ ] No unhandled promise rejections in any test
- [ ] No new `console.error` calls reference uncaught exceptions
- [ ] TypeScript strict: no new errors
- [ ] Full test suite passes with no regressions
- [ ] `planning/sprint-status.yaml` is NOT modified

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — no external debug logs required. All failures were diagnosed inline from vitest output.

### Completion Notes List

- Gap audit confirmed: Gap 1 (CameraModal inline error) and Gap 2 (MacroBar `isEstimated`) required new code; Gaps 3–5 were already correct in production code and required test coverage only.
- `CameraModal.tsx` extended with `scanError` state and `ScanErrorOverlay` sub-component (dusty rose `rgba(188, 108, 110, 0.22)` tint, retry button). `onProcessingError` retained for hardware camera errors; Gemini scan failures use the inline path exclusively.
- `MacroBar.tsx` extended with `isEstimated?: boolean` (defaults `false`). "Est." label rendered per non-null cell with `aria-label="estimated value"`. `DishRowExpanded.tsx` wired up to pass `isEstimated={macroSource === 'ai'}`.
- `CameraModal.test.tsx` updated: removed two tests that relied on `onProcessingError` being called for Gemini failures (now fires inline instead). Both tests replaced with inline-error assertions.
- `useEnrichment.degraded.test.ts` initial draft used module-scope `const` for `mockEq`/`mockUpdate`/`mockFrom` inside `vi.mock()` factory — caused `ReferenceError: Cannot access 'mockFrom' before initialization`. Fixed by wrapping all three in `vi.hoisted()`.
- `enrich-degraded.test.ts` multi-dish concurrent isolation test initially used 4 `mockResolvedValueOnce` calls in incorrect order. With `Promise.all`, dish1 and dish2 inference calls are dispatched synchronously in array order, so call sequence is dish1.inference, dish2.inference, dish1.rating, dish2.rating. Fixed by using `mockRejectedValueOnce` (dish1 inference) + `mockResolvedValue` (all subsequent calls, covers any ordering).
- Pre-existing failure in `HomeScreen.test.tsx:408` (`getByRole('article')` not found) is unrelated to this story and was present before implementation. Not fixed — out of scope.
- Full suite result: 1 failed (pre-existing HomeScreen) | 60 passed | 728 passing tests | 1 todo.

### File List

**Modified:**
- `src/components/capture/CameraModal.tsx` — Added `scanError` state, `ScanErrorOverlay` sub-component, `handleScanRetry`, inline error path in `submitImage`
- `src/components/capture/CameraModal.test.tsx` — Updated two tests that previously asserted `onProcessingError` is called for Gemini failures; replaced with inline ScanErrorOverlay assertions
- `src/components/scan/ScanConfidenceBanner.tsx` — Minor: no functional changes (reviewed only)
- `src/components/ui/MacroBar.tsx` — Added `isEstimated?: boolean` prop, "Est." label render logic
- `src/components/screens/RestaurantScreen.tsx` — No changes (reviewed only)

**Created:**
- `src/components/capture/CameraModal.degraded.test.tsx` — 12 tests (Gemini scan degraded states, AC1)
- `src/components/ui/MacroBar.estimated.test.tsx` — 6 tests (MacroBar isEstimated prop, AC3)
- `src/app/api/scan/scan-route-gemini-degraded.test.ts` — 10 tests (scan route Gemini failure modes, AC1)
- `src/app/api/places/places-degraded.test.ts` — 8 tests (Places API degraded states, AC2)
- `src/app/api/scan/enrich-degraded.test.ts` — 12 tests (USDA + Gemini enrichment degraded states, AC3 + AC5)
- `src/hooks/useEnrichment.degraded.test.ts` — 7 tests (hook pipeline degraded states, AC4 + AC5)

**Not modified (verified correct as-is):**
- `src/app/api/scan/route.ts`
- `src/app/api/places/nearby/route.ts`
- `src/app/api/scan/enrich/route.ts`
- `src/hooks/useEnrichment.ts`
- `src/components/ui/PhotoFrame.tsx`

### Change Log

| # | File | Change |
|---|------|--------|
| 1 | `CameraModal.tsx` | Added `scanError: string \| null` state; `ScanErrorOverlay` sub-component; `handleScanRetry`; inline error path replaces `onProcessingError` call for Gemini failures; reset `scanError` on close and open |
| 2 | `CameraModal.test.tsx` | Removed 2 tests expecting `onProcessingError` for Gemini errors; replaced with `scan-error-overlay` testid assertions |
| 3 | `MacroBar.tsx` | Added `isEstimated?: boolean` to `MacroBarProps`; added "Est." label span (9px, `var(--color-text-tertiary)`, `aria-label="estimated value"`) per non-null cell when prop is true |
| 4 | `DishRowExpanded.tsx` | Passed `isEstimated={macroSource === 'ai'}` to `MacroBar` |
| 5 | `CameraModal.degraded.test.tsx` | New — 12 tests for inline scan error overlay behaviour |
| 6 | `MacroBar.estimated.test.tsx` | New — 6 tests for isEstimated prop rendering |
| 7 | `scan-route-gemini-degraded.test.ts` | New — 10 tests for Gemini failure modes in /api/scan |
| 8 | `places-degraded.test.ts` | New — 8 tests for Places API failure modes in /api/places/nearby |
| 9 | `enrich-degraded.test.ts` | New — 12 tests for USDA + Gemini enrichment degraded states |
| 10 | `useEnrichment.degraded.test.ts` | New — 7 tests for hook-level pipeline degradation |
