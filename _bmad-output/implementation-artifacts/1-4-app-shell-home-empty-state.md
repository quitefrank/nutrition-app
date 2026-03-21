# Story 1.4: App Shell & Home Empty State

Status: done

## Story

As a user opening Plately for the first time,
I want to see a welcoming home screen with a clear first action,
so that I can immediately understand what to do without a tutorial.

## Acceptance Criteria

1. **Given** the app is opened and no recipes have been saved **When** the home screen renders **Then** the empty state displays: the prompt "Eaten somewhere great recently?" (`text-xl`, centred, `--text-primary`), supporting copy "Find the dish and save the recipe for next time." (`text-sm`, `--text-secondary`, centred), a "Search for a dish" primary CTA button (56pt height, `radius-xl`, full width, glass), and a secondary camera hint below it ("Or use the camera to scan a menu").

2. **Given** the home screen empty state **When** the user taps "Search for a dish" **Then** the app navigates to the Search tab (`/search` route); the Search tab item becomes active in the glass tab bar.

3. **Given** the glass tab bar is rendered **When** visible on any screen **Then** Home, Search, and Grocery tab items are visible; the active tab icon and label are at `--text-primary` opacity; inactive tabs are at `--text-tertiary` opacity; the camera FAB (56pt diameter, `radius-full`, `.glass-fab`) is positioned to the right of the tab items.

4. **Given** the camera FAB is tapped from any tab **When** tapped **Then** a placeholder camera modal opens (no camera functionality in this story); the modal renders full-screen with a glass × dismiss button (top right, 44pt touch target, `radius-full`, `.glass-fab` style); tapping × closes the modal.

5. **Given** the user is on any tab **When** they tap a different tab **Then** the tab switch uses a 200ms ease opacity crossfade (implemented via `src/app/template.tsx`); the active tab indicator updates immediately; no slide transition occurs; Reduce Motion: crossfade shortens to 150ms opacity.

6. **Given** the app is opened at any point **When** any screen is rendered **Then** no login prompt, registration screen, or personal data request appears; all screens are accessible without authentication (FR38).

7. **Given** the app shell on iPhone Safari portrait mode **When** rendered at 390pt viewport width **Then** no horizontal scroll exists; all content fits within the viewport; the bottom safe area (home indicator) is respected and the tab bar sits above it; page content has sufficient bottom padding so it is not hidden behind the fixed tab bar.

## Tasks / Subtasks

- [x] Task 1: Create `src/components/layout/app-shell.tsx` — manages tab navigation state and camera modal (AC: 2, 3, 4, 5, 7)
  - [x] `'use client'` directive
  - [x] Use `usePathname()` from `next/navigation` to derive active tab from route (`/` → 'home', `/search` → 'search', `/grocery` → 'grocery')
  - [x] Use `useRouter()` from `next/navigation` for `push()` on tab change
  - [x] Manage `isCameraModalOpen: boolean` state
  - [x] Render `<main>` wrapper with `pb-[calc(49px+env(safe-area-inset-bottom,0px))]` + `flex-1`
  - [x] Render `{children}` inside `<main>`
  - [x] Render `<GlassTabBar>` with `activeTab`, `onTabChange`, and `fabSlot={<CameraFab onClick={openModal} />}`
  - [x] Render `<CameraModalPlaceholder>` when `isCameraModalOpen` is true

- [x] Task 2: Create `src/components/layout/camera-fab.tsx` — 56pt glass FAB button (AC: 3, 4)
  - [x] `'use client'` directive
  - [x] Button: 56×56pt, `rounded-[var(--radius-full)]`, `.glass-fab` class, `aria-label="Open camera"`
  - [x] Camera icon: inline SVG (22×22pt, `currentColor`); match the style of existing inline SVGs in `glass-tab-bar.tsx`
  - [x] Use `useReducedMotion()` for spring vs 150ms opacity animation on mount: spring (mass:1, stiffness:300, damping:30) or 150ms fade
  - [x] Scale: 0.96→1.0 on appear (unless Reduce Motion)
  - [x] Pressed state: scale 1.0→0.97 via CSS `active:scale-[0.97]`
  - [x] Accept `onClick` prop

- [x] Task 3: Create `src/components/scan/camera-modal.tsx` — placeholder camera modal (AC: 4)
  - [x] `'use client'` directive
  - [x] Full-screen fixed overlay: `fixed inset-0 z-50 bg-black/80 backdrop-blur-sm`
  - [x] Glass × dismiss button: top right, `44pt` × `44pt` touch target, `rounded-[var(--radius-full)]`, `.glass-fab` class; `aria-label="Close camera"`
  - [x] Show placeholder text: "Camera coming in Story 2.2" (centered, `--text-secondary`)
  - [x] Spring-up animation on mount via `framer-motion` `motion.div` (from `y: 40` to `y: 0`, opacity 0→1); Reduce Motion: 150ms opacity only
  - [x] Accept `onClose` prop
  - [x] **IMPORTANT**: This is a placeholder — do NOT request camera permission, do NOT import camera APIs

- [x] Task 4: Create `src/app/template.tsx` — tab switch crossfade animation (AC: 5)
  - [x] `'use client'` directive
  - [x] `motion.div` wrapping `{children}` with `initial={{ opacity: 0 }}`, `animate={{ opacity: 1 }}`, `transition={{ duration: shouldReduceMotion ? 0.15 : 0.2, ease: 'easeOut' }}`
  - [x] This is NOT a spring — use `duration` + `ease`, not `type: 'spring'`
  - [x] `template.tsx` re-mounts on every route change (Next.js App Router semantics), producing automatic tab crossfade

- [x] Task 5: Replace `src/app/page.tsx` with home empty state (AC: 1, 2, 6, 7)
  - [x] This is a **Server Component** (no `'use client'` directive needed — no interactivity here; navigation is handled by the shell)
  - [x] Centered layout: `flex flex-col items-center justify-center flex-1 gap-[var(--spacing-8)] px-[var(--spacing-4)] text-center`
  - [x] Heading: "Eaten somewhere great recently?" — `style={{ fontSize: 'var(--text-xl)', color: 'var(--text-primary)', fontWeight: 600 }}`
  - [x] Supporting copy: "Find the dish and save the recipe for next time." — `style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}`
  - [x] "Search for a dish" CTA: `<Link href="/search">` wrapping a `<button>`-style element; full-width, 56pt height, `rounded-[var(--radius-xl)]`, `.glass-pill` class, `style={{ height: '56px', width: '100%', fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: 600 }}`
  - [x] Camera hint: "Or use the camera to scan a menu" — `style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}`
  - [x] Remove ALL Next.js boilerplate content (current page.tsx is the Next.js default scaffold — delete everything)

- [x] Task 6: Create `src/app/search/page.tsx` — Search tab placeholder (AC: 2, 7)
  - [x] Server Component; minimal placeholder: centered "Search" heading + "Coming in Story 5.2" text
  - [x] Use the same centering layout as page.tsx for consistency

- [x] Task 7: Create `src/app/grocery/page.tsx` — Grocery tab placeholder (AC: 7)
  - [x] Server Component; minimal placeholder: centered "Grocery" heading + "Coming in Story 4.2" text

- [x] Task 8: Update `src/app/layout.tsx` — add AppShell + Toaster (AC: 3, 4, 5)
  - [x] Import `AppShell` from `@/components/layout/app-shell`
  - [x] Import `Toaster` from `sonner`
  - [x] Wrap `{children}` with `<AppShell>` inside `<Providers>`
  - [x] Add `<Toaster />` as a direct child of `<body>` (OUTSIDE `#main-content` — see CSS transform constraint in globals.css)
  - [x] Final structure: `<body><AtmosphericBackground /><div id="main-content"><Providers><AppShell>{children}</AppShell></Providers></div><Toaster /></body>`

- [x] Task 9: Write tests (AC: 1–7)
  - [x] `src/components/layout/app-shell.test.tsx`:
    - Tab change for 'home', 'search', 'grocery' calls `router.push()` with correct path
    - Camera FAB click opens modal (modal present in DOM)
    - Modal × dismiss closes modal (modal absent from DOM)
  - [x] `src/components/layout/camera-fab.test.tsx`:
    - Renders button with `aria-label="Open camera"`
    - `onClick` prop is called when tapped

## Dev Notes

### Critical Context: Layout Structure

The current `layout.tsx` structure (from Story 1.3):
```tsx
<body>
  <AtmosphericBackground />        {/* fixed, z-index -1, outside #main-content */}
  <div id="main-content" className="flex flex-col flex-1 min-h-full">
    <Providers>{children}</Providers>
  </div>
</body>
```

This story changes it to:
```tsx
<body>
  <AtmosphericBackground />        {/* stays outside #main-content — do not move */}
  <div id="main-content" className="flex flex-col flex-1 min-h-full">
    <Providers>
      <AppShell>{children}</AppShell>
    </Providers>
  </div>
  <Toaster />                      {/* also outside #main-content — CSS transform constraint */}
</body>
```

**Why Toaster outside #main-content**: `globals.css` applies `transform: scale(0.95)` to `#main-content` when a BottomSheet is open. CSS `transform` creates a new stacking context — any `position: fixed` element inside `#main-content` (including Sonner's `<Toaster>`) will not behave as truly fixed. This is already documented in `globals.css` base styles comment.

### Critical Context: Tab Navigation Architecture

This app uses Next.js App Router with full-page routes per tab:
- Home: `src/app/page.tsx` → route `/`
- Search: `src/app/search/page.tsx` → route `/search`
- Grocery: `src/app/grocery/page.tsx` → route `/grocery`

The `AppShell` derives `activeTab` from `usePathname()` — it does NOT manage the active tab in React state (route IS the source of truth):

```tsx
function getActiveTab(pathname: string): TabId {
  if (pathname.startsWith('/search')) return 'search'
  if (pathname.startsWith('/grocery')) return 'grocery'
  return 'home'  // '/' and everything else defaults to home
}

function getTabPath(tab: TabId): string {
  const paths: Record<TabId, string> = {
    home: '/',
    search: '/search',
    grocery: '/grocery',
  }
  return paths[tab]
}
```

Tab change handler pushes to the route; the URL change triggers `usePathname()` to update, which updates `activeTab`:
```tsx
const handleTabChange = (tab: TabId) => {
  router.push(getTabPath(tab))
}
```

### Critical Context: Tab Switch Animation

The 200ms crossfade is NOT a spring animation. From the UX spec: "Tab switches use crossfade (200ms) — no slide transitions".

`src/app/template.tsx` (Next.js `template.tsx`) re-mounts on every navigation, making it the right hook for this animation. **Do NOT use `layout.tsx` for this animation** — layout.tsx persists across navigations and does NOT re-mount.

```tsx
// src/app/template.tsx — CORRECT
'use client'
import { motion, useReducedMotion } from 'framer-motion'

export default function Template({ children }: { children: React.ReactNode }) {
  const shouldReduceMotion = useReducedMotion()
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: shouldReduceMotion ? 0.15 : 0.2, ease: 'easeOut' }}
      className="flex flex-col flex-1"
    >
      {children}
    </motion.div>
  )
}
```

### Critical Context: Tab Bar Height + Safe Area Padding

`GlassTabBar` renders `fixed bottom-0` with `pb-[env(safe-area-inset-bottom,0px)]`. The inner content height is `h-[49px]`. The total visual footprint from the bottom is `49px + safe-area-inset-bottom`.

`AppShell`'s `<main>` must add matching bottom padding so page content is never hidden behind the bar:

```tsx
<main className="flex flex-col flex-1 pb-[calc(49px+env(safe-area-inset-bottom,0px))]">
  {children}
</main>
```

### Critical Context: CSS Classes to Use (from globals.css)

All glass tokens are already defined:

| Component | CSS class | Key values |
|---|---|---|
| Camera FAB | `.glass-fab` | bg: 16% white (dark), border: 20% white, blur: 20px |
| Camera FAB (light) | `.glass-fab` | bg: 80% white, blur: 20px |
| Tab bar | `.glass-tab` (already used in GlassTabBar) | bg: 8% white, blur: 24px |
| CTA button | `.glass-pill` | bg: 10% white (dark), border: 15%, blur: 16px |

**Do NOT create new glass CSS classes** — all needed variants are in globals.css.

### Pattern: Animation on Mount (Spring vs Reduce Motion)

Follow the same pattern as `glass-card.tsx`:
```tsx
const shouldReduceMotion = useReducedMotion()

const initial = shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }
const animateTo = shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1.0 }
const transition = shouldReduceMotion
  ? { duration: 0.15 }
  : { type: 'spring' as const, mass: 1, stiffness: 300, damping: 30 }
```

This applies to: `CameraFab` mount animation.
Tab crossfade (`template.tsx`) uses 200ms ease, NOT spring — see note above.

### Pattern: CTA Button (Search CTA)

The "Search for a dish" button is a navigation element (`<Link>` from `next/link`) styled as a glass pill. Use `next/link` with `asChild`-style approach:

```tsx
import Link from 'next/link'

<Link
  href="/search"
  className="glass-pill flex items-center justify-center w-full rounded-[var(--radius-xl)]"
  style={{ height: '56px', fontSize: 'var(--text-base)', color: 'var(--text-primary)', fontWeight: 600 }}
>
  Search for a dish
</Link>
```

Using `<Link>` (not a `<button>` with `router.push`) is correct here since it's a navigation CTA — it provides correct semantics, keyboard navigation, and prefetching.

### Existing Code to Reuse (Do NOT Reinvent)

| Already exists | Where | Use for |
|---|---|---|
| `GlassTabBar` | `src/components/layout/glass-tab-bar.tsx` | Tab bar in AppShell; pass `fabSlot` prop |
| `GlassCard` | `src/components/ui/glass-card.tsx` | Glass card pattern if needed |
| `BottomSheet` | `src/components/ui/bottom-sheet.tsx` | Do NOT use for camera modal — use full-screen overlay instead |
| `AtmosphericBackground` | `src/components/layout/atmospheric-background.tsx` | Already in layout.tsx — do not touch |
| `framer-motion` | Already installed | `motion`, `useReducedMotion`, `AnimatePresence` |
| `cn()` | `@/lib/utils` | className composition |

### Pattern: Inline SVG Icons

Follow the exact style of icons already in `glass-tab-bar.tsx`. Example:
```tsx
<svg width="22" height="22" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" strokeWidth="2"
  strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
  {/* camera icon paths */}
</svg>
```

Camera icon SVG paths (standard):
```
<rect x="2" y="7" width="20" height="15" rx="2" ry="2"/>
<path d="M16 3H8L5 7h14l-3-4z"/>
<circle cx="12" cy="14" r="3"/>
```

### Architecture Enforcement Rules

| Rule | What to do |
|---|---|
| Supabase client | Not needed in this story; if imported, use `@/lib/supabase` only |
| TanStack Query keys | Not needed in this story (no data fetching) |
| Complex types | In `src/types/` — no inline complex types |
| API keys | Not needed in this story |
| No camera permission | CameraModalPlaceholder MUST NOT request camera access |
| Fixed elements | Never put fixed/position-fixed elements inside `#main-content` |

### Anti-Patterns to Prevent

```tsx
// ❌ Do NOT manage active tab as React state — URL IS the source of truth
const [activeTab, setActiveTab] = useState<TabId>('home')  // WRONG

// ✅ Derive from usePathname()
const pathname = usePathname()
const activeTab = getActiveTab(pathname)

// ❌ Do NOT use spring for tab crossfade
// template.tsx: transition={{ type: 'spring', mass: 1, stiffness: 300, damping: 30 }}

// ✅ Use 200ms ease for tab crossfade (UX spec explicit)
// template.tsx: transition={{ duration: 0.2, ease: 'easeOut' }}

// ❌ Do NOT put Toaster inside #main-content
<div id="main-content"><Toaster /></div>  // breaks fixed positioning under transform

// ✅ Toaster outside #main-content as direct child of body
<body>
  <AtmosphericBackground />
  <div id="main-content">...</div>
  <Toaster />
</body>

// ❌ Do NOT import camera/MediaDevices APIs in camera-modal.tsx (Story 2.2 scope)
navigator.mediaDevices.getUserMedia(...)  // NOT in this story

// ❌ Do NOT create new glass CSS classes
.glass-camera-button { backdrop-filter: blur(20px); ... }  // WRONG — use .glass-fab

// ✅ Use existing CSS classes from globals.css
className="glass-fab rounded-[var(--radius-full)]"

// ❌ Do NOT use router.push() for the Search CTA
<button onClick={() => router.push('/search')}>Search for a dish</button>

// ✅ Use next/link for navigation CTAs
<Link href="/search">Search for a dish</Link>
```

### File Locations (Architecture Spec)

Per `_bmad-output/planning-artifacts/architecture.md`:
```
src/
  app/
    page.tsx              ← Home tab (REPLACE boilerplate)
    template.tsx          ← NEW — tab crossfade animation
    search/
      page.tsx            ← NEW — Search tab placeholder
    grocery/
      page.tsx            ← NEW — Grocery tab placeholder
    layout.tsx            ← MODIFY — add AppShell + Toaster
  components/
    layout/
      app-shell.tsx       ← NEW — tab routing + camera modal state
      camera-fab.tsx      ← NEW — 56pt glass FAB
      glass-tab-bar.tsx   ← EXISTING — do not modify (icons fine as-is)
    scan/
      camera-modal.tsx    ← NEW — placeholder only, no camera API
```

**Note on icons**: `glass-tab-bar.tsx` has a comment "Placeholder icons — replaced with proper icon library in Story 1.4". For this MVP story, the existing inline SVG icons are fully functional. Only swap them if a specific icon library (e.g., `lucide-react`) is already installed — do NOT add a new dependency just for icons.

### Previous Story Intelligence (Story 1.3)

From Story 1.3 completion notes:
- `framer-motion` is already in use — `useReducedMotion()`, `AnimatePresence`, `motion.div` — follow same import patterns
- `providers.tsx` has `QueryClient` with `staleTime: 5 minutes` — do NOT change this
- `layout.tsx` structure is established — `AtmosphericBackground` must remain outside `#main-content`
- A pre-existing TypeScript error in `bottom-sheet.tsx` (framer-motion ease type) exists — do not introduce new TS errors; if you see it, leave it alone (Story 1.2 issue, not this story's scope)
- All 48 tests were passing after Story 1.3 — do NOT regress them

### Test Approach

Use Vitest + Testing Library. Follow patterns from `glass-card.test.tsx` and `glass-tab-bar.test.tsx`. Key mocks needed:
- `next/navigation`: mock `usePathname`, `useRouter`
- `framer-motion`: testing environment handles this via Vitest config in `vitest.config.ts`

```tsx
// AppShell test setup
import { vi } from 'vitest'

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
  useRouter: vi.fn(() => ({ push: vi.fn() })),
}))
```

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

No blockers. All tasks implemented cleanly in a single session.

### Completion Notes List

- Implemented all 9 tasks to spec with zero deviations from the story
- AppShell derives active tab from `usePathname()` — URL is source of truth (not React state)
- `template.tsx` uses 200ms ease crossfade (NOT spring) as specified for tab transitions
- `CameraModal` is a pure placeholder — no camera APIs imported (Story 2.2 scope)
- `Toaster` placed outside `#main-content` to avoid CSS transform fixed positioning bug
- All 62 tests pass (11 from prior stories + 12 new tests added)
- No lint errors in any new or modified files

### File List

- `src/components/layout/app-shell.tsx` — NEW
- `src/components/layout/camera-fab.tsx` — NEW
- `src/components/layout/app-shell.test.tsx` — NEW
- `src/components/layout/camera-fab.test.tsx` — NEW
- `src/components/scan/camera-modal.tsx` — NEW
- `src/app/template.tsx` — NEW
- `src/app/page.tsx` — REPLACED (boilerplate → home empty state)
- `src/app/search/page.tsx` — NEW
- `src/app/grocery/page.tsx` — NEW
- `src/app/layout.tsx` — MODIFIED (added AppShell + Toaster)

### Change Log

- 2026-03-20: Implemented Story 1.4 — App Shell & Home Empty State. Added AppShell with tab routing, CameraFab, CameraModal placeholder, template.tsx crossfade, home empty state, search/grocery placeholders, and updated layout.tsx with AppShell + Toaster.
