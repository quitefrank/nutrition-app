# Story 1.5: Animation System & Reduced Motion

Status: review

## Story

As a user,
I want all transitions to feel physically natural, with the app automatically respecting my device motion preferences,
So that interactions feel alive without being distracting or inaccessible.

## Acceptance Criteria

1. **Given** `src/lib/springs.ts` exists **When** any animated component references it **Then** named presets `SPRING_CARD_EXPAND`, `SPRING_TAB_TRANSITION`, and `SPRING_MODAL_ENTER` are exported as Framer Motion spring config objects

2. **Given** `prefers-reduced-motion: reduce` is set on the device **When** any animated component renders **Then** the `useReducedMotion()` hook replaces all spring animations with 150ms opacity-only transitions; no scale transforms are applied; `@media (prefers-reduced-motion: reduce)` also suppresses CSS-driven motion

3. **Given** an element receives keyboard or switch-control focus **When** it is focused **Then** a visible `focus-visible` ring is shown; the ring is NOT shown after pointer/tap interaction

## Tasks / Subtasks

- [x] Task 1: Create `src/lib/springs.ts` with named Framer Motion presets (AC: #1)
  - [x] 1.1 — Export `SPRING_CARD_EXPAND` as a Framer Motion spring transition config: `{ type: "spring", stiffness: 400, damping: 22 }`
  - [x] 1.2 — Export `SPRING_TAB_TRANSITION` as a tween transition config (250ms ease-out, NOT a spring): `{ type: "tween", duration: 0.25, ease: [0.16, 1, 0.3, 1] }`
  - [x] 1.3 — Export `SPRING_MODAL_ENTER` as a Framer Motion spring config for modal entrances: `{ type: "spring", stiffness: 380, damping: 24 }`
  - [x] 1.4 — All exports are named constants (`SCREAMING_SNAKE_CASE`) with explicit TypeScript types from Framer Motion (`Transition`)
  - [x] 1.5 — No components, no hooks, no default export — constants only; file should tree-shake cleanly

- [x] Task 2: Extend `src/app/globals.css` with reduced-motion CSS (AC: #2)
  - [x] 2.1 — Read the existing `@media (prefers-reduced-motion: reduce)` block at the bottom of `globals.css` (lines 275–283)
  - [x] 2.2 — Extend the existing block to also suppress the atmospheric background transition: add `transition: none !important` to `.atmospheric-bg__image`
  - [x] 2.3 — Confirm that the existing catch-all `transition-duration: 0.01ms !important` on `*` already handles `btn-pill` and other CSS-transition-based elements — do not duplicate it
  - [x] 2.4 — Add a comment block above the reduced-motion section describing the intent: "Framer Motion's useReducedMotion() hook handles JS animation; this block handles CSS animation and transition fallback"

- [x] Task 3: Document the `useReducedMotion()` pattern for consuming components (AC: #2)
  - [x] 3.1 — Add JSDoc comments to `springs.ts` explaining how to conditionally apply a spring preset vs. the opacity-only fallback transition
  - [x] 3.2 — Include a canonical usage example in the JSDoc:
    ```ts
    // In a component:
    const reducedMotion = useReducedMotion()
    const transition = reducedMotion
      ? { duration: 0.15, ease: "easeOut" }
      : SPRING_CARD_EXPAND
    ```
  - [x] 3.3 — Note that `useReducedMotion()` is imported from `framer-motion` (v12) — it returns a `boolean | null`; treat `null` as `false` (motion enabled) since it reflects a pending OS query

- [x] Task 4: Add `focus-visible` base styles to `src/app/globals.css` (AC: #3)
  - [x] 4.1 — Add a `/* ─── Focus indicators ─── */` section to `globals.css` after the touch-targets block
  - [x] 4.2 — Use `box-shadow` instead of `outline` so `border-radius` clips reliably across browsers (CSS `outline` does not respect `border-radius` in older Safari/Firefox). Use a two-layer shadow: inner layer creates a gap using `--color-bg-base`, outer layer is the visible accent ring:
    ```css
    :focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px var(--color-bg-base), 0 0 0 4px var(--color-accent);
      border-radius: var(--radius-sm);
    }
    ```
    > **Amendment (code review BS-1):** Original spec prescribed `outline: 2px solid` + `border-radius`. Replaced with `box-shadow` ring for consistent cross-browser rendering.
  - [x] 4.3 — Explicitly suppress the default browser outline on `:focus` (non-keyboard) to avoid the ring appearing on tap:
    ```css
    :focus:not(:focus-visible) {
      outline: none;
    }
    ```
  - [x] 4.4 — Note in a JSDoc comment in `springs.ts`: when building components with interactive elements, use Tailwind's `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-accent)]` utilities to layer component-specific ring styles on top of the base rule

- [x] Task 5: Write tests for `src/lib/springs.ts`
  - [x] 5.1 — Create `src/lib/springs.test.ts` co-located with `springs.ts`
  - [x] 5.2 — Test that `SPRING_CARD_EXPAND` exports `type: "spring"`, `stiffness: 400`, `damping: 22`
  - [x] 5.3 — Test that `SPRING_TAB_TRANSITION` exports `type: "tween"`, `duration: 0.25`
  - [x] 5.4 — Test that `SPRING_MODAL_ENTER` exports `type: "spring"`, `stiffness: 380`, `damping: 24`
  - [x] 5.5 — Tests should be pure value assertions — no Framer Motion or browser APIs required; Vitest + jsdom will run them cleanly

## Dev Notes

### Framer Motion Version

The project uses **Framer Motion v12** (`"framer-motion": "^12.38.0"` in `package.json`). The `useReducedMotion()` hook is available from `framer-motion` directly in v12 — the import path has not changed from v9+:

```typescript
import { useReducedMotion } from "framer-motion"
```

In Framer Motion v12, `useReducedMotion()` returns `boolean | null`:
- `true` — OS reduced motion setting is enabled
- `false` — OS reduced motion setting is disabled (motion allowed)
- `null` — the OS preference has not yet resolved (treat as `false`; motion allowed)

Do NOT use `useMotionValue` or check `window.matchMedia` manually — `useReducedMotion()` is the canonical approach and it re-renders when the OS preference changes.

### `src/lib/springs.ts` — Structure

This file exports **named constants only**. No React hooks, no components, no default export. The intent is that any future animated component imports exactly what it needs and the bundler can tree-shake unused presets.

```typescript
import type { Transition } from "framer-motion"

/**
 * Primary spring — used for card expand/collapse, button press, and scale interactions.
 * UX-DR9, UX-DR16: stiffness:400 damping:22 per UX spec.
 *
 * Usage in a component:
 *   const reducedMotion = useReducedMotion()
 *   const transition = reducedMotion
 *     ? { duration: 0.15, ease: "easeOut" }
 *     : SPRING_CARD_EXPAND
 */
export const SPRING_CARD_EXPAND: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 22,
}

/**
 * Tab cross-fade transition — 250ms ease-out tween.
 * This is NOT a spring. UX-DR7 specifies "250ms ease-out cross-fade" for tab switching.
 * Export as a Transition object so the consuming component can swap to an opacity-only
 * fallback when useReducedMotion() is true.
 */
export const SPRING_TAB_TRANSITION: Transition = {
  type: "tween",
  duration: 0.25,
  ease: [0.16, 1, 0.3, 1],
}

/**
 * Modal/banner entrance spring — used for modal overlays and sliding banners.
 * UX-DR12 (ScanConfidenceBanner): stiffness:380 damping:24 per UX spec.
 */
export const SPRING_MODAL_ENTER: Transition = {
  type: "spring",
  stiffness: 380,
  damping: 24,
}
```

The `Transition` type from `framer-motion` accepts both spring configs and tween configs — using it for all three constants keeps the API uniform from the consumer's perspective.

### `SPRING_TAB_TRANSITION` is a Tween, Not a Spring

This is the key distinction that must not be lost. UX-DR7 specifies tab switching as a **250ms ease-out cross-fade** — a fixed-duration opacity transition, not a physics-based spring. Spring presets do not have a fixed duration (they run until energy dissipates), which would make tab switching feel unpredictable. Export it as a `type: "tween"` transition so the consuming `FloatingNavBar` component can apply it as an opacity animation with a controlled 250ms.

### Reduced Motion — Full Pattern

When `useReducedMotion()` returns `true`, all spring and tween transitions with movement should be replaced with a simple opacity fade:

```typescript
// In a component (example: DishRowExpanded accordion)
import { motion, useReducedMotion } from "framer-motion"
import { SPRING_CARD_EXPAND } from "@/lib/springs"

function DishRow() {
  const reducedMotion = useReducedMotion()

  const expandTransition = reducedMotion
    ? { duration: 0.15, ease: "easeOut" }
    : SPRING_CARD_EXPAND

  return (
    <motion.div
      animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
      // When reduced motion: no spring, no scale — opacity only
      transition={reducedMotion
        ? { duration: 0.15 }
        : SPRING_CARD_EXPAND
      }
    />
  )
}
```

The rule per UX-DR21 and UX-DR25:
- **Reduced motion ON:** 150ms opacity-only; no scale transforms; no translateY; no spring physics
- **Reduced motion OFF:** Use the appropriate `springs.ts` preset for the interaction type

### CSS `@media (prefers-reduced-motion: reduce)` — What It Already Does

The existing `globals.css` already has a catch-all reduced-motion block (lines 275–283):

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This suppresses all CSS `transition` and `animation` declarations globally when the OS setting is active. This correctly handles:
- `btn-pill:active` scale transition
- `atmospheric-bg__image` opacity transition
- All Tailwind utility transitions

**What it does NOT handle:** Framer Motion animations. Framer Motion uses JS-driven `transform` and `opacity` values injected via inline styles — not CSS transitions. That's why `useReducedMotion()` in the component layer is required in addition to the CSS media query.

Task 2 extends the existing block with targeted suppression for the atmospheric background image, and adds a comment clarifying the two-layer approach.

### `focus-visible` — Tailwind v4 Context

Tailwind v4 ships with first-class support for `focus-visible:` variants. The base CSS rule added in Task 4 sets a sensible global default. Individual components should layer on top with Tailwind utilities when they need component-specific ring colours or offsets:

```jsx
<button className="focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-accent)] focus-visible:rounded-lg">
```

The base rule in `globals.css` uses `--color-accent` (terracotta `#C4622D`) as the ring colour to match the brand. Per UX-DR27, the ring must be visible on keyboard/switch-control focus only — never after a tap. The `:focus:not(:focus-visible) { outline: none }` rule in Task 4.3 ensures pointer interactions do not trigger the ring.

### This Story Creates Utilities Only

Story 1.5 produces two output artefacts:
1. `src/lib/springs.ts` — constants file; no UI
2. CSS additions to `src/app/globals.css` — base rules for reduced motion and focus rings

No React components are created in this story. The `FloatingNavBar` (Story 1.6), `DishRowExpanded` (Story 2.5), and all other animated components are **consumers** of `springs.ts` — they are built in later stories and import from `@/lib/springs`.

Scope is deliberately narrow. Do not add components, hooks, or additional utility functions to `springs.ts`.

### TypeScript Types

Use Framer Motion's own `Transition` type for all exports:

```typescript
import type { Transition } from "framer-motion"
```

This is a type-only import (`import type`) — it adds zero runtime bytes and ensures the export types are compatible with Framer Motion's `animate`, `transition`, and `variants` props without requiring explicit casting.

### Naming Convention

Per `architecture.md`: Constants use `SCREAMING_SNAKE_CASE`. All three exports follow this convention:
- `SPRING_CARD_EXPAND`
- `SPRING_TAB_TRANSITION`
- `SPRING_MODAL_ENTER`

Even though `SPRING_TAB_TRANSITION` is technically a tween, the `SPRING_` prefix is kept for discoverability — all animation presets live in `springs.ts` regardless of their physics type.

### Project Structure Notes

**Files created in this story:**
- `src/lib/springs.ts` — new file; named Framer Motion transition presets
- `src/lib/springs.test.ts` — new test file; co-located with `springs.ts` per architecture naming conventions

**Files modified in this story:**
- `src/app/globals.css` — extend the existing `@media (prefers-reduced-motion: reduce)` block and add the `focus-visible` section

**Files NOT touched:**
- `src/lib/supabase.ts` — out of scope
- `src/lib/api-keys.ts` — out of scope
- Any component files — components are consumers; they are built in later stories
- Any existing hook files — `useReducedMotion()` is imported from `framer-motion` directly, not wrapped in a custom hook

**Where `springs.ts` lives in the project structure:**

Per `architecture.md` structure, `src/lib/` holds singletons and utilities:
```
src/lib/
├── supabase.ts          # existing
├── api-keys.ts          # existing
├── supabaseAutoSave.ts  # existing
├── springs.ts           # NEW — this story
└── springs.test.ts      # NEW — this story
```

### References

- **epics.md** — Story 1.5 acceptance criteria (lines 476–487); UX-DR21 (animation spring system and reduced motion); UX-DR25 (reduced motion CSS + useReducedMotion hook); UX-DR27 (focus-visible, keyboard only)
- **architecture.md** — ARCH14 (springs.ts with named Framer Motion presets defined before any animation implementation); naming conventions (SCREAMING_SNAKE_CASE for constants); test co-location pattern
- **ux-design-specification.md** — UX-DR21: primary spring `{ stiffness: 400, damping: 22 }` for card expand; `250ms ease-out` for tab cross-fades; `prefers-reduced-motion: reduce` → 150ms opacity-only; UX-DR22: velocity threshold >300px/s for tab-switch gesture (context for tab transition speed)

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- 2026-04-12: Story implemented. Created `src/lib/springs.ts` with three named Framer Motion `Transition` presets (`SPRING_CARD_EXPAND`, `SPRING_TAB_TRANSITION`, `SPRING_MODAL_ENTER`) and full JSDoc documenting the `useReducedMotion()` consumption pattern. Created co-located `src/lib/springs.test.ts`. Extended `src/app/globals.css`: added focus-visible section after touch-targets block; replaced the "Reduce motion" comment with a two-layer explanation comment and added `.atmospheric-bg__image { transition: none !important }` inside the existing `@media (prefers-reduced-motion: reduce)` block. All 8 assertions in `springs.test.ts` pass; all 21 assertions in `design-tokens.test.ts` pass (no regressions).

### File List
