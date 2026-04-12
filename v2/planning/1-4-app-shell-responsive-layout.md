# Story 1.4: App Shell & Responsive Layout

Status: done

## Story

As a user,
I want the app to be contained in a centred single-column layout with correct iPhone safe-area handling,
So that it feels native on iPhone Safari and intentional on wider screens.

## Acceptance Criteria

1. Content constrained to max-width: 430px, centred, min-height: 100dvh, overflow-x: hidden
2. Safe-area insets respected via env(safe-area-inset-bottom) in nav bar and bottom content areas
3. At viewport narrower than 360px, grid collapses to single column
4. On tablet/desktop: atmospheric background fills full viewport; app column stays centred at 430px; no layout breaks

## Tasks / Subtasks

- [x] Task 1: Add .app-shell, .screen-content, .nav-bar-container CSS utility classes to globals.css
- [x] Task 2: Add @media (max-width: 359px) .collection-grid responsive rule
- [x] Task 3: Wrap children in layout.tsx with .app-shell div

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List

- All four CSS classes were absent from globals.css prior to this story; none needed updating.
- Added the "App shell & responsive layout" block to globals.css immediately after the :focus-visible section and before .scroll-content, consistent with the surrounding section-comment style.
- In layout.tsx, {children} is wrapped with <div className="app-shell"> inside the existing <Providers> wrapper. InstallPromptBanner is intentionally left outside the app-shell div because it is a full-viewport floating overlay (position: fixed) that should not be constrained to 430px.
- ServiceWorkerRegistrar sits outside Providers and is also left untouched (renders null, no layout impact).
- 5/5 new app-shell smoke tests pass; 21/21 design-tokens regression tests still pass.

### File List

- /Users/frank.milan/Claude/Personal/nutrition-app/v2/src/app/globals.css — added .app-shell, .screen-content, .nav-bar-container, and @media (max-width: 359px) .collection-grid block
- /Users/frank.milan/Claude/Personal/nutrition-app/v2/src/app/layout.tsx — wrapped {children} in <div className="app-shell">
- /Users/frank.milan/Claude/Personal/nutrition-app/v2/src/app/__tests__/app-shell.test.ts — new structural smoke test (5 assertions)
- /Users/frank.milan/Claude/Personal/nutrition-app/v2/planning/1-4-app-shell-responsive-layout.md — this story file
