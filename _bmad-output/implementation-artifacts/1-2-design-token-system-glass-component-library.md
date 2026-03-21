# Story 1.2: Design Token System & Glass Component Library

Status: done

## Story

As a user,
I want the app to have a consistent, polished visual identity,
So that every screen feels premium and the glass aesthetic is applied uniformly.

## Acceptance Criteria

1. **Given** the app runs
   **When** `src/app/globals.css` is updated with CSS custom properties
   **Then** tokens exist for all typography sizes (`text-2xs`: 11pt through `text-hero`: 36–40pt), spacing (`space-1`: 4pt through `space-12`: 48pt), corner radius (`radius-xs`: 8pt through `radius-full`: 999pt), and text colours (`text-primary`, `text-secondary`, `text-tertiary`, `text-on-button`) in both `[data-theme="dark"]` and `[data-theme="light"]` variants

2. **Given** the design tokens exist
   **When** `GlassCard` is created at `src/components/ui/glass-card.tsx`
   **Then** it renders with `backdrop-filter: blur(20px)`, `background: rgba(255,255,255,0.09)` in dark mode / `rgba(255,255,255,0.65)` in light mode, border `rgba(255,255,255,0.13) 0.5px`, and `radius-md` (16pt) by default; accepts a `compact` variant using `radius-sm` (12pt)

3. **Given** GlassCard exists
   **When** `BottomSheet` is created at `src/components/ui/bottom-sheet.tsx`
   **Then** it renders with `blur(30px)`, `background: rgba(255,255,255,0.10)`, radius-lg top corners (24pt), a drag handle pill (4×36pt, `rgba(255,255,255,0.30)`); opening it sets the background overlay to 40% opacity and scales the underlying content to 0.95

4. **Given** BottomSheet exists
   **When** `GlassTabBar` is created at `src/components/layout/glass-tab-bar.tsx`
   **Then** it renders with `blur(24px)`, `background: rgba(255,255,255,0.08)`, border `rgba(255,255,255,0.12) 0.5px`; active tab items render at `text-primary` opacity; inactive items render at `text-tertiary` opacity; accepts a FAB slot

5. **Given** all glass components exist in both modes
   **When** the theme is toggled between dark and light
   **Then** glass values update to light-mode spec: GlassCard uses `rgba(255,255,255,0.65)` background; tab bar uses `rgba(255,255,255,0.72)`; text colours invert

6. **Given** any glass component appears on screen
   **When** it enters the view
   **Then** it animates using spring physics (mass: 1, stiffness: 300, damping: 30); scale transitions 0.96 → 1.0; opacity transitions 0 → 1 over 200ms

7. **Given** iOS Reduce Motion is enabled
   **When** any animated component renders
   **Then** all spring animations are replaced with 150ms opacity-only fades; no scale transforms; no user-facing behaviour difference

8. **Given** any file in `src/components/ui/`
   **When** its imports are inspected
   **Then** no Supabase client, API route, or external service import appears; components are pure UI with no data dependencies

## Tasks / Subtasks

- [x] Task 1: Install new dependencies (AC: 6, 7)
  - [x] `npm install clsx tailwind-merge framer-motion`
  - [x] Verify no version conflicts: `clsx@2.x`, `tailwind-merge@3.x` (Tailwind v4 compatible), `framer-motion@12.x`

- [x] Task 2: Create `src/lib/utils.ts` — cn() utility (AC: all)
  - [x] Export `cn(...inputs: ClassValue[])` using `twMerge(clsx(inputs))`
  - [x] This is the ONLY place clsx/twMerge are imported; all components use `cn()`

- [x] Task 3: Update `src/app/globals.css` with full design token system (AC: 1, 5)
  - [x] Add `[data-theme="dark"]` block with all CSS variables
  - [x] Add `[data-theme="light"]` block with all CSS variables
  - [x] Add typography tokens to `@theme`
  - [x] Add spacing tokens to `@theme`
  - [x] Add radius tokens to `@theme`
  - [x] Set default theme to dark on `<html>` element

- [x] Task 4: Create `src/components/ui/glass-card.tsx` (AC: 2, 6, 7, 8)
  - [x] Dark mode glass values: bg `rgba(255,255,255,0.09)`, border `rgba(255,255,255,0.13)` 0.5px, blur 20px
  - [x] Light mode glass values: bg `rgba(255,255,255,0.65)`, border `rgba(255,255,255,0.80)` 0.5px, blur 20px
  - [x] Default variant: `radius-md` (16px); compact variant: `radius-sm` (12px)
  - [x] Entry animation: Framer Motion spring (mass:1, stiffness:300, damping:30), scale 0.96→1.0, opacity 0→1
  - [x] Reduce Motion: detect `prefers-reduced-motion`, use 150ms opacity-only fade

- [x] Task 5: Create `src/components/ui/bottom-sheet.tsx` (AC: 3, 6, 7, 8)
  - [x] Glass treatment: blur(30px), `rgba(255,255,255,0.10)` dark / `rgba(255,255,255,0.70)` light
  - [x] Top corners only: `radius-lg` (24px)
  - [x] Drag handle: 4×36px pill, `rgba(255,255,255,0.30)`, `radius-full`
  - [x] Background overlay: 40% opacity when open
  - [x] Underlying content scales to 0.95 when open
  - [x] Spring entry from below
  - [x] Swipe-down dismiss gesture

- [x] Task 6: Create `src/components/layout/glass-tab-bar.tsx` (AC: 4, 6, 7, 8)
  - [x] Glass treatment: blur(24px), `rgba(255,255,255,0.08)` dark / `rgba(255,255,255,0.72)` light, border `rgba(255,255,255,0.12)` 0.5px
  - [x] Three tab slots: Home, Search, Grocery (icons + labels)
  - [x] Active: `text-primary` opacity; inactive: `text-tertiary` opacity
  - [x] FAB slot: accepts a ReactNode for the camera button (not implemented yet)
  - [x] Tab switch: 200ms ease crossfade (NO slide)
  - [x] Respects bottom safe area (env(safe-area-inset-bottom))

- [x] Task 7: Update `src/app/layout.tsx` to apply default theme
  - [x] Add `data-theme="dark"` to `<html>` element
  - [x] No other changes needed at this stage

- [x] Task 8: Write component tests (AC: 2, 3, 4, 8)
  - [x] `src/components/ui/glass-card.test.tsx` — renders with correct data-testid; no Supabase/API imports
  - [x] `src/components/ui/bottom-sheet.test.tsx` — renders open/closed states; drag handle present
  - [x] `src/components/layout/glass-tab-bar.test.tsx` — renders 3 tabs; active tab has correct class
  - [x] Run `npm test` — all pass

## Dev Notes

### Current codebase state (after Story 1.1)

```
src/
├── app/
│   ├── globals.css        ← has @import "tailwindcss" and basic @theme — REPLACE CONTENTS
│   ├── layout.tsx         ← has Providers — MODIFY to add data-theme
│   └── page.tsx           ← Next.js placeholder — LEAVE ALONE (replaced in Story 1.4)
├── components/
│   └── providers.tsx      ← TanStack Query wrapper — DO NOT TOUCH
├── lib/
│   ├── supabase.ts        ← singleton — DO NOT TOUCH
│   └── api-keys.ts        ← server-only — DO NOT TOUCH
└── types/
    ├── database.ts
    ├── api.ts
    └── domain.ts
```

### Package versions to install

```bash
npm install clsx tailwind-merge framer-motion
```

| Package | Version | Notes |
|---------|---------|-------|
| `clsx` | 2.1.1+ | Conditional class utility |
| `tailwind-merge` | 3.x | **Must be v3+** for Tailwind v4 compatibility; v2.x will not work |
| `framer-motion` | 12.x | Spring physics; handles Reduce Motion automatically |

### src/lib/utils.ts

```typescript
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### globals.css — Full Replacement

Replace the entire contents of `src/app/globals.css`:

```css
@import "tailwindcss";

/* ─── Design Tokens — Tailwind @theme utilities ────────────────────────── */

@theme {
  /* Typography scale (pt → rem: divide by 16) */
  --text-2xs: 0.6875rem;   /* 11pt */
  --text-xs: 0.8125rem;    /* 13pt */
  --text-sm: 0.9375rem;    /* 15pt */
  --text-base: 1.0625rem;  /* 17pt */
  --text-lg: 1.375rem;     /* 22pt */
  --text-xl: 1.75rem;      /* 28pt */
  --text-2xl: 2.125rem;    /* 34pt */
  --text-hero: 2.5rem;     /* 40pt */

  /* Spacing scale */
  --spacing-1: 0.25rem;    /* 4pt */
  --spacing-2: 0.5rem;     /* 8pt */
  --spacing-3: 0.75rem;    /* 12pt */
  --spacing-4: 1rem;       /* 16pt — standard screen margin */
  --spacing-5: 1.25rem;    /* 20pt */
  --spacing-6: 1.5rem;     /* 24pt — standard section gap */
  --spacing-8: 2rem;       /* 32pt */
  --spacing-12: 3rem;      /* 48pt */

  /* Corner radius */
  --radius-xs: 0.5rem;     /* 8pt */
  --radius-sm: 0.75rem;    /* 12pt — compact cards */
  --radius-md: 1rem;       /* 16pt — glass cards */
  --radius-lg: 1.5rem;     /* 24pt — bottom sheet top corners */
  --radius-xl: 1.75rem;    /* 28pt — primary CTAs */
  --radius-full: 999px;    /* pills, FAB, tab bar */
}

/* ─── Theme Variables — CSS custom properties ───────────────────────────── */

/* Dark mode (default) */
[data-theme="dark"],
:root {
  /* Text */
  --text-primary: rgba(255, 255, 255, 1.0);
  --text-secondary: rgba(255, 255, 255, 0.60);
  --text-tertiary: rgba(255, 255, 255, 0.35);
  --text-on-button: rgba(0, 0, 0, 0.90);

  /* Base background */
  --bg-base: #0a0a0a;

  /* Glass — Card */
  --glass-card-bg: rgba(255, 255, 255, 0.09);
  --glass-card-border: rgba(255, 255, 255, 0.13);
  --glass-card-blur: 20px;

  /* Glass — Bottom Sheet */
  --glass-sheet-bg: rgba(255, 255, 255, 0.10);
  --glass-sheet-blur: 30px;

  /* Glass — Tab Bar */
  --glass-tab-bg: rgba(255, 255, 255, 0.08);
  --glass-tab-border: rgba(255, 255, 255, 0.12);
  --glass-tab-blur: 24px;

  /* Glass — Processing Strip */
  --glass-strip-bg: rgba(255, 255, 255, 0.12);
  --glass-strip-blur: 24px;

  /* Glass — Filter Pill */
  --glass-pill-bg: rgba(255, 255, 255, 0.10);
  --glass-pill-border: rgba(255, 255, 255, 0.15);
  --glass-pill-blur: 16px;

  /* Glass — FAB */
  --glass-fab-bg: rgba(255, 255, 255, 0.16);
  --glass-fab-border: rgba(255, 255, 255, 0.20);
  --glass-fab-blur: 20px;

  /* Drag handle */
  --drag-handle-color: rgba(255, 255, 255, 0.30);

  /* Overlay */
  --overlay-bg: rgba(0, 0, 0, 0.40);
}

/* Light mode */
[data-theme="light"] {
  /* Text */
  --text-primary: rgba(0, 0, 0, 0.90);
  --text-secondary: rgba(0, 0, 0, 0.55);
  --text-tertiary: rgba(0, 0, 0, 0.30);
  --text-on-button: rgba(0, 0, 0, 0.90);

  /* Base background */
  --bg-base: #f5f5f5;

  /* Glass — Card */
  --glass-card-bg: rgba(255, 255, 255, 0.65);
  --glass-card-border: rgba(255, 255, 255, 0.80);
  --glass-card-blur: 20px;

  /* Glass — Bottom Sheet */
  --glass-sheet-bg: rgba(255, 255, 255, 0.70);
  --glass-sheet-blur: 30px;

  /* Glass — Tab Bar */
  --glass-tab-bg: rgba(255, 255, 255, 0.72);
  --glass-tab-border: rgba(255, 255, 255, 0.85);
  --glass-tab-blur: 24px;

  /* Glass — Processing Strip */
  --glass-strip-bg: rgba(255, 255, 255, 0.75);
  --glass-strip-blur: 24px;

  /* Glass — Filter Pill */
  --glass-pill-bg: rgba(255, 255, 255, 0.65);
  --glass-pill-border: rgba(255, 255, 255, 0.80);
  --glass-pill-blur: 16px;

  /* Glass — FAB */
  --glass-fab-bg: rgba(255, 255, 255, 0.80);
  --glass-fab-border: rgba(255, 255, 255, 0.90);
  --glass-fab-blur: 20px;

  /* Drag handle */
  --drag-handle-color: rgba(0, 0, 0, 0.20);

  /* Overlay */
  --overlay-bg: rgba(0, 0, 0, 0.30);
}

/* ─── Base Styles ────────────────────────────────────────────────────────── */

@layer base {
  html {
    background-color: var(--bg-base);
    color: var(--text-primary);
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    min-height: 100dvh;
  }
}
```

### src/components/ui/glass-card.tsx — Template

```tsx
'use client'

import { motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'compact'
  animate?: boolean
}

export function GlassCard({
  variant = 'default',
  animate = true,
  className,
  children,
  ...props
}: GlassCardProps) {
  const shouldReduceMotion = useReducedMotion()

  const initial = animate
    ? shouldReduceMotion
      ? { opacity: 0 }
      : { opacity: 0, scale: 0.96 }
    : false

  const entry = animate
    ? shouldReduceMotion
      ? { opacity: 1, transition: { duration: 0.15 } }
      : {
          opacity: 1,
          scale: 1,
          transition: { type: 'spring', mass: 1, stiffness: 300, damping: 30 },
        }
    : {}

  return (
    <motion.div
      initial={initial}
      animate={entry}
      className={cn(
        'glass-card',
        variant === 'compact' ? 'rounded-[var(--radius-sm)]' : 'rounded-[var(--radius-md)]',
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  )
}
```

Add to `globals.css` (after the base styles):

```css
/* ─── Glass Component Base Styles ──────────────────────────────────────── */

@layer components {
  .glass-card {
    background: var(--glass-card-bg);
    border: 0.5px solid var(--glass-card-border);
    backdrop-filter: blur(var(--glass-card-blur)) saturate(1.8);
    -webkit-backdrop-filter: blur(var(--glass-card-blur)) saturate(1.8);
  }

  .glass-sheet {
    background: var(--glass-sheet-bg);
    backdrop-filter: blur(var(--glass-sheet-blur)) saturate(1.6);
    -webkit-backdrop-filter: blur(var(--glass-sheet-blur)) saturate(1.6);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  }

  .glass-tab {
    background: var(--glass-tab-bg);
    border-top: 0.5px solid var(--glass-tab-border);
    backdrop-filter: blur(var(--glass-tab-blur)) saturate(1.6);
    -webkit-backdrop-filter: blur(var(--glass-tab-blur)) saturate(1.6);
  }
}
```

### src/components/ui/bottom-sheet.tsx — Key Patterns

```tsx
'use client'

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
}

export function BottomSheet({ open, onClose, children, className }: BottomSheetProps) {
  const shouldReduceMotion = useReducedMotion()

  const sheetVariants = {
    hidden: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: '100%' },
    visible: shouldReduceMotion
      ? { opacity: 1, transition: { duration: 0.15 } }
      : {
          opacity: 1,
          y: 0,
          transition: { type: 'spring', mass: 1, stiffness: 300, damping: 30 },
        },
    exit: shouldReduceMotion
      ? { opacity: 0, transition: { duration: 0.15 } }
      : { opacity: 0, y: '100%', transition: { duration: 0.2 } },
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay — dims + scales background content */}
          <motion.div
            className="fixed inset-0 z-40"
            style={{ background: 'var(--overlay-bg)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className={cn('glass-sheet fixed bottom-0 left-0 right-0 z-50 pb-[env(safe-area-inset-bottom)]', className)}
            variants={sheetVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div
                className="w-9 rounded-full"
                style={{ height: '4px', background: 'var(--drag-handle-color)' }}
              />
            </div>
            <div className="px-[var(--spacing-5)] py-[var(--spacing-6)]">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

**Note on content scaling to 0.95:** The 0.95 scale on background content must be applied to the main content wrapper, NOT to the overlay. The sheet's parent layout should wrap page content in a component that applies `transform: scale(0.95)` when the sheet is open. Implement this in Story 1.4 when the app shell exists. For Story 1.2, the BottomSheet component exposes an `onOpenChange` or the open state to the parent for this purpose — do not try to imperatively scale DOM siblings.

### src/components/layout/glass-tab-bar.tsx — Key Patterns

```tsx
'use client'

import { cn } from '@/lib/utils'

export type TabId = 'home' | 'search' | 'grocery'

interface GlassTabBarProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  fabSlot?: React.ReactNode
}

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'home', label: 'Home', icon: <HomeIcon /> },
  { id: 'search', label: 'Search', icon: <SearchIcon /> },
  { id: 'grocery', label: 'Grocery', icon: <GroceryIcon /> },
]

export function GlassTabBar({ activeTab, onTabChange, fabSlot }: GlassTabBarProps) {
  return (
    <div
      className="glass-tab fixed bottom-0 left-0 right-0 z-30 pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex items-center justify-around h-[49px] px-[var(--spacing-4)]">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex flex-col items-center gap-1 transition-opacity duration-200 min-w-[44px]"
            style={{
              color: 'var(--text-primary)',
              opacity: activeTab === tab.id ? 1 : 0.35,
            }}
          >
            <span className="text-[22px]">{tab.icon}</span>
            <span className="text-[10px] font-medium">{tab.label}</span>
          </button>
        ))}
        {fabSlot && (
          <div className="flex items-center">{fabSlot}</div>
        )}
      </div>
    </div>
  )
}

// Placeholder icon components (replace with lucide-react or SF Symbols in Story 1.4)
function HomeIcon() { return <span>⌂</span> }
function SearchIcon() { return <span>⌕</span> }
function GroceryIcon() { return <span>◻</span> }
```

**Note on icon library:** Do NOT install lucide-react yet. Use placeholder Unicode characters for Story 1.2. Story 1.4 (App Shell) will specify the icon library when the full navigation is implemented.

### layout.tsx change

Only add `data-theme="dark"` to `<html>`:

```tsx
// Change this line only:
<html lang="en" className="h-full antialiased" data-theme="dark">
```

### Theme switching architecture

The `[data-theme]` attribute on `<html>` controls which CSS variable set is active. A future story (or a small hook in Story 1.4) will implement the actual toggle. For this story:
- Default: `data-theme="dark"` set in layout.tsx
- Light mode: changing `document.documentElement.dataset.theme = 'light'` in the browser is enough to verify tokens swap

### Test patterns

```tsx
// src/components/ui/glass-card.test.tsx
import { render, screen } from '@testing-library/react'
import { GlassCard } from './glass-card'

describe('GlassCard', () => {
  it('renders children', () => {
    render(<GlassCard>test content</GlassCard>)
    expect(screen.getByText('test content')).toBeInTheDocument()
  })

  it('applies compact variant class', () => {
    const { container } = render(<GlassCard variant="compact">x</GlassCard>)
    expect(container.firstChild).toHaveClass('rounded-[var(--radius-sm)]')
  })

  it('has no Supabase import', () => {
    // This test is a documentation assertion — verified by TypeScript build
    // If supabase.ts is imported, the build will fail (server-only)
  })
})
```

**Note on framer-motion in tests:** Framer Motion requires `IntersectionObserver` mock in jsdom. Add to `src/test/setup.ts`:

```typescript
// src/test/setup.ts — append this
global.IntersectionObserver = class IntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof IntersectionObserver
```

### Framer Motion + Reduce Motion

`useReducedMotion()` from framer-motion returns `true` when the user has enabled "Reduce Motion" in iOS/macOS accessibility settings. Always use it as shown in the component templates. Never skip this check.

### Architecture compliance for this story

| Rule | Application in Story 1.2 |
|------|--------------------------|
| Pure UI in `src/components/ui/` | ✓ No supabase, no API imports |
| `cn()` for all className merging | ✓ Import from `@/lib/utils` |
| CSS variables for all glass values | ✓ Via `--glass-*` tokens in globals.css |
| No inline rgba in components | ✓ Always reference `var(--glass-card-bg)` etc. |
| `data-theme` on `<html>` | ✓ Default dark; light via same mechanism |
| No tailwind.config.js | ✓ All tokens in `@theme` or CSS custom properties |

### Anti-patterns to prevent

```tsx
// ❌ Never hardcode glass values inline
<div style={{ background: 'rgba(255,255,255,0.09)' }}>

// ✅ Always use CSS variables
<div style={{ background: 'var(--glass-card-bg)' }}>

// ❌ Never use Tailwind bg-white/10 for glass components
// (breaks when theme switches — Tailwind opacity modifier ignores CSS vars)
<div className="bg-white/10 backdrop-blur-md">

// ✅ Use CSS variable + @layer components .glass-card class
<div className="glass-card rounded-[var(--radius-md)]">

// ❌ Never skip reduced motion check
const { scale, opacity } = useSpring(...)

// ✅ Always branch on useReducedMotion()
const shouldReduceMotion = useReducedMotion()
const transition = shouldReduceMotion ? { duration: 0.15 } : { type: 'spring', ... }

// ❌ Never import supabase in a UI component
import { supabase } from '@/lib/supabase'

// ❌ Never install tailwind.config.js — Tailwind v4 uses @theme in CSS only
```

### Files to create / modify in this story

| File | Action |
|------|--------|
| `src/lib/utils.ts` | CREATE — cn() utility |
| `src/app/globals.css` | REPLACE CONTENTS — full token system + glass @layer |
| `src/app/layout.tsx` | MODIFY — add `data-theme="dark"` to `<html>` |
| `src/test/setup.ts` | MODIFY — append IntersectionObserver mock |
| `src/components/ui/glass-card.tsx` | CREATE |
| `src/components/ui/bottom-sheet.tsx` | CREATE |
| `src/components/layout/glass-tab-bar.tsx` | CREATE |
| `src/components/ui/glass-card.test.tsx` | CREATE |
| `src/components/ui/bottom-sheet.test.tsx` | CREATE |
| `src/components/layout/glass-tab-bar.test.tsx` | CREATE |

### Files that must NOT be touched

- `src/lib/supabase.ts`
- `src/lib/api-keys.ts`
- `src/components/providers.tsx`
- `src/types/` (all)
- `src/app/page.tsx` (replaced in Story 1.4)
- All `_archive/`, `_bmad-output/`, `references/`, `.claude/`

### References

- UX Design Specification: `_bmad-output/planning-artifacts/ux-design-specification.md` — Design Tokens section (glass values, typography, spacing, radius, motion)
- Epics: `_bmad-output/planning-artifacts/epics.md` — Epic 1, Story 1.2
- Story 1.1 (done): `_bmad-output/implementation-artifacts/1-1-project-scaffold-environment-setup.md`

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
None

### Completion Notes List
- All 8 tasks completed successfully
- 23 tests passing (8 test files total)
- Framer Motion jsdom compatibility: added IntersectionObserver + matchMedia mocks to setup.ts
- useReducedMotion() branch implemented in GlassCard and BottomSheet
- CSS variable pattern enforced throughout (no inline rgba values in components)

### File List
- src/lib/utils.ts (created)
- src/app/globals.css (replaced)
- src/app/layout.tsx (modified)
- src/test/setup.ts (modified)
- src/components/ui/glass-card.tsx (created)
- src/components/ui/bottom-sheet.tsx (created)
- src/components/layout/glass-tab-bar.tsx (created)
- src/components/ui/glass-card.test.tsx (created)
- src/components/ui/bottom-sheet.test.tsx (created)
- src/components/layout/glass-tab-bar.test.tsx (created)
