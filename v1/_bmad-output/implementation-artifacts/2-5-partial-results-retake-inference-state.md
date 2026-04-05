# Story 2.5: Partial Results, Retake & Inference State

**Status:** done
**Story ID:** 2.5
**Epic:** 2 — Scan & AI Identification

---

## Story

As a user scanning in difficult conditions,
I want the app to handle low-confidence and partial results gracefully,
So that I always have a path forward even when lighting or image quality is poor.

---

## Acceptance Criteria

**Given** a menu scan identifies fewer dishes than are present on the menu (FR09)
**When** the results screen renders
**Then** a partial result banner displays: "We identified X of Y dishes — lighting may be affecting accuracy. Retake or continue with what we found?"; the identified dishes are fully displayed and actionable below the banner

**Given** the partial result banner is visible
**When** the user taps "Retake"
**Then** the camera modal reopens; the `['scan-result', scanId]` cache entry is cleared immediately on retake (deliberate user action); the new scan's `setQueryData` call populates fresh results

**Given** a dish scan where the combined confidence score falls below the auto-presentation threshold (FR12)
**When** the inference state renders
**Then** it shows: the user's captured photo (small, left) alongside a reference photo of the closest match (small, right); both images are equal dimensions (radius-xs); a natural-language question below (e.g., "Based on this photo, this looks most like a classic Carbonara. Does that match what you ordered?")

**Given** the inference state is shown
**When** the user confirms ("Yes, that's it")
**Then** `confidenceSource` is recorded as `'user-confirmed'`; the page transitions to `ScanResults` where the user can tap any dish to open the standard dish detail bottom sheet (no auto-open required)

**Given** the inference state is shown
**When** the user taps "No" or enters a correction
**Then** the correction input is shown as a UI affordance; **MVP**: submitting a correction is equivalent to retake (re-opens camera); full correction re-submission (forwarding text to the API) is deferred to V2 due to NFR07 (images not stored beyond request lifecycle)

**Given** a `DishResult` contains ingredients with `confidenceLevel: 'low'`
**When** shown in the ingredient list (FR40)
**Then** each low-confidence ingredient has a visual indicator (e.g., an icon) AND a text label (e.g., "varies by restaurant"); colour is never the sole indicator of uncertainty (NFR16)

---

## Tasks / Subtasks

- [x] Task 1: Update `src/types/api.ts` — add new fields
  - [x] Add `totalDishCount?: number` to `ScanResult` (for partial results)
  - [x] Add `'inference'` to `confidenceSource` union type: `'gemini-only' | 'multi-source' | 'user-confirmed' | 'inference'`

- [x] Task 2: Update `src/app/api/scan/menu/route.ts` — return total dish count
  - [x] Update `MENU_SCAN_PROMPT` to request `totalDishesOnMenu` count alongside `dishes`
  - [x] Update `parseGeminiMenuResponse` to extract `totalDishesOnMenu` (see Dev Notes)
  - [x] Return `totalDishCount` in the `ScanResult` (only when `totalDishesOnMenu > dishes.length`)

- [x] Task 3: Update `src/app/api/scan/dish/route.ts` — detect inference threshold
  - [x] After parsing, calculate confidence distribution: if `>60%` of ingredients are `'low'`, set `confidenceSource: 'inference'`
  - [x] Otherwise keep `confidenceSource: 'gemini-only'` (no change)
  - [x] Add helper function `requiresInference(dishes: DishResult[]): boolean` (see Dev Notes)

- [x] Task 4: Update `src/hooks/use-scan.ts` — store thumbnail in TQ cache
  - [x] In `onSuccess` callback: also call `queryClient.setQueryData(['scan-thumbnail', result.scanId], thumbnailUrl)` immediately after the scan result cache write (the `thumbnailUrl` param is in scope via closure from `submitScan`)
  - [x] `cancelScan`: also clear the thumbnail cache for the current scanId via `queryClient.removeQueries({ queryKey: ['scan-thumbnail'] })` (cleans up any orphaned thumbnail)

- [x] Task 5: Create `src/components/scan/inference-state.tsx` (NEW)
  - [x] Subscribe to TQ cache via `useQuery(['scan-result', scanId], enabled: false, initialData: result)` for reactive reference photo
  - [x] Show side-by-side comparison: left = user thumbnail (`thumbnailUrl`), right = `dish.imageUrl` (reactive); both `64×64pt` or `80×80pt`, `radius-xs`
  - [x] Show dish name: "This looks most like [dish.name]"
  - [x] Show question: "Does that match what you ordered?"
  - [x] "Yes, that's it" button: calls `onConfirm(scanId)` → parent updates cache and re-renders
  - [x] "No, retake" button: calls `onRetake()` → same retake logic as existing retake button
  - [x] Optional: text input for dish name correction + "Try again" button (see Dev Notes for re-submission)

- [x] Task 6: Update `src/components/scan/scan-results.tsx` — partial results banner
  - [x] Add banner: render when `activeResult.totalDishCount && activeResult.dishes.length < activeResult.totalDishCount`
  - [x] Banner text: `"We identified ${dishes.length} of ${totalDishCount} dishes — lighting may be affecting accuracy. Retake or continue with what we found?"`
  - [x] Banner includes a "Retake" button that calls the existing `handleRetake()`
  - [x] Banner uses glass styling: `rgba(255,255,255,0.10)`, `radius-md`, 16pt padding
  - [x] No structural changes to the dish list below it

- [x] Task 7: Update `src/app/scan/results/page.tsx` — route to inference vs results
  - [x] Make the scan result read reactive: replace `queryClient.getQueryData(...)` with `useQuery({ queryKey: ['scan-result', scanId], queryFn: ..., enabled: !!scanId, initialData: ..., staleTime: Infinity })`
  - [x] If `scanResult.confidenceSource === 'inference'`: render `<InferenceState result={scanResult} scanId={scanId} thumbnailUrl={...} onRetake={handleRetake} onConfirm={handleConfirm} />`
  - [x] Otherwise: render `<ScanResults result={scanResult} scanId={scanId} />` (unchanged)
  - [x] `handleConfirm`: updates TQ cache `confidenceSource: 'user-confirmed'`; page re-renders to `ScanResults` automatically via reactive `useQuery`
  - [x] `handleRetake`: same retake logic (navigate home + dispatch `plately:openCamera`); currently in `ScanResults`, extract to page level or pass as prop

- [x] Task 8: Write tests
  - [x] `src/app/api/scan/menu/route.test.ts` — add tests for `totalDishCount` in response
  - [x] `src/app/api/scan/dish/route.test.ts` — add test for inference state detection (`>60%` low confidence → `confidenceSource: 'inference'`)
  - [x] `src/components/scan/inference-state.test.tsx` (NEW) — see Dev Notes for test patterns
  - [x] `src/components/scan/scan-results.test.tsx` — add partial banner tests
  - [x] `src/hooks/use-scan.test.ts` — add test for thumbnail stored in TQ cache on scan success

---

## Dev Notes

### File Locations

```
src/
  types/
    api.ts                                ← MODIFY (Task 1)
  app/
    api/
      scan/
        menu/
          route.ts                        ← MODIFY (Task 2)
          route.test.ts                   ← MODIFY (Task 8)
        dish/
          route.ts                        ← MODIFY (Task 3)
          route.test.ts                   ← MODIFY (Task 8)
    scan/
      results/
        page.tsx                          ← MODIFY (Task 7)
  hooks/
    use-scan.ts                           ← MODIFY (Task 4)
    use-scan.test.ts                      ← MODIFY (Task 8)
  components/
    scan/
      inference-state.tsx                 ← NEW (Task 5)
      inference-state.test.tsx            ← NEW (Task 8)
      scan-results.tsx                    ← MODIFY (Task 6)
      scan-results.test.tsx               ← MODIFY (Task 8)
```

### What Already Exists (do NOT recreate)

- `scan/dish/page.tsx` already renders per-ingredient confidence indicators (`⚠ varies by restaurant` — icon + text, NFR16 compliant). **FR40 is done** for the "See Full Details" view. Do not modify `scan/dish/page.tsx` in this story.
- `scan-results.tsx` already has `handleRetake()`, `useQuery` TQ cache subscription (added in Story 2.4), and the dish list render.
- `BottomSheet` at `@/components/ui/bottom-sheet` is feature-complete — do not modify.
- `GlassCard` at `@/components/ui/glass-card` is feature-complete — do not modify.
- `EvidenceBlock` in `dish-detail-sheet.tsx` has high and medium states — **do not add an inference state to it**. The inference state is handled by the new `InferenceState` component and the `ScanResults` page, not inside `DishDetailSheet`.
- The `retake` logic in `scan-results.tsx`: `queryClient.removeQueries({ queryKey: ['scan-result', scanId] })` + `router.push('/')` + `window.dispatchEvent(new CustomEvent('plately:openCamera'))` after 300ms. Extract this to `scan/results/page.tsx` and pass as `onRetake` prop to both `ScanResults` and `InferenceState`.

### Task 1: Type Changes (`api.ts`)

```typescript
export interface ScanResult {
  scanId: string
  type: 'menu' | 'dish'
  dishes: DishResult[]
  confidenceSource: 'gemini-only' | 'multi-source' | 'user-confirmed' | 'inference'
  /** Total dishes visible on the menu (for partial results banner). Only present when
   *  fewer dishes were identified than are visible. Always >= dishes.length when present. */
  totalDishCount?: number
}
```

### Task 2: Menu Route — Gemini Prompt Update

Update `MENU_SCAN_PROMPT` to request the total count:

```
Return ONLY valid JSON in this exact format:
{
  "totalDishesOnMenu": number,
  "dishes": [
    {
      "name": "...",
      "description": "...",
      "calorieEstimate": number or null
    }
  ]
}

Rules:
- totalDishesOnMenu: the total count of dishes you can see on this menu (including those you couldn't fully identify)
- Include every dish you CAN fully identify in the "dishes" array
- [other rules unchanged]
```

Update `parseGeminiMenuResponse` return type to also return `totalDishesOnMenu`:

```typescript
function parseGeminiMenuResponse(text: string): { dishes: DishResult[]; totalDishesOnMenu: number | null } | null {
  // ...
  const totalDishesOnMenu = Number.isFinite(parsed?.totalDishesOnMenu) && (parsed.totalDishesOnMenu as number) > 0
    ? (parsed.totalDishesOnMenu as number)
    : null
  return { dishes: parsedDishes, totalDishesOnMenu }
}
```

In the route handler, only include `totalDishCount` in the result when it signals a partial result:

```typescript
const scanResult: ScanResult = {
  scanId: crypto.randomUUID(),
  type: 'menu',
  dishes: parsed.dishes,
  confidenceSource: 'gemini-only',
  ...(parsed.totalDishesOnMenu && parsed.totalDishesOnMenu > parsed.dishes.length
    ? { totalDishCount: parsed.totalDishesOnMenu }
    : {}),
}
```

### Task 3: Dish Route — Inference Threshold

Add this helper before the route handler:

```typescript
/** Returns true if >60% of ingredients across all dishes are 'low' confidence. */
function requiresInference(dishes: DishResult[]): boolean {
  const allIngredients = dishes.flatMap((d) => d.ingredients)
  if (allIngredients.length === 0) return false
  const lowCount = allIngredients.filter((i) => i.confidenceLevel === 'low').length
  return lowCount / allIngredients.length > 0.6
}
```

In the handler, after parsing:

```typescript
const scanResult: ScanResult = {
  scanId: crypto.randomUUID(),
  type: 'dish',
  dishes,
  confidenceSource: requiresInference(dishes) ? 'inference' : 'gemini-only',
}
```

### Task 4: `use-scan.ts` — Thumbnail Cache

In `onSuccess` callback, add one line after the existing `setQueryData`:

```typescript
onSuccess: (result) => {
  if (mutationGenRef.current !== gen) return
  queryClient.setQueryData(['scan-result', result.scanId], result)
  queryClient.setQueryData(['scan-thumbnail', result.scanId], thumbnailUrl)  // NEW
  setState((prev) => ({ ...prev, status: 'ready', scanId: result.scanId }))
  void fireEnrichment(result)
},
```

The `thumbnailUrl` is available in the closure because `submitScan` receives it as a parameter and the `onSuccess` callback is defined inside the `submitScan` call, where `thumbnailUrl` is in scope.

In `cancelScan`, clean up the thumbnail cache:
```typescript
const cancelScan = () => {
  abortRef.current?.abort()
  if (state.scanId) queryClient.removeQueries({ queryKey: ['scan-thumbnail', state.scanId] })
  setState({ status: 'idle', scanId: null, thumbnailUrl: null })
}
```

**Note:** `state.scanId` inside `cancelScan` needs to be read from `state`. The current `cancelScan` uses the closure over the component state, which works correctly.

### Task 5: `inference-state.tsx` Component

```typescript
'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ScanResult } from '@/types/api'

interface InferenceStateProps {
  result: ScanResult
  scanId: string
  onRetake: () => void
  onConfirm: () => void
}

export function InferenceState({ result, scanId, onRetake, onConfirm }: InferenceStateProps) {
  const queryClient = useQueryClient()
  const [correctionText, setCorrectionText] = useState('')
  const [showCorrection, setShowCorrection] = useState(false)

  // Subscribe to TQ cache for reactive reference photo (imageUrl arrives via enrichment)
  const { data: liveResult } = useQuery<ScanResult>({
    queryKey: ['scan-result', scanId],
    queryFn: () => queryClient.getQueryData<ScanResult>(['scan-result', scanId]) ?? result,
    enabled: false,
    initialData: result,
    staleTime: Infinity,
  })

  const thumbnailUrl = queryClient.getQueryData<string>(['scan-thumbnail', scanId])
  const activeResult = liveResult ?? result
  const dish = activeResult.dishes[0]  // dish scan always has one dish
  if (!dish) return null

  const handleConfirm = () => {
    queryClient.setQueryData<ScanResult>(['scan-result', scanId], (cached) => {
      if (!cached) return cached
      return { ...cached, confidenceSource: 'user-confirmed' }
    })
    onConfirm()
  }

  const handleCorrectionSubmit = () => {
    // For MVP: re-submit is equivalent to retake (correction text path is V2 when image isn't stored)
    onRetake()
  }

  return (
    <div style={{ padding: '0 var(--spacing-4)', paddingBottom: '80px' }}>
      {/* Header */}
      <div style={{ padding: 'var(--spacing-4) 0', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
        Help us confirm this dish
      </div>

      {/* Side-by-side photo comparison */}
      <div style={{ display: 'flex', gap: 'var(--spacing-4)', justifyContent: 'center', marginBottom: 'var(--spacing-4)' }}>
        {/* User's photo (left) */}
        <div style={{ textAlign: 'center' }}>
          {thumbnailUrl ? (
            <img src={thumbnailUrl} alt="Your photo" style={{ width: '80px', height: '80px', borderRadius: 'var(--radius-xs)', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: '80px', height: '80px', borderRadius: 'var(--radius-xs)', background: 'rgba(255,255,255,0.08)' }} aria-hidden="true" />
          )}
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', display: 'block', marginTop: '4px' }}>Your photo</span>
        </div>

        {/* Reference photo (right) — reactive via TQ */}
        <div style={{ textAlign: 'center' }}>
          {dish.imageUrl ? (
            <img src={dish.imageUrl} alt={`Reference: ${dish.name}`} style={{ width: '80px', height: '80px', borderRadius: 'var(--radius-xs)', objectFit: 'cover', display: 'block' }} />
          ) : (
            <div style={{ width: '80px', height: '80px', borderRadius: 'var(--radius-xs)', background: 'rgba(255,255,255,0.08)' }} aria-hidden="true" />
          )}
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', display: 'block', marginTop: '4px' }}>Reference: {dish.name}</span>
        </div>
      </div>

      {/* Question */}
      <p style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', marginBottom: 'var(--spacing-2)', textAlign: 'center' }}>
        Based on this photo, this looks most like <strong>{dish.name}</strong>.
      </p>
      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--spacing-6)', textAlign: 'center' }}>
        Does that match what you ordered?
      </p>

      {/* Confirm button */}
      <button
        onClick={handleConfirm}
        style={{ width: '100%', height: '56px', borderRadius: 'var(--radius-xl)', background: 'rgba(255,255,255,0.90)', color: 'var(--text-on-button)', fontWeight: 600, fontSize: 'var(--text-base)', border: 'none', cursor: 'pointer', marginBottom: 'var(--spacing-3)' }}
        aria-label="Confirm dish identification"
      >
        Yes, that&apos;s it
      </button>

      {/* Reject / correction */}
      {!showCorrection ? (
        <button
          onClick={() => setShowCorrection(true)}
          style={{ width: '100%', height: '44px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', marginBottom: 'var(--spacing-3)' }}
        >
          No, that&apos;s not right
        </button>
      ) : (
        <div style={{ marginBottom: 'var(--spacing-3)' }}>
          <input
            type="text"
            value={correctionText}
            onChange={(e) => setCorrectionText(e.target.value)}
            placeholder="What dish is this? (e.g. Duck Confit)"
            style={{ width: '100%', height: '48px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.15)', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', padding: '0 var(--spacing-4)', boxSizing: 'border-box', marginBottom: 'var(--spacing-2)' }}
            aria-label="Enter dish name for re-submission"
          />
          <button
            onClick={handleCorrectionSubmit}
            disabled={!correctionText.trim()}
            style={{ width: '100%', height: '48px', borderRadius: 'var(--radius-md)', background: 'rgba(255,255,255,0.15)', border: 'none', cursor: correctionText.trim() ? 'pointer' : 'not-allowed', color: 'var(--text-primary)', fontSize: 'var(--text-sm)', opacity: correctionText.trim() ? 1 : 0.5 }}
          >
            Try again
          </button>
        </div>
      )}

      {/* Retake button */}
      <button
        onClick={onRetake}
        style={{ width: '100%', height: '44px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}
        aria-label="Retake scan"
      >
        ↺ Retake scan
      </button>
    </div>
  )
}
```

### Task 6: `scan-results.tsx` — Partial Banner

**Add this banner component after the header, before the dish list:**

```typescript
{/* Partial results banner — only shown when fewer dishes identified than present */}
{activeResult.totalDishCount && activeResult.dishes.length < activeResult.totalDishCount && (
  <div
    style={{
      background: 'rgba(255,255,255,0.10)',
      borderRadius: 'var(--radius-md)',
      padding: 'var(--spacing-4)',
      marginBottom: 'var(--spacing-3)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 'var(--spacing-3)',
    }}
    role="status"
    aria-live="polite"
  >
    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 0, flex: 1 }}>
      We identified {activeResult.dishes.length} of {activeResult.totalDishCount} dishes — lighting may be affecting accuracy. Retake or continue with what we found?
    </p>
    <button
      onClick={handleRetake}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 'var(--text-xs)', padding: '0', flexShrink: 0, minHeight: '44px', minWidth: '44px' }}
      aria-label="Retake scan to improve results"
    >
      ↺ Retake
    </button>
  </div>
)}
```

**Extract `handleRetake` to be a prop** — see Task 7.

### Task 7: `scan/results/page.tsx` — Reactive + Inference Routing

The current page reads the scan result once (non-reactive). It must become reactive to handle the inference → user-confirmed transition.

```typescript
'use client'

import { Suspense, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ScanResults } from '@/components/scan/scan-results'
import { InferenceState } from '@/components/scan/inference-state'
import type { ScanResult } from '@/types/api'

export default function ScanResultsPage() {
  return (
    <Suspense fallback={null}>
      <ScanResultsContent />
    </Suspense>
  )
}

function ScanResultsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()

  const scanId = searchParams.get('scanId') ?? ''

  // Reactive: re-renders when cache updates (e.g. inference → user-confirmed)
  const { data: scanResult } = useQuery<ScanResult>({
    queryKey: ['scan-result', scanId],
    queryFn: () => queryClient.getQueryData<ScanResult>(['scan-result', scanId]) ?? null as unknown as ScanResult,
    enabled: !!scanId && !!queryClient.getQueryData(['scan-result', scanId]),
    initialData: queryClient.getQueryData<ScanResult>(['scan-result', scanId]),
    staleTime: Infinity,
  })

  const handleRetake = useCallback(() => {
    if (scanId) {
      queryClient.removeQueries({ queryKey: ['scan-result', scanId] })
      queryClient.removeQueries({ queryKey: ['scan-thumbnail', scanId] })
    }
    router.push('/')
    setTimeout(() => window.dispatchEvent(new CustomEvent('plately:openCamera')), 300)
  }, [scanId, queryClient, router])

  const handleConfirm = useCallback(() => {
    // cache already updated by InferenceState before calling this
    // the useQuery subscription above will re-render with 'user-confirmed' confidenceSource
    // and switch to rendering ScanResults — no action needed here
  }, [])

  if (!scanId || !scanResult) {
    // Fallback for cache miss (page refresh)
    if (typeof window !== 'undefined') router.replace('/')
    return null
  }

  // Route to inference state if confidence is too low
  if (scanResult.confidenceSource === 'inference') {
    return (
      <InferenceState
        result={scanResult}
        scanId={scanId}
        onRetake={handleRetake}
        onConfirm={handleConfirm}
      />
    )
  }

  return <ScanResults result={scanResult} scanId={scanId} onRetake={handleRetake} />
}
```

**Update `ScanResults` interface to accept `onRetake` prop:**

```typescript
interface ScanResultsProps {
  result: ScanResult
  scanId: string
  onRetake?: () => void  // optional — defaults to internal handleRetake if not provided
}
```

If `onRetake` prop is provided, use it; otherwise use the existing internal `handleRetake`. This keeps backward compatibility for existing tests.

### Task 8: Test Approach

**Environment:** Vitest + jsdom. All **169 existing tests must continue passing** (no regressions).

**Required mocks (already established — reuse exactly):**

```typescript
vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }: React.PropsWithChildren<object>) => React.createElement('div', props as React.HTMLAttributes<HTMLDivElement>, children) },
  useReducedMotion: () => false,
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
  useDragControls: () => ({ start: vi.fn() }),
}))

vi.mock('focus-trap-react', () => ({ default: ({ children }: React.PropsWithChildren) => children }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams('scanId=test-scan-id'),
  usePathname: () => '/scan/results',
}))
```

**`route.test.ts` for menu route** — add:
```typescript
// Test: Gemini returns totalDishesOnMenu > dishes identified → ScanResult.totalDishCount is set
// Test: Gemini returns totalDishesOnMenu === dishes.length → ScanResult.totalDishCount is undefined
// Test: Gemini response missing totalDishesOnMenu → ScanResult.totalDishCount is undefined (graceful)
```

**`route.test.ts` for dish route** — add:
```typescript
// Test: all ingredients low confidence → confidenceSource: 'inference'
// Test: <60% ingredients low → confidenceSource: 'gemini-only'
// Test: 0 ingredients → confidenceSource: 'gemini-only' (empty case, no inference)
// Test: exactly 60% low (boundary) → 'gemini-only' (threshold is STRICTLY >60%)
```

**`inference-state.test.tsx`** (new):
```typescript
// Test: renders dish name and question text
// Test: renders 'Your photo' label (thumbnail slot)
// Test: renders 'Reference: [dish name]' label (reference slot)
// Test: clicking "Yes, that's it" calls onConfirm and updates TQ cache to 'user-confirmed'
// Test: clicking "No, that's not right" reveals correction input
// Test: correction input filled + "Try again" calls onRetake (MVP: correction = retake)
// Test: "Retake scan" button calls onRetake
// Test: reactive reference photo — simulate setQueryData with imageUrl → img appears
```

**`scan-results.test.tsx`** — add:
```typescript
// Test: no banner when result has no totalDishCount
// Test: no banner when result.dishes.length === totalDishCount
// Test: banner shown when result.dishes.length < totalDishCount (partial result)
// Test: banner text includes correct X of Y count
// Test: banner retake button calls onRetake prop
```

**`use-scan.test.ts`** — add:
```typescript
// Test: on scan success, thumbnail stored in TQ cache under ['scan-thumbnail', scanId]
// Test: cancelScan clears thumbnail from TQ cache
```

### Architecture Enforcement

| Rule | Detail |
|---|---|
| Server-only boundary | `route.ts` files already have `import 'server-only'` — don't remove |
| API key access | Use `getApiKeys()` — never `process.env` directly in routes |
| TQ key conventions | Use `['scan-thumbnail', scanId]` for thumbnail — follows established `['scan-result', scanId]` pattern |
| Type imports | All shared types in `@/types/api` — no inline redefinitions |
| No image storage | `thumbnailUrl` is a blob URL stored client-side only — never sent to server |
| Retake pattern | The retake sequence: `removeQueries(['scan-result', scanId])` + `router.push('/')` + `dispatchEvent('plately:openCamera')` after 300ms — reuse from page level |
| Error shape | `{ error: string, code: string }` — no other shape |
| Existing test mocks | Use exact mock patterns from previous stories (framer-motion, focus-trap-react, next/navigation) |
| Test count | All 169 existing tests must pass; add ~12+ new tests |
| `onRetake` prop | `ScanResults` should accept `onRetake?: () => void` prop (optional, backward-compatible) |

### Anti-Patterns to Prevent

```typescript
// ❌ Don't add a new 'inference' confidenceSource to DishDetailSheet's EvidenceBlock
// The inference state is handled by InferenceState component, not the evidence block
function EvidenceBlock({ dish }: { dish: DishResult }) { /* has high + medium only */ }

// ✅ InferenceState is a sibling component at the page level, not inside DishDetailSheet

// ❌ Don't store imageBase64 persistently for the "No" correction path
// NFR07: images discarded within request lifecycle
// The correction path in InferenceState routes to onRetake (open camera again)

// ❌ Don't check scanResult.confidenceSource === 'inference' inside ScanResults
// This routing belongs in scan/results/page.tsx

// ❌ Don't read thumbnailUrl from useScan hook in the results page
// The results page doesn't have access to the AppShell's useScan state
// ✅ Read thumbnailUrl from TQ cache: queryClient.getQueryData(['scan-thumbnail', scanId])

// ❌ Don't forget to pass onRetake to ScanResults when extracting retake to page level
// ScanResults currently defines handleRetake internally — extract to page + pass as prop

// ❌ Don't make the page's useQuery call a network fetch
// queryFn should read from TQ cache only (same as ScanResults pattern from 2.4)
// ✅ queryFn: () => queryClient.getQueryData<ScanResult>(['scan-result', scanId]) ?? result

// ❌ Don't fail silently when Gemini doesn't return totalDishesOnMenu
// ✅ It's optional — only include totalDishCount in ScanResult when signal is meaningful
//    (i.e., totalDishesOnMenu > dishes.length)
```

### Story 2.4 Intelligence (Previous Story Learnings)

- **169 tests passing** — do NOT regress
- `use-scan.ts`: `fireEnrichment` is called with `void` (no await) — the `thumbnailUrl` store must also be fire-and-forget in the same `onSuccess` callback
- `scan-results.tsx`: already has `useQuery` TQ subscription (Story 2.4) — the partial banner accesses `activeResult.totalDishCount` which is TQ-subscribed; enrichment updates won't clear `totalDishCount` because `fireEnrichment` merges (not replaces) the cache entry
- The `cancelScan` in `use-scan.ts` needs to clean up `['scan-thumbnail', scanId]` — use `state.scanId` at time of cancel (it may still be set from a previous in-flight scan)
- Test utilities: `createWrapper`, `createWrapperWithClient` patterns established in `scan-results.test.tsx` and `use-scan.test.ts` — reuse in new test file
- **Key: `thumbnailUrl` in closure** — In `submitScan`, `thumbnailUrl` is a parameter; the `onSuccess` callback is inside `mutate(...)` which is called from inside `submitScan`, so `thumbnailUrl` is directly in scope for the closure. No need to put it in state.

### Story Forward Context

**Story 2.6 (Scan Error States & Graceful Degradation)** — will cover:
- `use-scan.ts` error state (already `status: 'error'`)
- Client-side 15s timeout display and retry affordance
- The `InferenceState`'s `onRetake` handler is already the correct hook-in for "try uploading a photo instead" (2.6 will add a UI option)

**Story 3.1 (Recipe Save Flow)** — will modify:
- The "Yes, that's it" confirm in `InferenceState` transitions to `'user-confirmed'` and renders `ScanResults`
- From there, the user opens `DishDetailSheet` and taps "Save Recipe" (Story 3.1 adds actual save logic)
- The `confidenceSource: 'user-confirmed'` will be included in `confidence_metadata_json` when saving

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Implemented all 8 tasks per story spec with no deviations.
- `ScanResult.confidenceSource` extended with `'inference'` union member; `totalDishCount?: number` added.
- Menu route now requests `totalDishesOnMenu` from Gemini and conditionally includes `totalDishCount` (only when partial).
- Dish route uses `requiresInference()` helper — >60% low-confidence ingredients triggers `'inference'` source.
- `use-scan.ts` stores thumbnail URL in TQ cache under `['scan-thumbnail', scanId]` on success; `cancelScan` clears it.
- `InferenceState` component created: side-by-side photo comparison, confirm/reject flow, correction input (MVP: correction = retake).
- `ScanResults` now accepts optional `onRetake` prop (backward-compatible); partial banner renders when `dishes.length < totalDishCount`.
- `scan/results/page.tsx` made reactive via `useQuery`; routes to `InferenceState` when `confidenceSource === 'inference'`, back to `ScanResults` after user confirms.
- 193 tests pass (was 169; added 24 new tests). No regressions.

### File List

- src/types/api.ts
- src/app/api/scan/menu/route.ts
- src/app/api/scan/menu/route.test.ts
- src/app/api/scan/dish/route.ts
- src/app/api/scan/dish/route.test.ts
- src/hooks/use-scan.ts
- src/hooks/use-scan.test.ts
- src/components/scan/inference-state.tsx (NEW)
- src/components/scan/inference-state.test.tsx (NEW)
- src/components/scan/scan-results.tsx
- src/components/scan/scan-results.test.tsx
- src/app/scan/results/page.tsx

### Change Log

- 2026-03-21: Story 2.5 implemented — partial results banner, inference state routing, thumbnail TQ cache, InferenceState component (claude-sonnet-4-6)
