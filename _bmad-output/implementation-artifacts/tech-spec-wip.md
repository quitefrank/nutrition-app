---
title: 'Story 1.2 Fix Pass — Intent Gaps & Blocking Patches'
slug: 'story-1-2-fix-pass'
created: '2026-03-20'
status: 'completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Next.js 16', 'React 19', 'TypeScript', 'framer-motion 12', 'Tailwind CSS 4', 'Vitest']
files_to_modify:
  - 'src/app/globals.css'
  - 'src/app/layout.tsx'
  - 'src/components/ui/bottom-sheet.tsx'
  - 'src/components/ui/bottom-sheet.test.tsx'
  - 'src/components/layout/glass-tab-bar.tsx'
  - 'src/components/layout/glass-tab-bar.test.tsx'
  - '_bmad-output/planning-artifacts/epics.md'
code_patterns: ['framer-motion useDragControls', 'useReducedMotion', 'focus-trap-react', 'CSS data-attribute toggle']
test_patterns: ['Testing Library fireEvent.keyDown', 'userEvent.tab focus sequence']
---

# Tech-Spec: Story 1.2 Fix Pass — Intent Gaps & Blocking Patches

**Created:** 2026-03-20

## Overview

### Problem Statement

Story 1.2 (Design Token System & Glass Component Library) produced working components but left three intent gaps unresolved and eight blocking patches unimplemented. The intent gaps create ambiguity that will affect Stories 1.3 and 1.4 design decisions. The patches prevent the story from reaching "done".

### Solution

Resolve all three intent gaps with definitive decisions, implement the blocking patches (P-1 through P-8), and amend the epics doc AC1 wording. No new features — this is a targeted fix pass scoped entirely to existing Story 1.2 components.

### Scope

**In Scope:**
- **IG-1**: Add `label` prop to `BottomSheet` → sets `aria-label` on the dialog element
- **IG-3**: Implement drag-to-dismiss gesture via framer-motion `useDragControls` (functional, initiated from drag handle only)
- **IG-4a**: Add `prefers-color-scheme` support in `globals.css` as the system-level default; `data-theme` attribute on `<html>` overrides it; remove hardcoded `data-theme="dark"` from `layout.tsx`
- **IG-4b**: Fix inactive tab colour — replace hardcoded `opacity: 0.35` with `color: var(--text-tertiary)` in `GlassTabBar`
- **P-1**: Add Escape key handler to `BottomSheet`
- **P-2/P-3**: Add focus trap + focus restore via `focus-trap-react`
- **P-4**: Scale main content to `0.95` when `BottomSheet` is open (CSS + `data-sheet-open` body attribute)
- **P-5**: Condition overlay animation on `shouldReduceMotion`
- **P-8**: Add spring entry animation to `GlassTabBar`
- **Epics doc amendment**: Fix AC1 token prefix `space-*` → `spacing-*`; clarify `text-hero` as `40pt fixed`

**Out of Scope:**
- P-6, P-10–P-14 (low-priority cleanup — separate pass)
- Story 1.3 atmospheric background
- Icon library (Story 1.4)
- Theme toggle UI (no user-facing theme switcher in this story)

---

## Context for Development

### Resolved Intent Gap Decisions

| Gap | Decision |
|-----|----------|
| **IG-1 — Dialog label** | Add `label?: string` prop to `BottomSheet`. Rendered as `aria-label` on the `role="dialog"` div. Default: `'Sheet'`. Callers should always pass a meaningful label (e.g. `"Dish detail"`, `"Filters"`). No visible UI change. |
| **IG-3 — Drag gesture** | Drag-to-dismiss is **functional** in this fix pass. Use framer-motion `useDragControls`. Drag initiates from the drag handle div only (`onPointerDown={dragControls.start}`). The sheet div has `dragListener={false}` so scrollable content inside the sheet is unaffected. Dismiss threshold: `velocity.y > 500` OR `offset.y > 150`. Respects `shouldReduceMotion` — when enabled, drag-to-dismiss is **disabled** (tap overlay or Escape only). |
| **IG-4 — Theme detection** | `prefers-color-scheme` determines the initial theme. No `data-theme` on `<html>` at startup. If user explicitly sets a preference later (future feature), `data-theme` attribute on `<html>` overrides system. Implementation: add `@media (prefers-color-scheme: light) { :root { ... } }` block in `globals.css`. Remove `data-theme="dark"` from `layout.tsx`. The existing `[data-theme="dark"]` and `[data-theme="light"]` selectors remain as overrides. |

### Codebase Patterns

- **Animation pattern**: `useReducedMotion()` from framer-motion; reduced = `{ opacity: 0→1, 150ms }`, full = spring `{ mass:1, stiffness:300, damping:30 }`. See `GlassCard` for the canonical pattern.
- **CSS token access**: All design tokens are CSS custom properties (`--spacing-*`, `--radius-*`, `--text-*`, `--glass-*`). Use `var()` references. Never hardcode values that have tokens.
- **Component entry animation**: `GlassCard` at [src/components/ui/glass-card.tsx](src/components/ui/glass-card.tsx) is the reference for spring entry: `initial={{ opacity: 0, scale: 0.96 }}` → `animate={{ opacity: 1, scale: 1 }}`.
- **BottomSheet overlay**: `--overlay-bg` token is used for the overlay background (`rgba(0,0,0,0.40)` dark / `rgba(0,0,0,0.30)` light). Already implemented.
- **`focus-trap-react`**: Not installed. Must be added: `npm install focus-trap-react`. Wrap the sheet content div (inside the motion div, after the drag handle) with `<FocusTrap active={open}>`.

### Files to Reference

| File | Purpose |
|------|---------|
| [src/app/globals.css](src/app/globals.css) | All tokens + theme vars — add `prefers-color-scheme` block here |
| [src/app/layout.tsx](src/app/layout.tsx) | Remove `data-theme="dark"` from `<html>`; add `id="main-content"` wrapper |
| [src/components/ui/bottom-sheet.tsx](src/components/ui/bottom-sheet.tsx) | All IG-1, IG-3, P-1, P-2/P-3, P-4, P-5 patches live here |
| [src/components/ui/bottom-sheet.test.tsx](src/components/ui/bottom-sheet.test.tsx) | Existing tests pass — add new tests for Escape, label, drag |
| [src/components/layout/glass-tab-bar.tsx](src/components/layout/glass-tab-bar.tsx) | P-7 (text-tertiary token), P-8 (spring entry animation) |
| [src/components/layout/glass-tab-bar.test.tsx](src/components/layout/glass-tab-bar.test.tsx) | Add animation smoke test |
| [src/components/ui/glass-card.tsx](src/components/ui/glass-card.tsx) | Reference for spring animation pattern — do not modify |
| [_bmad-output/planning-artifacts/epics.md](../_bmad-output/planning-artifacts/epics.md) | Amend Story 1.2 AC1 token prefix and text-hero definition |

### Technical Decisions

**Background scale (P-4):**
`BottomSheet` sets `document.body.dataset.sheetOpen = 'true'` via `useEffect` when `open=true`, and deletes it when `open=false`. A new wrapper div added to `layout.tsx` with `id="main-content"` receives a CSS rule: `body[data-sheet-open] #main-content { transform: scale(0.95); transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1); }`. The tab bar is `z-30` (below the sheet at `z-50`) so it scales with the content naturally. The overlay is `z-40`, sheet `z-50`.

**Focus trap (P-2/P-3):**
Install `focus-trap-react`. Wrap the content area inside `BottomSheet` with `<FocusTrap active={open} focusTrapOptions={{ initialFocus: false, returnFocusOnDeactivate: true }}>`. `initialFocus: false` prevents auto-focusing the first element (the sheet springs up first; focus is set after animation settles). `returnFocusOnDeactivate: true` restores focus to the element that opened the sheet.

**Drag controls (IG-3):**
Use framer-motion `useDragControls()`. The drag handle div gets `onPointerDown={(e) => { if (!shouldReduceMotion) dragControls.start(e) }}`. The sheet motion div gets `drag="y" dragControls={dragControls} dragListener={false} dragConstraints={{ top: 0 }} dragElastic={{ top: 0, bottom: 0.25 }}`. `onDragEnd` dismisses when `info.velocity.y > 500 || info.offset.y > 150`.

**Inactive tab colour (P-7):**
Current: `color: var(--text-primary)` + `opacity: activeTab === tab.id ? 1 : 0.35`. Problem: `0.35` opacity on top of `--text-primary` (white) is not equivalent to `--text-tertiary` in light mode (`rgba(0,0,0,0.30)`). Fix: remove the outer `color` and `opacity` inline styles. Use `color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-tertiary)'` directly.

---

## Implementation Plan

### Tasks

Tasks ordered by dependency — lowest level first.

**[x] T1 — Install focus-trap-react**
- File: `package.json` (run `npm install focus-trap-react`)
- Action: Add `focus-trap-react` to `dependencies`. TypeScript types are bundled.

**[x] T2 — globals.css: Add prefers-color-scheme support**
- File: [src/app/globals.css](src/app/globals.css)
- Action: Add a `@media (prefers-color-scheme: light)` block immediately after the `[data-theme="dark"]` block, before the existing `[data-theme="light"]` block:
  ```css
  @media (prefers-color-scheme: light) {
    :root:not([data-theme="dark"]) {
      /* paste all vars from [data-theme="light"] block here */
    }
  }
  ```
  The `:not([data-theme="dark"])` guard ensures an explicit `data-theme="dark"` override always wins.

**[x] T3 — globals.css: Add background scale CSS rule**
- File: [src/app/globals.css](src/app/globals.css), append to `@layer base`:
  ```css
  #main-content {
    transform-origin: top center;
    transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);
  }
  body[data-sheet-open] #main-content {
    transform: scale(0.95);
  }
  ```

**[x] T4 — layout.tsx: Remove hardcoded data-theme; add main-content wrapper**
- File: [src/app/layout.tsx](src/app/layout.tsx)
- Action 1: Remove `data-theme="dark"` from `<html>` element (system preference now governs default)
- Action 2: Wrap `<Providers>{children}</Providers>` in a new div:
  ```tsx
  <div id="main-content" className="flex flex-col flex-1 min-h-full">
    <Providers>{children}</Providers>
  </div>
  ```

**[x] T5 — bottom-sheet.tsx: All patches**
- File: [src/components/ui/bottom-sheet.tsx](src/components/ui/bottom-sheet.tsx)
- Action 1 (IG-1): Add `label?: string` to `BottomSheetProps`. Default `'Sheet'`. Apply as `aria-label={label ?? 'Sheet'}` on the dialog div.
- Action 2 (P-1 Escape): Add `useEffect` — attach `keydown` listener on `document` when `open=true`; call `onClose()` on `Escape`.
- Action 3 (P-4 body attr): Add `useEffect` — set `document.body.dataset.sheetOpen = 'true'` when `open=true`; delete `document.body.dataset.sheetOpen` on cleanup.
- Action 4 (P-5 overlay reduced motion): Change overlay `transition` to `shouldReduceMotion ? { duration: 0.15 } : { duration: 0.2 }`.
- Action 5 (IG-3 drag): Import `useDragControls`. Initialize `const dragControls = useDragControls()`. Add `drag="y" dragControls={dragControls} dragListener={false} dragConstraints={{ top: 0 }} dragElastic={{ top: 0, bottom: 0.25 }} onDragEnd` to the sheet motion div. On handle div: `onPointerDown={(e) => { if (!shouldReduceMotion) dragControls.start(e) }}`.
- Action 6 (P-2/P-3 focus trap): Import `FocusTrap` from `focus-trap-react`. Wrap the content `<div className="px-...">` (not the drag handle) with `<FocusTrap active={open} focusTrapOptions={{ initialFocus: false, returnFocusOnDeactivate: true }}>`.

**[x] T6 — glass-tab-bar.tsx: P-7 inactive colour + P-8 spring entry**
- File: [src/components/layout/glass-tab-bar.tsx](src/components/layout/glass-tab-bar.tsx)
- Action 1 (P-7): On the tab `<button>`, replace:
  ```tsx
  style={{ color: 'var(--text-primary)', opacity: activeTab === tab.id ? 1 : 0.35 }}
  ```
  with:
  ```tsx
  style={{ color: activeTab === tab.id ? 'var(--text-primary)' : 'var(--text-tertiary)' }}
  ```
  Also remove `transition-opacity` and `duration-200` from className (transition is now handled by framer-motion or CSS on color change).
- Action 2 (P-8): Convert `<nav>` to `<motion.nav>`. Add spring entry animation — same pattern as `GlassCard`: `initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', mass: 1, stiffness: 300, damping: 30 }}`. Wrap with `useReducedMotion()` guard: reduced motion uses `initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}`.

**[x] T7 — Update tests: bottom-sheet.test.tsx**
- File: [src/components/ui/bottom-sheet.test.tsx](src/components/ui/bottom-sheet.test.tsx)
- Add test: `aria-label` is set from `label` prop
- Add test: `aria-label` defaults to `'Sheet'` when no label prop
- Add test: `onClose` is called when Escape key is pressed while sheet is open
- Add test: Escape key does NOT call `onClose` when sheet is closed
- Add test: `document.body.dataset.sheetOpen` is `'true'` when open, removed when closed

**[x] T8 — Update tests: glass-tab-bar.test.tsx**
- File: [src/components/layout/glass-tab-bar.test.tsx](src/components/layout/glass-tab-bar.test.tsx)
- Add test: inactive tab renders with `color` style using `--text-tertiary` token (not `opacity: 0.35`)
- Add test: active tab renders with `color` style using `--text-primary` token

**[x] T9 — Amend epics.md AC1**
- File: [_bmad-output/planning-artifacts/epics.md](../_bmad-output/planning-artifacts/epics.md)
- Find Story 1.2 AC1 — change `space-1: 4pt through space-12: 48pt` → `spacing-1: 4pt through spacing-12: 48pt`
- Change `text-hero: 36–40pt` → `text-hero: 40pt (fixed)`

### Acceptance Criteria

**AC-IG1 — BottomSheet accessible name**
Given `<BottomSheet open={true} label="Dish detail" onClose={fn}>` is rendered
When the DOM is inspected
Then `role="dialog"` element has `aria-label="Dish detail"`

Given `<BottomSheet open={true} onClose={fn}>` is rendered (no label prop)
When the DOM is inspected
Then `role="dialog"` element has `aria-label="Sheet"` (default)

**AC-IG3 — Drag-to-dismiss**
Given BottomSheet is open and `shouldReduceMotion` is false
When the drag handle is dragged down past 150px or released with velocity > 500
Then `onClose` is called

Given BottomSheet is open and `shouldReduceMotion` is true
When the drag handle is touched/dragged
Then no drag gesture initiates (dragControls not started)

**AC-IG4a — Theme detection**
Given `layout.tsx` has no `data-theme` attribute on `<html>`
When the system is set to light mode (`prefers-color-scheme: light`)
Then `:root` variables resolve to the light-mode values

Given `data-theme="dark"` is set on `<html>`
When system preference is light
Then dark-mode variables apply (explicit attribute overrides media query)

**AC-IG4b — Inactive tab colour**
Given `GlassTabBar` renders in light mode (dark `--text-primary`, light `--text-tertiary`)
When an inactive tab is inspected
Then its `color` is `var(--text-tertiary)` — not white-at-35%-opacity

**AC-P1 — Escape key**
Given BottomSheet is open
When the Escape key is pressed
Then `onClose` is called

**AC-P4 — Background scale**
Given BottomSheet is open
When `document.body.dataset.sheetOpen` is set
Then `#main-content` has `transform: scale(0.95)` applied via CSS

**AC-P5 — Overlay reduced motion**
Given `shouldReduceMotion` is true
When BottomSheet opens
Then overlay transition uses `duration: 0.15` (not `duration: 0.2`)

**AC-P8 — GlassTabBar spring entry**
Given the GlassTabBar mounts
When it enters the view
Then it animates from `opacity: 0, y: 20` to `opacity: 1, y: 0` using spring physics (or 150ms fade if `shouldReduceMotion`)

**AC-Amendment — Epics doc**
Given Story 1.2 AC1 in `epics.md`
When inspected
Then spacing tokens read `spacing-1` through `spacing-12` (not `space-*`)
Then `text-hero` reads `40pt (fixed)` (not `36–40pt`)

---

## Additional Context

### Dependencies

- `focus-trap-react` — new dependency, must be installed before T5
- All other dependencies already in `package.json` (`framer-motion`, `@testing-library/user-event` for Escape key tests)

### Testing Strategy

- All existing tests in `bottom-sheet.test.tsx` must continue to pass — new tests are additive
- Escape key test: use `@testing-library/user-event` `userEvent.keyboard('{Escape}')` or `fireEvent.keyDown(document, { key: 'Escape' })`
- Body attribute test: check `document.body.dataset.sheetOpen` before/after open toggle
- Tab colour test: read inline `style.color` from the button element and assert it references `--text-tertiary`
- Drag test: framer-motion drag in jsdom is hard to test — a smoke test asserting `dragControls` is hooked up (i.e. `dragListener={false}` and `onPointerDown` on the handle) is sufficient; full gesture testing is an E2E concern

## Review Notes

- Adversarial review completed: 13 findings
- Fixed (7): F1 cleanup logic, F2 focus ring CSS, F4 touch-action on drag handle, F5 restored data-theme default, F6/F8 Escape + escapeDeactivates, F8 tab color transition restored, F12 initialFocus for screen readers
- Skipped (6): F3 no fixed children yet (comment added), F7 FocusTrap deactivates correctly on open=false, F9 API design, F10 intentional drag UX, F11 pre-existing, F13 intentional animation
- Resolution: auto-fix

### Notes

- The `#main-content` scale does NOT affect the BottomSheet itself or the overlay (`z-40`/`z-50` and `position: fixed` take them out of the normal flow). The scale only affects `position: static/relative` content.
- `focus-trap-react` with `initialFocus: false` means focus does not jump to the first focusable element the moment the sheet opens — this is intentional to avoid jarring keyboard focus jump mid-animation. Focus becomes active once the user tabs.
- `data-theme="dark"` in `layout.tsx` is removed — the app will follow system preference by default going forward. If Frank wants to force dark mode temporarily during development, he can add it back manually or add a `?theme=dark` query param workaround (out of scope here).
- The drag handle CSS style (`background: var(--drag-handle-color)`) already uses a token and does not need to change.
