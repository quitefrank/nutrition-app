# Story 2.2: Camera Modal & Capture Flow

**Status:** review
**Story ID:** 2.2
**Epic:** 2 — Scan & AI Identification

---

## Story

As a user at a restaurant,
I want to open my camera and scan a menu or dish,
So that I can start the AI identification process with a single gesture.

---

## Acceptance Criteria

**Given** the user taps the camera FAB from any tab
**When** the camera modal opens
**Then** it displays: full-bleed camera preview (no border or frame), corner bracket guides (white 40%, 32pt each corner, radius-xs), a 72pt capture button (glass, radius-full, camera icon) centred at the bottom third, a 48pt upload button (glass, image icon) to the left of capture, and a glass × dismiss button (top right, 44pt touch target)

**Given** the corner brackets are visible
**When** 2 seconds have elapsed after the camera modal opened
**Then** the corner brackets fade out; no user interaction is required for this

**Given** the user taps the capture button
**When** the shutter fires
**Then** a brief shutter animation plays; the camera modal dismisses smoothly; the processing strip appears above the tab bar 300ms after the modal closes

**Given** the user taps the upload button
**When** the system photo picker opens
**Then** the camera modal remains open until a photo is selected or the picker is cancelled; once a photo is selected, the same dismiss + processing strip flow as camera capture occurs

**Given** a scan has been submitted and the processing strip is visible
**When** the strip renders
**Then** it shows: a 32×32pt thumbnail of the captured image (left, radius-xs), "Identifying your menu..." with an animated ellipsis (centre, text-sm), and an animated spinner (right, white 60%); height is 56–64pt; it springs up from below the tab bar (300ms)

**Given** the processing strip is showing and the scan result returns
**When** the result is ready
**Then** the strip text changes to "Your results are ready →"; the spinner becomes a chevron; a subtle pulse animation plays on the strip

**Given** the result is ready and the user taps the processing strip
**When** tapped
**Then** the app navigates to `/scan/results?scanId={scanId}`

**Given** the processing strip is visible (scan still in progress)
**When** the user swipes down on the strip
**Then** an inline warning appears ("Swipe again to cancel"); if the user swipes down again, the strip dismisses and the in-flight scan is cancelled; no partial result is shown

**Given** the user taps the × dismiss button on the camera modal
**When** dismissed before taking a photo
**Then** no scan is submitted; no processing strip appears; the app returns to the previous state

**Given** this is the user's first time tapping the camera FAB
**When** the OS camera permission prompt fires
**Then** in-app value-framing copy ("To scan menus and dishes, Plately needs camera access.") has been displayed before the OS system dialog appears

**Given** the user has denied camera permission at the OS level
**When** the camera FAB is tapped
**Then** a clear explanation of impact is shown and the photo upload path is offered as the co-equal alternative; the capture button is visually disabled; the upload button remains fully active

---

## Tasks / Subtasks

- [x] Task 1: Implement `src/hooks/use-scan.ts` — scan submission hook
  - [x] `useMutation` wrapping POST `/api/scan/menu`
  - [x] On success: `queryClient.setQueryData(['scan-result', scanId], result)`
  - [x] Return `{ status, scanId, thumbnailUrl, submitScan, cancelScan, reset }`
  - [x] `status: 'idle' | 'processing' | 'ready' | 'error'`
  - [x] `cancelScan`: sets status back to idle (cancels in-flight fetch via AbortController)

- [x] Task 2: Implement `src/components/scan/processing-strip.tsx` — persistent result strip
  - [x] Glass background, radius-full, 56–64pt height
  - [x] Framer-motion spring-up animation (300ms) on first mount
  - [x] Thumbnail (32×32pt, radius-xs), animated text, spinner/chevron
  - [x] Status `'processing'`: animated ellipsis + spinner
  - [x] Status `'ready'`: "Your results are ready →" + chevron + pulse animation
  - [x] Tap to call `onTap()` (only when ready)
  - [x] Swipe-down gesture: first swipe shows warning, second swipe calls `onCancel()`
  - [x] Reduce Motion support: replace spring with 150ms opacity-only fade

- [x] Task 3: Replace placeholder `src/components/scan/camera-modal.tsx` — full camera UI
  - [x] Camera permission check via `navigator.permissions.query({ name: 'camera' })`
  - [x] First-time: render in-app value-framing copy BEFORE calling `getUserMedia`
  - [x] Denied state: show explanation + disable capture button + keep upload active
  - [x] Live video stream via `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })`
  - [x] Full-bleed `<video>` element (no border, no frame)
  - [x] Corner brackets: 4 absolute-positioned divs, white 40% opacity, 32pt each, fade after 2s
  - [x] Capture button: 72pt diameter, glass-fab styles, radius-full, camera icon, centred bottom third
  - [x] Upload button: 48pt diameter, glass styles, radius-full, image icon, left of capture
  - [x] Hidden `<input type="file" accept="image/*">` for upload
  - [x] Dismiss button: top right, 44pt touch target, glass × button
  - [x] On capture: canvas drawImage → base64 → call `onCapture(imageBase64, mimeType)`
  - [x] On upload: FileReader → base64 → call `onCapture(imageBase64, mimeType)`
  - [x] Brief shutter animation on capture (white flash overlay, 150ms)
  - [x] Stop MediaStream tracks on unmount (prevent camera indicator staying on)
  - [x] Reduce Motion: replace spring animations with 150ms opacity fades

- [x] Task 4: Update `src/components/layout/app-shell.tsx` — wire capture → processing strip
  - [x] Import `useScan` hook
  - [x] Import `ProcessingStrip`
  - [x] Extend `CameraModal` to accept `onCapture(imageBase64: string, mimeType: string)` callback
  - [x] On `onCapture`: call `submitScan`, close modal, schedule strip appearance 300ms later
  - [x] Render `ProcessingStrip` when status is `'processing'` or `'ready'`
  - [x] `onTap`: navigate to `/scan/results?scanId={scanId}` (Next.js router.push)
  - [x] `onCancel`: call `cancelScan()`, hide strip

- [x] Task 5: Create results route placeholder `src/app/scan/results/page.tsx`
  - [x] Simple placeholder reading `scanId` from `searchParams`
  - [x] Reads from TanStack Query cache `['scan-result', scanId]`
  - [x] Shows basic dish list (Story 2.3 replaces with full UI)

- [x] Task 6: Write tests
  - [x] `src/hooks/use-scan.test.ts`
  - [x] `src/components/scan/processing-strip.test.tsx`
  - [x] `src/components/scan/camera-modal.test.tsx`

---

## Dev Notes

### File Locations

```
src/
  app/
    scan/
      results/
        page.tsx              ← NEW (Task 5 — placeholder for Story 2.3)
  components/
    layout/
      app-shell.tsx           ← MODIFY (Task 4)
    scan/
      camera-modal.tsx        ← REPLACE placeholder (Task 3)
      camera-modal.test.tsx   ← NEW (Task 6)
      processing-strip.tsx    ← NEW (Task 2)
      processing-strip.test.tsx ← NEW (Task 6)
  hooks/
    use-scan.ts               ← NEW (Task 1)
    use-scan.test.ts          ← NEW (Task 6)
```

### Task 1: `use-scan.ts` Hook

```typescript
'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import type { ScanResult } from '@/types/api'

type ScanStatus = 'idle' | 'processing' | 'ready' | 'error'

interface ScanState {
  status: ScanStatus
  scanId: string | null
  thumbnailUrl: string | null  // object URL from captured image blob
}

interface UseScanReturn {
  status: ScanStatus
  scanId: string | null
  thumbnailUrl: string | null
  submitScan: (imageBase64: string, mimeType: string, thumbnailUrl: string) => void
  cancelScan: () => void
  reset: () => void
}

export function useScan(): UseScanReturn {
  const queryClient = useQueryClient()
  const abortRef = useRef<AbortController | null>(null)
  const [state, setState] = useState<ScanState>({
    status: 'idle',
    scanId: null,
    thumbnailUrl: null,
  })

  const { mutate } = useMutation({
    mutationFn: async ({ imageBase64, mimeType, signal }: { imageBase64: string; mimeType: string; signal: AbortSignal }) => {
      const res = await fetch('/api/scan/menu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType }),
        signal,
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Scan failed')
      }
      const { data } = await res.json()
      return data as ScanResult
    },
    onSuccess: (result) => {
      queryClient.setQueryData(['scan-result', result.scanId], result)
      setState((prev) => ({ ...prev, status: 'ready', scanId: result.scanId }))
    },
    onError: (err) => {
      if ((err as Error).name === 'AbortError') return  // user cancelled — stay idle
      setState((prev) => ({ ...prev, status: 'error' }))
    },
  })

  const submitScan = (imageBase64: string, mimeType: string, thumbnailUrl: string) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setState({ status: 'processing', scanId: null, thumbnailUrl })
    mutate({ imageBase64, mimeType, signal: controller.signal })
  }

  const cancelScan = () => {
    abortRef.current?.abort()
    setState({ status: 'idle', scanId: null, thumbnailUrl: null })
  }

  const reset = () => {
    setState({ status: 'idle', scanId: null, thumbnailUrl: null })
  }

  return {
    status: state.status,
    scanId: state.scanId,
    thumbnailUrl: state.thumbnailUrl,
    submitScan,
    cancelScan,
    reset,
  }
}
```

**Key points:**
- `thumbnailUrl` is a blob object URL created from the captured image — pass it in from the modal so the strip can show a preview
- AbortController cancels the fetch on `cancelScan()` — `AbortError` is swallowed silently (not an error state)
- Sets `['scan-result', scanId]` in TanStack Query cache — Story 2.3 reads from this key to render results
- Do NOT call `useScan` inside `CameraModal` — it belongs in `AppShell` (scan is global, outlives modal)

### Task 2: `processing-strip.tsx`

```typescript
'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { useState } from 'react'

interface ProcessingStripProps {
  status: 'processing' | 'ready'
  thumbnailUrl: string | null
  onTap: () => void
  onCancel: () => void
}

export function ProcessingStrip({ status, thumbnailUrl, onTap, onCancel }: ProcessingStripProps) {
  const shouldReduceMotion = useReducedMotion()
  const [swipeWarning, setSwipeWarning] = useState(false)
  const [swipeCount, setSwipeCount] = useState(0)

  const springTransition = shouldReduceMotion
    ? { duration: 0.15 }
    : { type: 'spring' as const, mass: 1, stiffness: 300, damping: 30 }

  const handleDragEnd = (_: unknown, info: { delta: { y: number } }) => {
    if (info.delta.y > 10) {  // swipe down
      if (!swipeWarning) {
        setSwipeWarning(true)
        setTimeout(() => setSwipeWarning(false), 3000)
      } else {
        onCancel()
        setSwipeWarning(false)
        setSwipeCount(0)
      }
    }
  }

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
      animate={shouldReduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
      exit={shouldReduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0 }}
      transition={springTransition}
      drag={status === 'processing' ? 'y' : false}
      dragConstraints={{ top: 0, bottom: 20 }}
      onDragEnd={handleDragEnd}
      onClick={status === 'ready' ? onTap : undefined}
      style={{
        position: 'fixed',
        bottom: 'calc(49px + env(safe-area-inset-bottom, 0px) + 8px)',
        left: '16px',
        right: '16px',
        height: '56px',
        borderRadius: 'var(--radius-full)',
        background: 'var(--glass-strip-bg)',  // rgba(255,255,255,0.12)
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: '12px',
        paddingRight: '12px',
        gap: '10px',
        cursor: status === 'ready' ? 'pointer' : 'default',
        zIndex: 40,
      }}
      aria-live="polite"
      aria-label={status === 'processing' ? 'Identifying your menu' : 'Your results are ready'}
    >
      {/* Thumbnail */}
      {thumbnailUrl && (
        <img
          src={thumbnailUrl}
          alt="Captured scan"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-xs)',
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      )}

      {/* Text */}
      <div style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>
        {swipeWarning
          ? 'Swipe again to cancel'
          : status === 'processing'
            ? <AnimatedEllipsis text="Identifying your menu" />
            : 'Your results are ready →'}
      </div>

      {/* Right icon */}
      {status === 'processing' ? (
        <Spinner />
      ) : (
        <ChevronRight />
      )}
    </motion.div>
  )
}
```

**Swipe-to-cancel pattern**: First swipe shows the warning text inline for 3 seconds; second swipe within that window calls `onCancel`. This prevents accidental dismissal.

**Positioning**: Strip sits `8px` above the tab bar (which is `49px + safe-area-inset-bottom`). Horizontal margins of `16px` on each side. `z-index: 40` puts it above content but below modals (`z-50`).

**CSS variable needed**: Add `--glass-strip-bg: rgba(255,255,255,0.12)` to `globals.css` under the dark mode theme block. Already defined in design tokens spec but may be missing from CSS.

### Task 3: `camera-modal.tsx` — Key Implementation Patterns

#### Permission flow (CRITICAL — do this before calling getUserMedia)

```typescript
type PermissionState = 'unknown' | 'prompt' | 'granted' | 'denied'

async function checkCameraPermission(): Promise<PermissionState> {
  if (!navigator.permissions) return 'unknown'
  try {
    const result = await navigator.permissions.query({ name: 'camera' as PermissionName })
    return result.state
  } catch {
    return 'unknown'  // some browsers don't support camera permission query
  }
}
```

**First-time flow (state = 'prompt' or 'unknown'):**
1. Show in-app value framing modal/overlay: "To scan menus and dishes, Plately needs camera access."
2. User taps "Allow" in the in-app prompt
3. THEN call `getUserMedia` which triggers the OS permission dialog

**Denied flow (state = 'denied'):**
- Show: "Camera access was denied. You can still scan using a photo from your camera roll."
- Disable capture button visually (opacity 0.4, pointer-events none)
- Upload button remains fully active

#### Live camera stream

```typescript
const videoRef = useRef<HTMLVideoElement>(null)
const streamRef = useRef<MediaStream | null>(null)

async function startCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    })
    streamRef.current = stream
    if (videoRef.current) {
      videoRef.current.srcObject = stream
    }
  } catch (err) {
    // getUserMedia rejected — user denied or no camera hardware
    setPermissionState('denied')
  }
}

// ALWAYS clean up the stream on unmount — keeps camera light off
useEffect(() => {
  return () => {
    streamRef.current?.getTracks().forEach(track => track.stop())
  }
}, [])
```

#### Capture to base64

```typescript
function captureImage(): { imageBase64: string; mimeType: string } | null {
  if (!videoRef.current) return null
  const canvas = document.createElement('canvas')
  canvas.width = videoRef.current.videoWidth
  canvas.height = videoRef.current.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(videoRef.current, 0, 0)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  return {
    imageBase64: dataUrl.replace('data:image/jpeg;base64,', ''),
    mimeType: 'image/jpeg',
  }
}
```

**IMPORTANT**: `imageBase64` strips the `data:...;base64,` prefix — the API routes expect raw base64, not a data URL.

#### Upload via file input

```typescript
const fileInputRef = useRef<HTMLInputElement>(null)

function handleUploadClick() {
  fileInputRef.current?.click()
}

function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    const dataUrl = reader.result as string
    const base64 = dataUrl.split(',')[1]
    const mimeType = file.type || 'image/jpeg'
    onCapture(base64, mimeType)
  }
  reader.readAsDataURL(file)
}

// In JSX:
<input
  ref={fileInputRef}
  type="file"
  accept="image/*"
  onChange={handleFileChange}
  style={{ display: 'none' }}
  aria-hidden="true"
/>
```

#### Thumbnail URL for processing strip

Before calling `onCapture`, create a blob URL for the thumbnail:

```typescript
function createThumbnailUrl(imageBase64: string, mimeType: string): string {
  const byteString = atob(imageBase64)
  const bytes = new Uint8Array(byteString.length)
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i)
  const blob = new Blob([bytes], { type: mimeType })
  return URL.createObjectURL(blob)
}
```

Pass this URL to `onCapture` alongside the base64. The `AppShell` passes it to `submitScan`, which stores it in the `useScan` state for the strip's thumbnail display.

#### Corner brackets (fade after 2s)

```typescript
const [bracketsVisible, setBracketsVisible] = useState(true)

useEffect(() => {
  const timer = setTimeout(() => setBracketsVisible(false), 2000)
  return () => clearTimeout(timer)
}, [])

// In JSX — one bracket per corner, positioned absolute
<motion.div
  animate={{ opacity: bracketsVisible ? 0.4 : 0 }}
  transition={{ duration: 0.4 }}
  style={{ position: 'absolute', top: '20%', left: '16px', ... }}
>
  {/* L-shaped bracket top-left */}
</motion.div>
```

Each bracket is an L-shape made from two `<div>` elements (or SVG lines). Width/height 32pt, `border-color: rgba(255,255,255,0.4)`, 2px border on two sides per corner.

#### Shutter animation

```typescript
const [shutterVisible, setShutterVisible] = useState(false)

function handleCapture() {
  const captured = captureImage()
  if (!captured) return
  setShutterVisible(true)
  setTimeout(() => {
    setShutterVisible(false)
    onCapture(captured.imageBase64, captured.mimeType, thumbnailUrl)
    // onCapture callback triggers modal close from AppShell
  }, 150)
}

// In JSX:
{shutterVisible && (
  <motion.div
    initial={{ opacity: 0.8 }}
    animate={{ opacity: 0 }}
    transition={{ duration: 0.15 }}
    style={{ position: 'absolute', inset: 0, background: 'white', zIndex: 10 }}
  />
)}
```

#### Updated CameraModal interface

```typescript
interface CameraModalProps {
  onClose: () => void
  onCapture: (imageBase64: string, mimeType: string, thumbnailUrl: string) => void
}
```

`AppShell` must be updated to pass `onCapture` — see Task 4 below.

### Task 4: AppShell Updates

Current `AppShell` only handles `isCameraModalOpen`. Add scan state:

```typescript
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false)
  const [showStrip, setShowStrip] = useState(false)
  const stripTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { status, scanId, thumbnailUrl, submitScan, cancelScan } = useScan()

  // Show strip 300ms after modal closes (if a scan is in progress)
  const handleCapture = (imageBase64: string, mimeType: string, thumbUrl: string) => {
    setIsCameraModalOpen(false)
    submitScan(imageBase64, mimeType, thumbUrl)
    stripTimerRef.current = setTimeout(() => setShowStrip(true), 300)
  }

  // When result is ready, strip is already showing — no action needed (status drives UI)

  const handleStripTap = () => {
    if (status === 'ready' && scanId) {
      setShowStrip(false)
      router.push(`/scan/results?scanId=${scanId}`)
    }
  }

  const handleStripCancel = () => {
    cancelScan()
    setShowStrip(false)
  }

  // Clean up timer on unmount
  useEffect(() => () => { if (stripTimerRef.current) clearTimeout(stripTimerRef.current) }, [])

  return (
    <>
      <main ...>{children}</main>
      <GlassTabBar ... />
      {showStrip && (status === 'processing' || status === 'ready') && (
        <ProcessingStrip
          status={status}
          thumbnailUrl={thumbnailUrl}
          onTap={handleStripTap}
          onCancel={handleStripCancel}
        />
      )}
      {isCameraModalOpen && (
        <CameraModal
          onClose={() => setIsCameraModalOpen(false)}
          onCapture={handleCapture}
        />
      )}
    </>
  )
}
```

**Note:** The `ProcessingStrip` renders ABOVE the camera modal's z-index stack order — `CameraModal` is `z-50`, `ProcessingStrip` is `z-40`. The strip should be positioned after `GlassTabBar` in the DOM (z-40 sits above tab bar z-30 but below modal z-50).

### Task 5: Results Page Placeholder

```typescript
// src/app/scan/results/page.tsx
import { Suspense } from 'react'

export default function ScanResultsPage() {
  return (
    <Suspense fallback={null}>
      <ScanResultsContent />
    </Suspense>
  )
}

function ScanResultsContent() {
  // Story 2.3 builds out this page — placeholder for navigation target
  return (
    <div style={{ padding: '16px', color: 'var(--text-primary)' }}>
      <p>Scan results — coming in Story 2.3</p>
    </div>
  )
}
```

This page only needs to exist as a valid navigation target. Story 2.3 replaces it completely.

### Design Token Usage

All styling must use design tokens from `globals.css`. Key values:

| Design token | CSS var | Value |
|---|---|---|
| Capture button size | — | `72px` (inline) |
| Upload button size | — | `48px` (inline) |
| Dismiss touch target | — | `44px` (inline) |
| Corner bracket | — | `32pt` = `32px` (inline) |
| Processing strip height | — | `56px` (inline) |
| Strip glass bg | `--glass-strip-bg` | `rgba(255,255,255,0.12)` — add to globals.css |
| Strip blur | — | `24px` (inline) |
| Thumbnail radius | `--radius-xs` | `0.5rem` = `8px` |
| Strip bottom offset | — | `calc(49px + env(safe-area-inset-bottom, 0px) + 8px)` |
| Text sm | `--text-sm` | `0.9375rem` |
| Text primary | `--text-primary` | `rgba(255,255,255,1.0)` |
| Text secondary | `--text-secondary` | `rgba(255,255,255,0.60)` |
| Glass FAB | `glass-fab` | Tailwind class — already defined in globals.css |

**Add to `globals.css`** in the dark mode block (`:root, [data-theme="dark"]`):
```css
/* Glass — Processing Strip (blur 24px) */
--glass-strip-bg: rgba(255, 255, 255, 0.12);
--glass-strip-blur: 24px;
```
And in the light mode block (`[data-theme="light"]`):
```css
--glass-strip-bg: rgba(255, 255, 255, 0.75);
```

### Test Approach

**Environment**: Vitest with jsdom. All camera APIs must be mocked.

**Mock `navigator.mediaDevices`:**
```typescript
beforeEach(() => {
  Object.defineProperty(navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn().mockResolvedValue({
        getTracks: () => [{ stop: vi.fn() }],
      }),
    },
    writable: true,
  })
})
```

**Mock `navigator.permissions`:**
```typescript
Object.defineProperty(navigator, 'permissions', {
  value: {
    query: vi.fn().mockResolvedValue({ state: 'granted' }),
  },
  writable: true,
})
```

**Mock canvas:**
```typescript
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
  drawImage: vi.fn(),
  // ... other ctx methods needed
} as unknown as CanvasRenderingContext2D)

vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
  'data:image/jpeg;base64,/9j/testbase64data'
)
```

**Mock framer-motion** (to avoid animation issues in tests):
```typescript
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<object>) =>
      React.createElement('div', props, children),
    // add other elements as needed
  },
  useReducedMotion: () => false,
  AnimatePresence: ({ children }: React.PropsWithChildren) => children,
}))
```

**Key test cases for `camera-modal.test.tsx`:**
- Renders dismiss button, capture button, upload button
- Calls `onClose` when dismiss button clicked
- Does NOT call `onCapture` when dismissed without photo
- Shows value-framing copy when permission state is 'prompt'
- Shows denied state when permission is 'denied'
- Shows upload as active when camera is denied
- Calls `onCapture` with correct args after capture

**Key test cases for `processing-strip.test.tsx`:**
- Renders with 'processing' status: shows "Identifying your menu"
- Renders with 'ready' status: shows "Your results are ready"
- `onTap` not called when status is 'processing'
- `onTap` called when tapped with status 'ready'
- Shows swipe warning on first swipe-down
- `onCancel` called on second swipe-down

**Key test cases for `use-scan.test.ts`:**
- Initial status is 'idle'
- `submitScan` sets status to 'processing'
- On successful fetch: status becomes 'ready', scanId populated
- On fetch error: status becomes 'error'
- `cancelScan` aborts fetch and returns to 'idle'
- TanStack Query cache populated on success: `['scan-result', scanId]`

**Mock `fetch` for use-scan tests:**
```typescript
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({
    data: {
      scanId: 'test-scan-id',
      type: 'menu',
      dishes: [],
      confidenceSource: 'gemini-only',
    }
  })
})
```

### Existing Code to Reuse

| Already exists | Location | Notes |
|---|---|---|
| `CameraModal` placeholder | `src/components/scan/camera-modal.tsx` | REPLACE entirely — current placeholder has no camera logic |
| `CameraFab` | `src/components/layout/camera-fab.tsx` | No changes — already triggers `onClick` in AppShell |
| `AppShell` | `src/components/layout/app-shell.tsx` | MODIFY — add scan state, strip, updated modal callback |
| `glass-fab` CSS class | `globals.css` | Use for capture button and dismiss button |
| Framer-motion | `package.json` | Already installed — used in `CameraFab`, `CameraModal` |
| `useReducedMotion()` | framer-motion | Already used in `CameraFab` and `CameraModal` — use same pattern |
| Spring transition constants | `camera-fab.tsx` | Same `{ type: 'spring', mass: 1, stiffness: 300, damping: 30 }` used throughout |
| `ScanRequest`, `ScanResult` | `src/types/api.ts` | Use for typed fetch — do NOT redefine |
| `['scan-result', scanId]` TQ key | architecture | Use exactly this key shape — Story 2.3 reads from it |
| Test setup | `src/test/setup.ts` | Mocks `IntersectionObserver` and `matchMedia` — no changes needed |

### Anti-Patterns to Prevent

```typescript
// ❌ Do NOT call Gemini directly from the client
fetch('https://generativelanguage.googleapis.com/...', { body: imageBase64 })

// ✅ Always via /api route
fetch('/api/scan/menu', { body: JSON.stringify({ imageBase64, mimeType }) })

// ❌ Do NOT pass data URL to the API route
onCapture('data:image/jpeg;base64,/9j/...', 'image/jpeg')  // prefix included

// ✅ Strip the prefix before sending
onCapture(dataUrl.split(',')[1], 'image/jpeg')  // raw base64 only

// ❌ Do NOT forget to stop media tracks on unmount
// camera light stays on after modal closes

// ✅ Always stop tracks in cleanup
useEffect(() => {
  return () => streamRef.current?.getTracks().forEach(t => t.stop())
}, [])

// ❌ Do NOT put useScan inside CameraModal
// The scan result outlives the modal — put the hook in AppShell

// ✅ AppShell owns the scan state; modal only calls onCapture

// ❌ Do NOT regress the existing 83 tests
// Run `npm test` and verify all pass before submitting

// ❌ Do NOT use new TanStack Query key shapes
// Use ['scan-result', scanId] exactly as defined in architecture

// ❌ Do NOT show processing strip immediately (before 300ms delay)
// Strip appears 300ms AFTER modal closes, not when scan starts

// ❌ Do NOT add flash/zoom controls to the camera UI
// Minimal camera UI: corner brackets + capture button + upload button + dismiss only
```

### Previous Story Intelligence (2.1)

From Story 2.1 completion notes:
- **83 tests passing** (62 pre-existing + 21 new from 2.1) — do NOT regress
- `src/types/api.ts` is complete: `ScanRequest`, `ScanResult`, `DishResult`, `IngredientResult` all defined — use as-is
- `ScanRequest` shape: `{ imageBase64: string, mimeType: string }` — no mode field
- Mock patterns for `server-only` in tests: `vi.mock('server-only', () => ({}))` — not needed for client hook tests
- Framer-motion constructor mock: use `vi.fn().mockImplementation(() => ({...}))` NOT arrow functions for constructor mocks
- `CameraModal` at `src/components/scan/camera-modal.tsx` is explicitly flagged as placeholder waiting for Story 2.2

### Architecture Enforcement

| Rule | Detail |
|---|---|
| `useScan` location | `src/hooks/use-scan.ts` — one hook per domain |
| `ProcessingStrip` location | `src/components/scan/processing-strip.tsx` |
| Scan API calls | Client → `/api/scan/menu` only; never Gemini directly |
| TQ key for scan result | `['scan-result', scanId]` — Story 2.3 reads this exact key |
| Camera stream cleanup | Stop all tracks on modal unmount; no memory/permission leaks |
| Permission UX | Show in-app value-framing BEFORE calling `getUserMedia` |
| Processing strip timing | 300ms delay after modal closes (per UX spec) |
| Reduce Motion | Use `useReducedMotion()` and replace springs with 150ms opacity fades |
| Test files | Co-located with source files (no `__tests__/` directory) |
| Photo upload | Co-equal with camera — no secondary labelling, same quality expected |
| Scan route | Default to `/api/scan/menu` — this story's strip copy says "Identifying your menu..." |

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- ✅ Implemented `useScan` hook with `useMutation`, AbortController cancellation, and TanStack Query cache population at `['scan-result', scanId]`
- ✅ Implemented `ProcessingStrip` with glass styling, spring/fade animations, swipe-to-cancel (2-swipe safety pattern), thumbnail display, and Reduce Motion support
- ✅ Replaced camera-modal placeholder with full camera UI: live video stream, permission flow (value-framing before getUserMedia, denied state), corner brackets fading after 2s, capture via canvas, upload via FileReader, shutter animation, media track cleanup on unmount
- ✅ Updated AppShell to wire scan state: capture → submitScan → 300ms delayed strip, strip tap → navigate to `/scan/results?scanId=`, cancel → cancelScan + hide strip
- ✅ Created `/scan/results` placeholder page as navigation target for Story 2.3
- ✅ Wrote 38 new tests across `use-scan.test.ts`, `processing-strip.test.tsx`, `camera-modal.test.tsx`
- ✅ Updated `app-shell.test.tsx` to add QueryClientProvider wrapper + mocks for new imports
- ✅ All 121 tests passing (83 pre-existing + 38 new), zero regressions

### File List

- `src/hooks/use-scan.ts` — NEW
- `src/hooks/use-scan.test.ts` — NEW
- `src/components/scan/processing-strip.tsx` — NEW
- `src/components/scan/processing-strip.test.tsx` — NEW
- `src/components/scan/camera-modal.tsx` — REPLACED placeholder
- `src/components/scan/camera-modal.test.tsx` — NEW
- `src/components/layout/app-shell.tsx` — MODIFIED (added useScan, ProcessingStrip, handleCapture)
- `src/components/layout/app-shell.test.tsx` — MODIFIED (added QueryClientProvider, mocked new imports)
- `src/app/scan/results/page.tsx` — NEW (placeholder)

### Change Log

- 2026-03-20: Story 2.2 implemented — camera modal & capture flow. Implemented useScan hook, ProcessingStrip, full CameraModal with permission flow and live video, AppShell wiring, and scan results placeholder. 38 new tests added, all 121 passing.
