# Story 6.2: PWA Install Experience

**Status:** ready-for-dev
**Story ID:** 6.2
**Epic:** 6 — Accessibility, PWA & Production Readiness

---

## Story

As a user who has completed their first successful scan,
I want to install Plately to my iPhone home screen,
So that I can launch it instantly without opening Safari each time.

---

## Acceptance Criteria

**AC1 — In-app install prompt after first save (FR33, UX-DR18)**
Given the user has completed their first successful scan and saved a recipe
When the PWA install prompt is offered
Then an in-app prompt appears with: "Add Plately to your home screen for one-tap access", an Install action button, and a Dismiss button

**AC2 — Dismissed prompt does not reappear in same session**
Given the install prompt is dismissed
When the user opens the app again in the same session
Then the install prompt does not reappear; it may reappear in a future session after a meaningful interval (not on every open)

**AC3 — manifest.json is correct**
Given `public/manifest.json`
When inspected
Then it contains: `name: "Plately"`, `display: "standalone"`, `theme_color`, `start_url`, and icon entries at 192×192pt and 512×512pt including at least one maskable icon

**AC4 — Installed app shows no Safari chrome**
Given the app is launched from the iPhone home screen after install
When it renders
Then no Safari browser chrome is visible; the app fills the full screen including behind the status bar; the standalone PWA experience is indistinguishable from a native app shell

**AC5 — Install is enhancement only, never required (UX-DR18)**
Given the app is accessed in Safari (not installed)
When all core flows are used (scan, recipe, grocery, search)
Then they work identically to the installed version; install is an enhancement only, never a requirement

---

## Tasks / Subtasks

### Task 1: Update `public/manifest.json` to add maskable icon

- [ ] Open `public/manifest.json` (created by Story 4.4)
- [ ] Add a `"purpose": "maskable"` entry alongside the existing 512×512 icon, OR add it to the existing entry as `"purpose": "any maskable"`
- [ ] Verify `name: "Plately"`, `display: "standalone"`, `theme_color`, and `start_url: "/"` are already present (they are — see Dev Notes)
- [ ] The 192×192 icon remains as-is; add maskable purpose only to the 512×512 entry (minimum requirement for Chrome/Android; iOS ignores the field but it does not break anything)
- [ ] Write a unit test in `src/components/pwa/install-prompt.test.tsx` (or a separate manifest test) — or alternatively validate manifest in the existing smoke test checklist

### Task 2: Create `useInstallPrompt` hook

- [ ] Create `src/hooks/use-install-prompt.ts`
- [ ] The hook listens for the browser's `beforeinstallprompt` event and holds the deferred prompt reference
- [ ] Expose: `{ canInstall: boolean, promptInstall: () => Promise<void>, dismiss: () => void }`
- [ ] `canInstall` is `true` only when the deferred event has been captured AND the prompt has not been dismissed in the current session AND the app is not already running in standalone mode
- [ ] Track session-dismissed state using `sessionStorage.setItem('pwa-install-dismissed', '1')` — on mount, read this flag and set `canInstall = false` if present
- [ ] Standalone detection: `window.matchMedia('(display-mode: standalone)').matches` or `navigator.standalone === true` (iOS Safari) — if either is true, `canInstall` is always false (already installed)
- [ ] `promptInstall()` calls `deferredEvent.prompt()`, awaits `deferredEvent.userChoice`, then clears the reference (prompt can only be used once)
- [ ] `dismiss()` sets `sessionStorage` flag and updates local state so `canInstall` becomes false
- [ ] Write unit tests in `src/hooks/use-install-prompt.test.ts` — see Dev Notes for test strategy

### Task 3: Create `InstallPromptBanner` component

- [ ] Create `src/components/pwa/install-prompt-banner.tsx`
- [ ] Props: `onInstall: () => void`, `onDismiss: () => void`
- [ ] Copy styling pattern from the glass components — use `GlassCard` from `@/components/ui/glass-card` as the container
- [ ] Render: text "Add Plately to your home screen for one-tap access" (`text-sm`), Install button (primary, 44pt height, `radius-lg`), Dismiss button (ghost/text, 44pt height)
- [ ] The banner is positioned fixed at the bottom above the tab bar: `position: fixed`, `bottom: calc(49px + env(safe-area-inset-bottom, 0px) + 8px)`, `left: 16px`, `right: 16px`, `z-index: 50`
- [ ] Animate in with the same spring animation pattern used in other glass components: `opacity 0→1`, `translateY 20px→0` over 200ms
- [ ] Write unit tests in `src/components/pwa/install-prompt-banner.test.tsx`

### Task 4: Wire `useInstallPrompt` into `AppShell` triggered by first recipe save

- [ ] In `src/components/layout/app-shell.tsx`, import `useInstallPrompt` and `InstallPromptBanner`
- [ ] Add state: `const [showInstallBanner, setShowInstallBanner] = useState(false)`
- [ ] Import `useInstallPrompt` and destructure: `const { canInstall, promptInstall, dismiss } = useInstallPrompt()`
- [ ] Listen for the custom event `plately:recipeSaved` (dispatched by the save flow — see Task 5) on the `window`; when this event fires AND `canInstall` is true, set `showInstallBanner = true`
- [ ] The install banner renders conditionally below the `ProcessingStrip` and above the `CameraModal`:
  ```tsx
  {showInstallBanner && canInstall && (
    <InstallPromptBanner
      onInstall={async () => {
        await promptInstall()
        setShowInstallBanner(false)
      }}
      onDismiss={() => {
        dismiss()
        setShowInstallBanner(false)
      }}
    />
  )}
  ```
- [ ] Ensure the banner does not conflict with the `ProcessingStrip` z-index (strip is z-40, banner should be z-50 so it sits above during normal use, but if both appear simultaneously the strip takes visual precedence — reduce banner to z-35 or ensure they don't show simultaneously)
- [ ] Do NOT modify the existing scan flow, tab bar, or any other AppShell logic

### Task 5: Dispatch `plately:recipeSaved` from scan results save flow

- [ ] In `src/components/scan/scan-results.tsx`, in `handleSaveRecipe` after a successful `saveMutation.mutateAsync`, dispatch: `window.dispatchEvent(new CustomEvent('plately:recipeSaved'))`
- [ ] Add the same dispatch in `src/app/search/restaurants/[googlePlacesId]/page.tsx` (Story 5.3 save flow) after successful `saveMutation.mutateAsync`
- [ ] This is a fire-and-forget custom event — no payload needed; `AppShell` decides whether to show the prompt
- [ ] Do NOT gate the save toast or the save success flow on this event; the dispatch is a side effect only

### Task 6: Write tests

- [ ] `src/hooks/use-install-prompt.test.ts` — see Dev Notes for test strategy
- [ ] `src/components/pwa/install-prompt-banner.test.tsx` — render test, install button calls `onInstall`, dismiss button calls `onDismiss`
- [ ] Update `src/components/layout/app-shell.test.tsx` (if it exists) OR add to the integration test surface: when `plately:recipeSaved` fires and `canInstall` is true, the banner appears

---

## Dev Notes

### Foundation from Story 4.4

Story 4.4 (offline read access) already created:
- `public/manifest.json` — correct, already has `name: "Plately"`, `display: "standalone"`, `start_url: "/"`, `theme_color: "#000000"`, icon entries at 192×192 and 512×512
- `next.config.ts` — wrapped with `withPWA` from `@ducanh2912/next-pwa`; service worker auto-generates to `public/sw.js` on `npm run build`
- `src/app/layout.tsx` — already has `manifest: '/manifest.json'`, `appleWebApp` metadata, and `themeColor` via viewport — **do not add `<link rel="manifest">` or `<meta name="theme-color">` tags manually**; they are managed by the Next.js metadata API
- `src/hooks/use-online-status.ts` — `useOnlineStatus()` hook pattern to follow for `useInstallPrompt`
- `public/icons/icon-192x192.png` and `public/icons/icon-512x512.png` — placeholder dark charcoal PNGs; replace with real branded assets before launch

**The only manifest.json change needed is adding a maskable icon purpose.** Everything else from AC3 is already in place.

### Current `public/manifest.json` State

```json
{
  "name": "Plately",
  "short_name": "Plately",
  "description": "Your recipe collection and grocery list, offline-ready",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#000000",
  "icons": [
    {
      "src": "/icons/icon-192x192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512x512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

Update the 512×512 icon to:
```json
{
  "src": "/icons/icon-512x512.png",
  "sizes": "512x512",
  "type": "image/png",
  "purpose": "any maskable"
}
```

This satisfies AC3's "at least one maskable icon" requirement without requiring a separate maskable icon file.

### `beforeinstallprompt` Browser Support

- **Android Chrome:** Fires `beforeinstallprompt`; full programmatic install flow works
- **iOS Safari:** Does NOT fire `beforeinstallprompt`; Apple does not support the Web Install API
- **iOS behavior:** On iOS, `canInstall` will always be false because the event never fires; the banner will never show programmatically on iOS. This is expected and correct — iOS users install via Safari's "Share → Add to Home Screen" flow. The existing meta tags in `layout.tsx` (`apple-mobile-web-app-capable`, standalone display mode) ensure the installed experience works correctly on iOS when users install manually.
- **AC4 (no Safari chrome):** Already satisfied by the existing `apple-mobile-web-app-capable` meta and `display: "standalone"` in manifest — no code change needed. Verified by existing Story 4.4 implementation.

**Implication for the hook:** The hook's `canInstall` will realistically only be `true` on Android Chrome. This is fine — the prompt is enhancement only (AC5). The code should not special-case iOS; it simply won't fire.

### `useInstallPrompt` Hook Implementation Pattern

Follow the exact same structure as `src/hooks/use-online-status.ts` (created in Story 4.4):

```typescript
'use client'
import { useEffect, useState } from 'react'

// BeforeInstallPromptEvent is not in the standard TypeScript lib — define it locally
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const SESSION_KEY = 'pwa-install-dismissed'

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).standalone === true
  )
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    // Already installed or dismissed this session → short-circuit
    if (isStandalone()) return
    if (sessionStorage.getItem(SESSION_KEY)) {
      setDismissed(true)
      return
    }

    const handler = (e: Event) => {
      e.preventDefault() // Prevent default mini-infobar on Chrome
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const canInstall = !!deferredPrompt && !dismissed && !isStandalone()

  const promptInstall = async () => {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null) // Prompt can only be used once
  }

  const dismiss = () => {
    sessionStorage.setItem(SESSION_KEY, '1')
    setDismissed(true)
  }

  return { canInstall, promptInstall, dismiss }
}
```

### `useInstallPrompt` Test Strategy

`BeforeInstallPromptEvent` and `sessionStorage` are the two surfaces to mock. Pattern:

```typescript
// Mock sessionStorage
const mockGetItem = vi.spyOn(Storage.prototype, 'getItem')
const mockSetItem = vi.spyOn(Storage.prototype, 'setItem')

// Mock beforeinstallprompt event
const createPromptEvent = () => {
  const event = new Event('beforeinstallprompt')
  Object.assign(event, {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  })
  return event
}
```

**Required test cases:**
- `canInstall` is false before `beforeinstallprompt` fires
- `canInstall` is true after event fires
- `canInstall` is false when `sessionStorage` has the dismissed key on mount
- `dismiss()` sets `sessionStorage` key and makes `canInstall` false
- `promptInstall()` calls `event.prompt()` and clears the deferred event
- `canInstall` is false when `display-mode: standalone` media query matches

### `InstallPromptBanner` Positioning

The `AppShell` already uses `calc(49px + env(safe-area-inset-bottom, 0px))` for the main content padding-bottom and for the `ProcessingStrip` / `ErrorState` positioning. Use the same formula:

```typescript
// Banner sits above the tab bar, same as ProcessingStrip / ErrorState
style={{
  position: 'fixed',
  bottom: 'calc(49px + env(safe-area-inset-bottom, 0px) + 8px)',
  left: '16px',
  right: '16px',
  zIndex: 35, // Below ProcessingStrip (z-40) but above page content
}}
```

Use `GlassCard` from `@/components/ui/glass-card` as the outer container. The card uses `backdrop-filter: blur(20px)` automatically.

### Custom Event Pattern in AppShell

`AppShell` already uses custom events for the retake/camera flow:
```typescript
// Existing pattern in app-shell.tsx — line 73–77:
useEffect(() => {
  const handleOpenCamera = () => setIsCameraModalOpen(true)
  window.addEventListener('plately:openCamera', handleOpenCamera)
  return () => window.removeEventListener('plately:openCamera', handleOpenCamera)
}, [])
```

Follow this exact pattern for `plately:recipeSaved`.

### Dispatching `plately:recipeSaved`

In `src/components/scan/scan-results.tsx`, the save success path is in `handleSaveRecipe`:
```typescript
const saved = await saveMutation.mutateAsync(payload)
const savedId = saved.data.id
setSavedDishIds(prev => ({ ...prev, [dish.name]: savedId }))
toast('Recipe saved')
// ADD after the toast:
window.dispatchEvent(new CustomEvent('plately:recipeSaved'))
```

In `src/app/search/restaurants/[googlePlacesId]/page.tsx` (Story 5.3), find the analogous `mutateAsync` success block and add the same dispatch after the `toast('Recipe saved')` call.

### What AC4 Requires (Already Implemented)

AC4 states "no Safari browser chrome; fills full screen including behind status bar." This is already satisfied by:
1. `src/app/layout.tsx` — `apple-mobile-web-app-capable: true` via `appleWebApp` metadata
2. `public/manifest.json` — `display: "standalone"`
3. `src/app/layout.tsx` — `themeColor: '#000000'` in the viewport export

No additional code is needed for AC4. The developer should verify it manually during smoke testing by installing the app and checking the display.

### File Structure

```
src/
  hooks/
    use-install-prompt.ts          ← NEW
    use-install-prompt.test.ts     ← NEW
  components/
    pwa/
      install-prompt-banner.tsx    ← NEW
      install-prompt-banner.test.tsx ← NEW
    layout/
      app-shell.tsx                ← MODIFY (add banner + event listener)
    scan/
      scan-results.tsx             ← MODIFY (dispatch plately:recipeSaved)
  app/
    search/restaurants/[googlePlacesId]/
      page.tsx                     ← MODIFY (dispatch plately:recipeSaved)
public/
  manifest.json                    ← MODIFY (add maskable purpose)
```

### Files NOT to Modify

- `src/app/layout.tsx` — metadata already correct; no changes needed
- `next.config.ts` — PWA config from Story 4.4 is complete; no changes needed
- `src/sw/index.ts` — Background Sync config; not related to install prompt
- `src/hooks/use-online-status.ts` — copy the pattern, do not modify
- `src/hooks/use-recipes.ts` — no changes; save mutation is already implemented

### Architecture Compliance

| Concern | Decision |
|---|---|
| `'use client'` | `use-install-prompt.ts` and `install-prompt-banner.tsx` must be client components |
| No SSR access to `window` | All `window`/`navigator`/`sessionStorage` access must be inside `useEffect` or guarded by `typeof window !== 'undefined'` |
| `GlassCard` for banner | Do NOT create a custom glass effect; reuse `@/components/ui/glass-card` |
| `sessionStorage` not `localStorage` | Per AC2: dismissed state is session-scoped (clears on tab/browser close); `localStorage` would persist too long |
| Z-index hierarchy | Tab bar is implicitly z-10; ProcessingStrip/ErrorState uses z-40; banner uses z-35 |
| Spring animation | Entrance animation must follow the project's `prefers-reduced-motion` pattern — 150ms opacity fade when motion is reduced; see Story 1.2 and 6.1 requirements |

### Cross-Story Context

| Story | Relationship |
|---|---|
| **4.4** — Offline Read Access & PWA Service Worker | Created the service worker, manifest.json, and PWA foundation. This story adds the install prompt UI on top. Do not re-implement or change the service worker setup. |
| **6.1** — Accessibility Audit | The `InstallPromptBanner` must comply with 44×44pt minimum touch targets (both buttons) and must work with VoiceOver. Announce the banner as it appears. |
| **2.3 / 3.1** — Scan results & Recipe save | `plately:recipeSaved` is dispatched from these flows. Do not break the existing save toast or success state. |
| **5.3** — Recipe generation from search | The search-originated save flow in `/search/restaurants/[googlePlacesId]/page.tsx` also triggers the event. |

### Regression Risk Areas

1. **`scan-results.tsx` save flow** — adding `window.dispatchEvent` after the toast must not affect any existing test. The dispatch is a pure side effect. Verify `src/components/scan/scan-results.test.tsx` passes after the change.
2. **`AppShell` event listener** — the `plately:recipeSaved` listener must be cleaned up in the `useEffect` return function, matching the existing `plately:openCamera` pattern exactly. A missing cleanup causes memory leaks and double-fires in tests.
3. **`canInstall` false on iOS** — do not add any iOS-specific code paths. On iOS, `beforeinstallprompt` never fires; `canInstall` is always false; no banner shows. This is correct behavior. Tests that mock the event work on all platforms; tests for iOS simply verify nothing shows without the event.

### Manual Smoke Test (Required Before Marking Done)

Because `beforeinstallprompt` requires a production HTTPS build:

```bash
npm run build
npm start
# Open http://localhost:3000 in Chrome on Android (or Chrome DevTools with mobile emulation)
```

**Steps:**
- [ ] In Chrome DevTools → Application → Manifest — confirm `display: standalone`, `name: Plately`, maskable icon present
- [ ] Trigger a recipe save — confirm `plately:recipeSaved` dispatches (add temporary `console.log` to verify)
- [ ] On a real Android Chrome or Chrome with "Add to home screen" enabled: confirm banner appears after save
- [ ] Tap Dismiss — confirm banner disappears and does not reappear on reload (same session)
- [ ] Tap Install — confirm system install dialog appears
- [ ] Install the app — open from home screen — confirm no browser chrome visible (AC4)
- [ ] Verify scan, recipe, grocery, and search all work in installed mode (AC5)

---

## Cross-Story Context

### What This Story Does NOT Change

- `next.config.ts` — PWA config is complete
- `src/sw/index.ts` — Background Sync; untouched
- `src/app/layout.tsx` — metadata already correct
- `src/hooks/use-online-status.ts` — copy pattern only
- `src/hooks/use-recipes.ts` — no changes
- `src/app/api/` routes — no changes
- Any grocery or recipe page components

---

## Dev Agent Record

### Agent Model Used
_(to be filled in by dev agent)_

### Debug Log References
_(to be filled in by dev agent)_

### Completion Notes List
_(to be filled in by dev agent)_

### File List
_(to be filled in by dev agent)_

---

## Change Log

- 2026-03-28: Story 6.2 created (epic 6, story 2 — PWA install experience)
