# Story 2.3: Menu Scan Results & Dish Detail Bottom Sheet

**Status:** review
**Story ID:** 2.3
**Epic:** 2 — Scan & AI Identification

---

## Story

As a user who has scanned a menu,
I want to see an image-rich dish list and tap into a dish for full details,
So that I can confidently decide what to order and understand what I'd be eating.

---

## Acceptance Criteria

**Given** a successful menu scan result
**When** the results screen renders
**Then** each dish is displayed as a card with: a 64×64pt thumbnail (radius-xs, from `imageUrl` or placeholder), dish name (text-base), one-line description (text-xs, text-secondary), and calorie estimate (FR39); the list is scrollable; a retake button appears in the header

**Given** all dishes were successfully identified
**When** the results list renders
**Then** no partial result state banner is shown; all identified dishes are actionable

**Given** the scan returns `dishes: []` (any `emptyReason`)
**When** the results screen renders
**Then** a centred empty state is shown in place of the dish list, containing: a neutral icon, a headline, a tip line, and a prominent Retake CTA (same `handleRetake` flow); copy is determined by `emptyReason` as follows:

| `emptyReason` | Headline | Tip |
|---|---|---|
| `"image_quality"` | "Couldn't read the menu" | "Try again in better lighting, or move closer so the text is in focus." |
| `"not_menu"` | "That doesn't look like a menu" | "Point your camera at the menu and try again." |
| `"no_dishes_found"` | "No dishes found" | "This looks like a drinks menu — try scanning the food section." |
| `null` / unknown | "Couldn't find dishes" | "Try scanning a clear, well-lit section of the menu." |

**Given** the user has never completed a scan before (`localStorage` key `plately_seen_scan_tip` is not set)
**When** any results screen renders — empty or with results
**Then** a one-time dismissible tip banner is shown above the dish list (or empty state): *"For best results, hold steady and scan one section at a time."*; tapping dismiss sets `plately_seen_scan_tip = "true"` in `localStorage` and hides the banner

**Given** the user taps a dish card
**When** the bottom sheet opens
**Then** it springs up from below using spring physics; the results list behind dims to 40% opacity and scales to 0.95; the drag handle pill (4×36pt, white 30%) is visible at the top of the sheet

**Given** the dish detail bottom sheet is open
**When** rendered
**Then** it shows in order: drag handle, full-width dish image (200pt height, radius-sm top corners only), dish name (text-hero), evidence block (UX-DR5), one-line description (text-sm, white 60%), divider (white 10%), "Save Recipe" CTA (56pt, radius-xl, full width), "See Full Details" text link

**Given** the evidence block for a high-confidence result
**When** rendered
**Then** it shows a single-line confirmation text in white 60%; tone is assured and informative; no amber, orange, or red colours are used anywhere in the result

**Given** the evidence block for a medium-confidence result
**When** rendered
**Then** it shows two lines of reasoning plus 3–4 ingredient pills identifying key evidence; still positive and assured in tone; no warning colours

**Given** the user swipes down on the bottom sheet
**When** the gesture completes
**Then** the sheet dismisses back to the dish list; the results list returns to full opacity and scale; no navigation stack change occurs

**Given** the retake button in the results header is tapped (FR04)
**When** tapped
**Then** the camera modal reopens; the previous result is cleared from TanStack Query cache

**Given** the "See Full Details" link is tapped
**When** navigated
**Then** a full-page recipe detail view renders showing the complete ingredient list (FR14) with quantities, the calorie estimate, and serving size

---

## Tasks / Subtasks

- [x] Task 1: Implement `src/components/scan/scan-results.tsx` — dish list screen
  - [x] Header: dish count label + retake button (min 44pt touch target)
  - [x] Dish cards using `GlassCard` (compact variant): 64×64pt placeholder thumbnail (imageUrl is null in 2.3), name (text-base), one-line description (text-xs, text-secondary), calorie estimate if not null
  - [x] `handleRetake`: clear `['scan-result', scanId]` from TQ cache, navigate to `/`, dispatch `plately:openCamera` event after 300ms delay
  - [x] Manage `selectedDishIndex` locally; open `DishDetailSheet` on dish tap

- [x] Task 2: Implement `src/components/scan/dish-detail-sheet.tsx` — bottom sheet
  - [x] USE existing `BottomSheet` from `src/components/ui/bottom-sheet.tsx` — do NOT recreate spring/drag/overlay logic
  - [x] Full-bleed dish image (200pt height, radius-sm top corners; use negative side margins to break out of BottomSheet padding; placeholder div if imageUrl null)
  - [x] Dish name (text-hero)
  - [x] Evidence block: high-confidence (single line, text-secondary) vs medium (2 lines + up to 4 ingredient pills as small pills); never warning colours
  - [x] One-line description (text-sm, text-secondary)
  - [x] Divider (rgba(255,255,255,0.10), 1px)
  - [x] "Save Recipe" CTA (56pt height, radius-xl, full width, white bg, text-on-button) — Story 3.1 wires actual save; in 2.3 it navigates to `/scan/dish?scanId=...&dishIndex=...`
  - [x] "See Full Details" text link → navigate to `/scan/dish?scanId=...&dishIndex=...`

- [x] Task 3: Create `src/app/scan/dish/page.tsx` — full ingredient detail view
  - [x] Wrap component using searchParams in `<Suspense fallback={null}>` (required by Next.js App Router)
  - [x] Read `scanId` + `dishIndex` from `useSearchParams()`
  - [x] Read scan result via `queryClient.getQueryData<ScanResult>(['scan-result', scanId])` — no API call
  - [x] Show: dish name (text-xl), calorie estimate, serving size (1), full ingredient list with quantities + units
  - [x] Per-ingredient low confidence: show BOTH icon AND text label (e.g. "⚠ varies by restaurant") — NFR16
  - [x] If no cache entry found → `router.replace('/')` and return null

- [x] Task 4: Replace `src/app/scan/results/page.tsx` placeholder
  - [x] Wrap `useSearchParams` usage in `<Suspense fallback={null}>` (required by Next.js App Router)
  - [x] Read `scanId` from `useSearchParams()`; read scan result via `queryClient.getQueryData<ScanResult>(['scan-result', scanId])`
  - [x] If missing → `router.replace('/')` and return null (handles page-refresh cache miss)
  - [x] Render `<ScanResults result={scanResult} scanId={scanId} />`

- [x] Task 5: Update `src/components/layout/app-shell.tsx` — retake support
  - [x] Add ONE `useEffect` that listens for `plately:openCamera` CustomEvent on `window`
  - [x] On event: `setIsCameraModalOpen(true)`
  - [x] Clean up listener on unmount
  - [x] No other changes to AppShell

- [x] Task 6: Verify `globals.css` — body[data-sheet-open] CSS
  - [x] Confirm CSS exists to scale `<main>` to 0.95 when `body[data-sheet-open]` is set (BottomSheet sets this automatically)
  - [x] Add if missing

- [ ] Task 8: Update API route and types for `emptyReason`
  - [ ] Add `emptyReason` to `MENU_SCAN_PROMPT` in `src/app/api/scan/menu/route.ts` — instruct Gemini to return one of `"image_quality"` | `"not_menu"` | `"no_dishes_found"` | `null`
  - [ ] Update `parseGeminiMenuResponse` to extract and return `emptyReason` alongside `dishes`
  - [ ] Add `emptyReason: 'image_quality' | 'not_menu' | 'no_dishes_found' | null` to `ScanResult` type in `src/types/api.ts`

- [ ] Task 9: Implement empty state in `src/components/scan/scan-results.tsx`
  - [ ] When `result.dishes.length === 0`, render centred empty state with icon, headline, tip, and Retake CTA
  - [ ] Map `result.emptyReason` to the correct headline + tip copy per AC table above
  - [ ] Retake CTA uses existing `handleRetake` — no new logic needed

- [ ] Task 10: Implement first-time scan tip banner in `src/components/scan/scan-results.tsx`
  - [ ] On mount, check `localStorage.getItem('plately_seen_scan_tip')`
  - [ ] If not set, render dismissible banner above list/empty state
  - [ ] On dismiss, set `localStorage.setItem('plately_seen_scan_tip', 'true')` and hide banner

- [ ] Task 11: Write tests for Tasks 8–10
  - [ ] `src/app/api/scan/menu/route.test.ts` — verify `emptyReason` is parsed and returned in `ScanResult`
  - [ ] `src/components/scan/scan-results.test.tsx` — empty state renders correct copy per `emptyReason`; first-time tip banner shows/hides correctly

- [x] Task 7: Write tests
  - [x] `src/components/scan/scan-results.test.tsx`
  - [x] `src/components/scan/dish-detail-sheet.test.tsx`
  - [x] `src/app/scan/results/page.test.tsx` (or inline in results folder)

---

## Dev Notes

### File Locations

```
src/
  app/
    scan/
      results/
        page.tsx              ← REPLACE placeholder (Task 4)
      dish/
        page.tsx              ← NEW (Task 3 — full ingredient detail)
  components/
    layout/
      app-shell.tsx           ← MODIFY (Task 5 — add plately:openCamera listener only)
    scan/
      scan-results.tsx        ← NEW (Task 1)
      scan-results.test.tsx   ← NEW (Task 7)
      dish-detail-sheet.tsx   ← NEW (Task 2)
      dish-detail-sheet.test.tsx ← NEW (Task 7)
```

### Task 1: `scan-results.tsx`

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { GlassCard } from '@/components/ui/glass-card'
import { DishDetailSheet } from './dish-detail-sheet'
import type { ScanResult, DishResult } from '@/types/api'

interface ScanResultsProps {
  result: ScanResult
  scanId: string
}

export function ScanResults({ result, scanId }: ScanResultsProps) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [selectedDishIndex, setSelectedDishIndex] = useState<number | null>(null)

  const handleRetake = () => {
    queryClient.removeQueries({ queryKey: ['scan-result', scanId] })
    router.push('/')
    // Signal AppShell to open camera after navigation settles
    setTimeout(() => window.dispatchEvent(new CustomEvent('plately:openCamera')), 300)
  }

  const selectedDish = selectedDishIndex !== null ? result.dishes[selectedDishIndex] : null

  return (
    <div style={{ padding: '0 var(--spacing-4)', paddingBottom: '80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--spacing-4) 0' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-xs)' }}>
          {result.dishes.length} dish{result.dishes.length !== 1 ? 'es' : ''} found
        </span>
        <button
          onClick={handleRetake}
          style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 12px', minHeight: '44px' }}
          aria-label="Retake scan"
        >
          ↺ Retake
        </button>
      </div>

      {/* Dish list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
        {result.dishes.map((dish, i) => (
          <DishCard key={i} dish={dish} onClick={() => setSelectedDishIndex(i)} />
        ))}
      </div>

      {/* Bottom sheet */}
      <DishDetailSheet
        dish={selectedDish}
        open={selectedDish !== null}
        onClose={() => setSelectedDishIndex(null)}
        scanId={scanId}
        dishIndex={selectedDishIndex ?? 0}
      />
    </div>
  )
}

function DishCard({ dish, onClick }: { dish: DishResult; onClick: () => void }) {
  return (
    <GlassCard
      variant="compact"
      onClick={onClick}
      style={{ cursor: 'pointer', padding: 'var(--spacing-3)', display: 'flex', gap: 'var(--spacing-3)', alignItems: 'center' }}
    >
      {/* Thumbnail: 64×64pt — imageUrl is null in 2.3 (enriched in Story 2.4) */}
      {dish.imageUrl ? (
        <img src={dish.imageUrl} alt={dish.name} style={{ width: '64px', height: '64px', borderRadius: 'var(--radius-xs)', objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{ width: '64px', height: '64px', borderRadius: 'var(--radius-xs)', background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} aria-hidden="true" />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: 500 }}>{dish.name}</div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dish.description}</div>
        {dish.calorieEstimate !== null && (
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: '2px' }}>{dish.calorieEstimate} cal</div>
        )}
      </div>
    </GlassCard>
  )
}
```

### Task 2: `dish-detail-sheet.tsx`

**CRITICAL:** Use `BottomSheet` from `@/components/ui/bottom-sheet`. It already handles: spring animation, drag-to-dismiss, overlay dim (40% via `--overlay-bg`), `body[data-sheet-open]`, focus trap, Reduce Motion, Escape key. Do NOT recreate any of this.

**Image layout:** BottomSheet wraps content in `px-[var(--spacing-5)]` (20pt padding). Use `margin: '0 calc(var(--spacing-5) * -1)'` on the image wrapper to achieve full-bleed. The BottomSheet's outer `glass-sheet` class handles rounded top corners; verify it has `overflow: hidden` so the image respects them.

```typescript
'use client'

import { useRouter } from 'next/navigation'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import type { DishResult } from '@/types/api'

interface DishDetailSheetProps {
  dish: DishResult | null
  open: boolean
  onClose: () => void
  scanId: string
  dishIndex: number
}

export function DishDetailSheet({ dish, open, onClose, scanId, dishIndex }: DishDetailSheetProps) {
  const router = useRouter()
  const detailUrl = `/scan/dish?scanId=${scanId}&dishIndex=${dishIndex}`

  return (
    <BottomSheet open={open} onClose={onClose} label={dish?.name ?? 'Dish detail'}>
      {dish && (
        <>
          {/* Full-bleed image — negative margins break out of BottomSheet's 20pt side padding */}
          <div style={{ margin: '0 calc(var(--spacing-5) * -1)' }}>
            {dish.imageUrl ? (
              <img
                src={dish.imageUrl}
                alt={dish.name}
                style={{ width: '100%', height: '200px', objectFit: 'cover', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0', display: 'block' }}
              />
            ) : (
              <div style={{ width: '100%', height: '200px', background: 'rgba(255,255,255,0.08)', borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0' }} aria-hidden="true" />
            )}
          </div>

          {/* Dish name */}
          <h2 style={{ fontSize: 'var(--text-hero)', color: 'var(--text-primary)', fontWeight: 700, margin: 'var(--spacing-4) 0 var(--spacing-2)', lineHeight: 1.2 }}>
            {dish.name}
          </h2>

          {/* Evidence block */}
          <EvidenceBlock dish={dish} />

          {/* Description */}
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 'var(--spacing-3) 0' }}>
            {dish.description}
          </p>

          {/* Divider */}
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.10)', margin: 'var(--spacing-4) 0' }} />

          {/* Save Recipe CTA — Story 3.1 replaces onClick with actual save logic */}
          <button
            onClick={() => router.push(detailUrl)}
            style={{ width: '100%', height: '56px', borderRadius: 'var(--radius-xl)', background: 'rgba(255,255,255,0.90)', color: 'var(--text-on-button)', fontWeight: 600, fontSize: 'var(--text-base)', border: 'none', cursor: 'pointer', marginBottom: 'var(--spacing-3)' }}
            aria-label={`Save recipe for ${dish.name}`}
          >
            Save Recipe
          </button>

          {/* See Full Details */}
          <button
            onClick={() => router.push(detailUrl)}
            style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', cursor: 'pointer', padding: '8px', minHeight: '44px', display: 'block', width: '100%', textAlign: 'center' }}
          >
            See Full Details
          </button>
        </>
      )}
    </BottomSheet>
  )
}

// Evidence block — confidence is always positive; tone assured; never warning colours
function EvidenceBlock({ dish }: { dish: DishResult }) {
  const highCount = dish.ingredients.filter(i => i.confidenceLevel === 'high').length
  const total = dish.ingredients.length
  // Treat as high confidence when: no ingredients (menu scan), or ≥80% are high
  const isHigh = total === 0 || highCount / total >= 0.8
  const evidencePills = dish.ingredients.filter(i => i.confidenceLevel === 'high').slice(0, 4)

  if (isHigh) {
    return (
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: 'var(--spacing-2) 0' }}>
        Identified from your scan{dish.calorieEstimate ? ` · ${dish.calorieEstimate} cal` : ''}
      </p>
    )
  }

  return (
    <div style={{ margin: 'var(--spacing-2) 0' }}>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', margin: '0 0 var(--spacing-1)' }}>
        Identified from your scan — ingredients match common preparation
      </p>
      {evidencePills.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {evidencePills.map((ing) => (
            <span key={ing.name} style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.10)', borderRadius: 'var(--radius-full)', padding: '2px 8px' }}>
              {ing.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
```

### Task 3: `src/app/scan/dish/page.tsx`

```typescript
'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import type { ScanResult } from '@/types/api'

export default function ScanDishPage() {
  return (
    <Suspense fallback={null}>
      <ScanDishContent />
    </Suspense>
  )
}

function ScanDishContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()

  const scanId = searchParams.get('scanId') ?? ''
  const dishIndex = parseInt(searchParams.get('dishIndex') ?? '0', 10)
  const scanResult = queryClient.getQueryData<ScanResult>(['scan-result', scanId])
  const dish = scanResult?.dishes[dishIndex]

  if (!dish) {
    router.replace('/')
    return null
  }

  return (
    <div style={{ padding: '0 var(--spacing-4) var(--spacing-12)' }}>
      <button
        onClick={() => router.back()}
        style={{ display: 'block', padding: '12px 0', minHeight: '44px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}
        aria-label="Go back"
      >
        ← Back
      </button>

      <h1 style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', fontWeight: 700, margin: 'var(--spacing-4) 0 var(--spacing-2)' }}>
        {dish.name}
      </h1>

      {dish.calorieEstimate !== null && (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', margin: '0 0 var(--spacing-2)' }}>
          {dish.calorieEstimate} cal per serving
        </p>
      )}

      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', margin: '0 0 var(--spacing-6)' }}>
        Serving size: 1
      </p>

      <h2 style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: 600, margin: '0 0 var(--spacing-3)' }}>
        Ingredients
      </h2>

      {dish.ingredients.length === 0 ? (
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
          Ingredient details are available when scanning a single dish.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-2)' }}>
          {dish.ingredients.map((ing, i) => (
            <li
              key={i}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--spacing-3)', background: 'rgba(255,255,255,0.06)', borderRadius: 'var(--radius-sm)', minHeight: '56px' }}
            >
              <div>
                <span style={{ fontSize: 'var(--text-base)', color: 'var(--text-primary)' }}>{ing.name}</span>
                {/* NFR16: low confidence MUST show both icon AND text — never colour alone */}
                {ing.confidenceLevel === 'low' && (
                  <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)', marginLeft: '6px' }} aria-label="ingredient confidence: varies by restaurant">
                    ⚠ varies by restaurant
                  </span>
                )}
              </div>
              {(ing.quantity || ing.unit) && (
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                  {[ing.quantity, ing.unit].filter(Boolean).join(' ')}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

### Task 4: `src/app/scan/results/page.tsx` — Replace Placeholder

```typescript
'use client'

import { Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ScanResults } from '@/components/scan/scan-results'
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
  // IMPORTANT: Read from TQ cache only — there is no /api endpoint to re-fetch a scan by ID
  const scanResult = queryClient.getQueryData<ScanResult>(['scan-result', scanId])

  if (!scanId || !scanResult) {
    // Cache miss (page refresh clears TQ memory) — redirect home
    router.replace('/')
    return null
  }

  return <ScanResults result={scanResult} scanId={scanId} />
}
```

### Task 5: AppShell — Add Retake Listener

Add inside `AppShell` component body in `src/components/layout/app-shell.tsx` (after existing useEffects):

```typescript
// Retake: results page dispatches 'plately:openCamera' after navigating home
useEffect(() => {
  const handleOpenCamera = () => setIsCameraModalOpen(true)
  window.addEventListener('plately:openCamera', handleOpenCamera)
  return () => window.removeEventListener('plately:openCamera', handleOpenCamera)
}, [])
```

No other changes to AppShell.

### Task 6: `globals.css` — Sheet Open State

The `BottomSheet` component sets `document.body.dataset.sheetOpen = 'true'` on mount. Add if missing:

```css
/* Scale main content when BottomSheet is open */
body[data-sheet-open] main {
  transform: scale(0.95);
  transition: transform 0.2s ease;
}
```

Target is the `<main>` element rendered by AppShell. The overlay handles the 40% dim via `--overlay-bg`. Verify `--overlay-bg` is defined in globals.css (it should be from Story 1.2).

### Task 8: Updated `MENU_SCAN_PROMPT`

Replace the existing `MENU_SCAN_PROMPT` constant with:

```typescript
const MENU_SCAN_PROMPT = `You are a restaurant menu analyser. Analyse this menu image and identify all dishes shown.

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "dishes": [
    {
      "name": "string — dish name as written on menu",
      "description": "string — brief description, or empty string if none shown",
      "calorieEstimate": number or null
    }
  ],
  "emptyReason": null
}

When dishes is empty, set emptyReason to one of:
- "image_quality" — image is too blurry, dark, or low resolution to read
- "not_menu" — image does not appear to be a food/restaurant menu
- "no_dishes_found" — image is a readable menu but no dish names could be identified (e.g. drinks only, wine list, specials board, foreign language)

Rules:
- Include every dish visible on the menu
- calorieEstimate: extract if shown on menu, otherwise null
- description: use text from menu; if none, use an empty string ""
- When dishes has items, emptyReason must be null
- Return valid JSON only — no prose, no markdown fences`
```

Update `parseGeminiMenuResponse` to return `{ dishes: DishResult[], emptyReason: ScanResult['emptyReason'] }` and thread `emptyReason` through to `ScanResult`.

### Task 9: Empty State Copy Map

```typescript
const EMPTY_STATE_COPY: Record<string, { headline: string; tip: string }> = {
  image_quality: {
    headline: "Couldn't read the menu",
    tip: "Try again in better lighting, or move closer so the text is in focus.",
  },
  not_menu: {
    headline: "That doesn't look like a menu",
    tip: "Point your camera at the menu and try again.",
  },
  no_dishes_found: {
    headline: "No dishes found",
    tip: "This looks like a drinks menu — try scanning the food section.",
  },
}

const EMPTY_STATE_FALLBACK = {
  headline: "Couldn't find dishes",
  tip: "Try scanning a clear, well-lit section of the menu.",
}
```

### Task 10: First-Time Tip Banner

- Key: `'plately_seen_scan_tip'`
- Check on mount via `useState` initialised from `localStorage.getItem`
- Banner is a small dismissible strip above the list; dismiss sets the key and hides the banner
- Wrap `localStorage` access in `typeof window !== 'undefined'` guard for SSR safety

### Validated `emptyReason` Behaviour (AI Studio testing, 2026-03-21)

| Scenario | Returned `emptyReason` |
|---|---|
| Clear readable menu (Joey's) | `null` (dishes populated) |
| Very blurry dark backlit menu board | `"image_quality"` |
| Portrait photo (not a menu) | `"not_menu"` |
| Wine/cocktail/beer list (no food) | `"no_dishes_found"` |

Gemini's OCR is robust — even significantly blurry well-lit menus return dishes successfully. `image_quality` triggers on genuinely unreadable images (dark, backlit, extreme blur).

### Design Token Usage

| Element | CSS var / value |
|---|---|
| Dish card thumbnail | 64×64px inline |
| Thumbnail radius | `var(--radius-xs)` = 8pt |
| Touch targets (all buttons) | min 44px inline (NFR15) |
| Dish card touch target | min 56px height via GlassCard compact |
| Bottom sheet image height | 200px inline |
| Image top corners | `var(--radius-sm) var(--radius-sm) 0 0` = 12pt top only |
| Dish name (sheet) | `var(--text-hero)` = 36–40pt |
| Description (sheet) | `var(--text-sm)` = 15pt |
| Evidence text | `var(--text-xs)` = 12–13pt |
| Ingredient pill | `var(--text-2xs)` = 11pt |
| Save CTA height | 56px inline |
| Save CTA radius | `var(--radius-xl)` = 28pt |
| Save CTA text colour | `var(--text-on-button)` = rgba(0,0,0,0.90) |
| Save CTA background | rgba(255,255,255,0.90) |
| Divider | rgba(255,255,255,0.10) 1px |
| Ingredient row | min 56px height (NFR15, UX-DR13) |
| BottomSheet padding (for negative margin calc) | `var(--spacing-5)` = 20pt |

### Test Approach

**Environment:** Vitest + jsdom. No network requests — all data from TQ cache.

**Required mocks (same as Story 2.2 patterns):**

```typescript
// framer-motion — same mock as previous stories
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) =>
      React.createElement('div', props, children),
  },
  useReducedMotion: () => false,
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
  useDragControls: () => ({ start: vi.fn() }),
}))

// focus-trap-react — required whenever BottomSheet is rendered
vi.mock('focus-trap-react', () => ({
  default: ({ children }: React.PropsWithChildren) => children,
}))

// next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams('scanId=test-scan-id&dishIndex=0'),
  usePathname: () => '/scan/results',
}))
```

**TQ test wrapper:**

```typescript
function createWrapper(scanId: string, result: ScanResult) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  queryClient.setQueryData(['scan-result', scanId], result)
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
```

**Test fixture:**

```typescript
const mockDish: DishResult = {
  name: 'Duck Confit',
  description: 'Crispy duck leg with cherry jus',
  calorieEstimate: 620,
  ingredients: [
    { name: 'Duck leg', quantity: '2', unit: 'pcs', confidenceLevel: 'high' },
    { name: 'Thyme', quantity: null, unit: null, confidenceLevel: 'high' },
    { name: 'Garlic', quantity: '4', unit: 'cloves', confidenceLevel: 'medium' },
    { name: 'Salt blend', quantity: null, unit: null, confidenceLevel: 'low' },
  ],
  imageUrl: null,  // always null in Story 2.3
}

const mockScanResult: ScanResult = {
  scanId: 'test-scan-id',
  type: 'menu',
  dishes: [mockDish],
  confidenceSource: 'gemini-only',
}
```

**Key tests for `scan-results.test.tsx`:**
- Renders dish count label correctly ("1 dish found", "3 dishes found")
- Renders dish name, description, calorie estimate for each dish
- Renders thumbnail placeholder div (not img) when imageUrl is null
- Retake button has aria-label "Retake scan"
- Retake: calls `queryClient.removeQueries`, calls `router.push('/')`, dispatches `plately:openCamera` event
- Tapping dish card → DishDetailSheet opens (selectedDishIndex changes)

**Key tests for `dish-detail-sheet.test.tsx`:**
- Renders nothing (or closed state) when `open=false`
- Renders dish name when open
- Renders placeholder div when imageUrl is null
- Evidence block shows appropriate text based on ingredient confidence
- Divider is present
- Save Recipe button has aria-label
- See Full Details button is present
- Both buttons route to `/scan/dish?scanId=...&dishIndex=...`
- BottomSheet `role="dialog"` and `aria-label` present (from BottomSheet component)

**Key tests for results page:**
- Redirects to `/` when scanId is missing from params
- Redirects to `/` when scanResult not found in TQ cache
- Renders ScanResults component when cache hit

### Architecture Enforcement

| Rule | Detail |
|---|---|
| BottomSheet reuse | Use `@/components/ui/bottom-sheet` — NEVER recreate drag/spring/overlay/focustrap |
| GlassCard reuse | Use `@/components/ui/glass-card` for dish cards — variant="compact" for radius-sm |
| TQ scan result key | `['scan-result', scanId]` — read via `queryClient.getQueryData()` only |
| No API refetch | No endpoint to re-fetch scan results — TQ cache is the only source |
| Suspense wrapper | Any component using `useSearchParams()` MUST be wrapped in `<Suspense>` |
| Type imports | `ScanResult`, `DishResult`, `IngredientResult` from `@/types/api` — never redefine |
| Confidence colours | Never amber/red/orange; all confidence states use text-secondary (white 60%) |
| Low-confidence indicator | MUST show both visual (⚠ icon) AND text ("varies by restaurant") — NFR16 |
| imageUrl null in 2.3 | Always null until Story 2.4 enrichment; always render placeholder |
| Save Recipe in 2.3 | CTA must be present visually; actual save logic is Story 3.1 |
| AppShell modification | Only the `plately:openCamera` event listener — zero other changes |
| Test count | All 121 existing tests must continue passing |

### Anti-Patterns to Prevent

```typescript
// ❌ Never recreate BottomSheet animation logic
<motion.div drag="y" dragConstraints={{ top: 0 }} ...>  // DO NOT

// ✅ Use the existing BottomSheet
import { BottomSheet } from '@/components/ui/bottom-sheet'
<BottomSheet open={open} onClose={onClose} label="Duck Confit">

// ❌ Never fetch scan results from an API (no such endpoint exists)
const { data } = useQuery({
  queryKey: ['scan-result', scanId],
  queryFn: () => fetch(`/api/scan/result/${scanId}`),  // 404 — this route does not exist
})

// ✅ Read from TQ cache only
const scanResult = queryClient.getQueryData<ScanResult>(['scan-result', scanId])

// ❌ Never use warning colours for any confidence state
<p style={{ color: 'orange' }}>Medium confidence</p>  // No

// ✅ All confidence states use text-secondary
<p style={{ color: 'var(--text-secondary)' }}>Identified from your scan</p>

// ❌ Never use colour as the ONLY indicator of low ingredient confidence (NFR16)
<span style={{ color: '#888' }}>{ing.name}</span>  // colour alone

// ✅ Icon + text label alongside any colour change
{ing.confidenceLevel === 'low' && <span>⚠ varies by restaurant</span>}

// ❌ Never use useSearchParams() at the page component level without Suspense
export default function ScanResultsPage() {
  const params = useSearchParams()  // Next.js build error without Suspense

// ✅ Always wrap in Suspense
export default function ScanResultsPage() {
  return <Suspense fallback={null}><ScanResultsContent /></Suspense>
}

// ❌ Never pass snake_case to components
<DishCard image_url={dish.imageUrl} />

// ✅ camelCase in all component props
<DishCard imageUrl={dish.imageUrl} />

// ❌ Never add Save Recipe logic in Story 2.3 (that's Story 3.1)
// Just render the CTA button — Story 3.1 provides the save route and hook

// ❌ Never add partial-result banner, inference state (Story 2.5 only)
// ❌ Never add enrichment/confidence update logic (Story 2.4 only)
```

### Previous Story Intelligence (2.2)

- **121 tests passing** (83 pre-existing + 38 from 2.2) — do NOT regress
- `DishResult.imageUrl` is **always null** in 2.3 — it's populated by Google Places enrichment in Story 2.4; always render a placeholder div
- `useScan` hook (in AppShell) sets `['scan-result', scanId]` via `queryClient.setQueryData()` on success — this is the only way data enters TQ cache for this key
- `AppShell` navigates to `/scan/results?scanId=${scanId}` when processing strip is tapped — this is how the results page gets its `scanId`
- `BottomSheet` at `src/components/ui/bottom-sheet.tsx` is feature-complete: spring up, drag-to-dismiss (velocity >500 or offset >150), overlay dim via `--overlay-bg`, `body[data-sheet-open]`, `focus-trap-react`, Reduce Motion, Escape key — do not reinvent
- `GlassCard` at `src/components/ui/glass-card.tsx` — `variant="compact"` = radius-sm (12pt)
- Framer-motion test mock pattern: `motion.div` as plain div, `useDragControls: () => ({ start: vi.fn() })`, `AnimatePresence` passes through children
- `focus-trap-react` must be mocked in any test rendering `BottomSheet`
- Spring transition constant: `{ type: 'spring', mass: 1, stiffness: 300, damping: 30 }` — already used throughout; don't change
- Test setup at `src/test/setup.ts` already mocks `IntersectionObserver` and `matchMedia` — no changes needed
- Tests are co-located with source files; no `__tests__/` directory

### Story Forward Context

**Story 2.4 (Async Confidence Enrichment Pipeline)** — after 2.4 is implemented:
- `imageUrl` on `DishResult` will be populated with real Google Places photo URLs
- `DishDetailSheet` and `DishCard` will auto-show real images because they read from TQ cache
- Evidence block will update automatically when `confidenceSource` changes to `'multi-source'`
- No changes to 2.3 components needed for this — they already handle non-null `imageUrl`

**Story 2.5 (Partial Results, Retake & Inference State)** — will add:
- Partial result banner to `ScanResults`
- Third evidence block state (inference: side-by-side photos + confirmation question) to `DishDetailSheet`

**Story 3.1 (Recipe Save Flow)** — will modify:
- `DishDetailSheet` Save Recipe CTA: replace placeholder `router.push(detailUrl)` with actual save hook call
- The CTA must be present in this story so 3.1 has a target to replace

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Implemented `ScanResults` component with dish list, retake button (dispatches `plately:openCamera` after 300ms), and `DishDetailSheet` integration
- Implemented `DishDetailSheet` reusing existing `BottomSheet` — no spring/drag/overlay logic recreated; full-bleed image via negative margins on `--spacing-5`; evidence block with high/medium confidence states (never warning colours); Save Recipe CTA navigates to `/scan/dish` (Story 3.1 wires actual save)
- Created `src/app/scan/dish/page.tsx` for full ingredient detail view; all `useSearchParams` wrapped in `<Suspense>`; low-confidence ingredients show both ⚠ icon and text (NFR16)
- Replaced `src/app/scan/results/page.tsx` placeholder with full implementation reading from TQ cache; redirects to `/` on cache miss
- Added `plately:openCamera` CustomEvent listener to AppShell with cleanup on unmount
- Confirmed `globals.css` already has `body[data-sheet-open] #main-content { transform: scale(0.95) }` — no changes needed
- 30 new tests added (10 scan-results, 16 dish-detail-sheet, 4 results page); all 151 tests pass with no regressions
- No new lint errors introduced

### File List

- `src/components/scan/scan-results.tsx` (new)
- `src/components/scan/scan-results.test.tsx` (new)
- `src/components/scan/dish-detail-sheet.tsx` (new)
- `src/components/scan/dish-detail-sheet.test.tsx` (new)
- `src/app/scan/dish/page.tsx` (new)
- `src/app/scan/results/page.tsx` (modified — replaced placeholder)
- `src/app/scan/results/page.test.tsx` (new)
- `src/components/layout/app-shell.tsx` (modified — added plately:openCamera listener)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified — status updated)

### Change Log

- Story 2.3 implementation complete (2026-03-20): dish list screen, dish detail bottom sheet, full ingredient detail page, retake flow, AppShell event listener — 30 new tests, 151 total passing
