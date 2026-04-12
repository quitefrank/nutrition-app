# Story 2.4: Dish Card (Phase 1 — AI Macros, No Photo)

Status: ready-for-dev
Epic: 2 — Menu Scan & Dish Auto-Capture
Story ID: 2.4
Story Key: 2-4-dish-card-phase-1-ai-macros-no-photo
Created: 2026-04-12

---

## Story

As a user,
I want to see a card for every recognised dish immediately after scanning, showing estimated calories and macros,
So that I can start evaluating dishes while enrichment is still in progress.

---

## Acceptance Criteria

**AC1 — DishRowCompact renders with macro chips**
**Given** dishes have been auto-captured with `status: 'auto_captured'`
**When** the restaurant dish list renders
**Then** each dish shows a `DishRowCompact` card:
- 72×72px photo area on the left (warm placeholder tile when `photoStatus: 'placeholder'`)
- Dish name (right column, semibold, 2-line clamp)
- Calorie count in terracotta (`#C4622D`, 14px semibold) — shown even when macros aren't loaded yet
- Macro chips row (protein/carbs/fat) when macro data is available
- Surface: `--glass-base` background + `--blur-base` backdrop filter
- `role="button"`, `aria-expanded="false"`, `aria-label="[Dish name], [cal] calories"`

**AC2 — "Est." indicator on AI-estimated macros**
**Given** macros are AI-estimated (not yet USDA-verified, i.e. no `usda_fdc_id` present on the recipe)
**When** the macro chips render
**Then** a small "Est." badge or label is visible near the macro chips; no USDA provenance badge is shown at this stage

**AC3 — Performance: cards visible ≤10s**
**Given** the dish list renders after a scan
**When** measured from scan initiation on LTE
**Then** all `DishRowCompact` cards with at minimum calorie data are visible within ≤10 seconds; Phase 2 enrichment may still be in progress

**AC4 — Suppressed dishes render null**
**Given** a recipe has `photoStatus: 'suppressed'` (Gemini confidence < 0.3)
**When** `DishRowCompact` renders
**Then** the component returns `null` — no card, no placeholder, no layout gap

**AC5 — Reduced motion respected**
**Given** the device has `prefers-reduced-motion: reduce`
**When** the card renders or animates
**Then** no spring animation or scale transform is applied; appearance is immediate

---

## This Is a New Component (Greenfield)

**`src/components/ui/DishCard.tsx` already exists** but is a DIFFERENT component — it is a grid card with a 4:3 aspect photo + name + calorie count. It is used in collection grid views (not the restaurant scan result list).

**`DishRowCompact` does not yet exist.** Create it at:

```
src/components/scan/DishRowCompact.tsx
```

The `scan/` directory is correct — this component is used in the restaurant screen's scan result list, alongside `RestaurantConfirmation.tsx` and `InferenceState.tsx`.

**Do NOT modify `DishCard.tsx`** — it serves a different use case (grid layout) and must not be broken.

---

## Component Interface

```typescript
// src/components/scan/DishRowCompact.tsx
"use client"

import { useReducedMotion } from "framer-motion"
import type { DomainRecipe } from "@/types/database"

interface DishRowCompactProps {
  recipe: DomainRecipe
  /**
   * Macro totals computed from enrichment pipeline (Story 2.6).
   * Absent when enrichment hasn't completed yet.
   * Shown as "Est." chips — no USDA provenance at this stage.
   */
  totalProtein?: number | null
  totalCarbs?: number | null
  totalFat?: number | null
  /** Whether this dish is the currently expanded row */
  isExpanded: boolean
  /** Toggle expand/collapse — used by parent to manage single-open state */
  onToggle: () => void
  className?: string
}
```

> **Why separate macro props?** The restaurant list query (`useRecipesByRestaurant`) fetches only recipe columns — not `recipe_ingredients`. The macro totals are computed by the restaurant screen from the sessionStorage enrichment result. Passing them as props keeps the component pure and testable without a Supabase query.

---

## Visual Specification (Compact State)

Reference: UX Design Specification — "Compact Row + In-Place Expansion" section.

```
┌─────────────────────────────────────────────────────┐
│  ┌──────────┐  Pad Thai                             │
│  │          │  Terracotta calorie (14px semibold)   │
│  │ 72×72px  │  P  12g  ·  C  48g  ·  F  14g  Est.  │
│  └──────────┘                                       │
└─────────────────────────────────────────────────────┘
```

**Surface:**
```css
background: var(--glass-base)         /* rgba(255,252,247,0.82) */
backdrop-filter: var(--blur-base)     /* blur(24px) saturate(1.4) brightness(1.02) */
border: var(--border-glass)           /* 1px solid rgba(180,170,158,0.22) */
border-radius: 16px
padding: 12px
```

**Photo area (72×72px):**
- `photoStatus: 'placeholder'` — warm cream tile, subtle gradient, no broken image icon
- `photoStatus: 'confirmed'` — real photo (via `PhotoFrame` component, already exists at `src/components/ui/PhotoFrame.tsx`)
- `photoStatus: 'suppressed'` — return `null` from the component (AC4)

**Name:** DM Sans 15px, semibold, 2-line clamp, `--color-text-primary`

**Calorie chip:** 14px semibold, `--color-accent` (#C4622D); shown if `recipe.estimatedCalories != null`

**Macro chips (protein / carbs / fat):**
- Label: "P", "C", "F" (abbreviations)
- Value: `{n}g` (rounded to nearest integer)
- Font: 12px DM Sans, `--color-text-secondary`
- Layout: inline row, 4px gap between chips, small separator dot between chips
- "Est." badge: 10px, `--color-text-tertiary`, after the chip row

**ARIA:**
```html
<div
  role="button"
  tabIndex={0}
  aria-expanded={isExpanded ? "true" : "false"}
  aria-label="{recipe.name}, {recipe.estimatedCalories} calories"
  onClick={onToggle}
  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onToggle() }}
>
```

**Minimum touch target:** 44px height minimum for the overall card row.

---

## PhotoFrame Usage

`PhotoFrame` already exists at `src/components/ui/PhotoFrame.tsx`. Use it for the 72×72px photo area:

```tsx
<PhotoFrame
  photoStatus={recipe.photoStatus}
  dishImageUrl={recipe.dishImageUrl}
  dishName={recipe.name}
  className="w-[72px] h-[72px] rounded-xl flex-shrink-0"
/>
```

Check how `PhotoFrame` currently handles the `placeholder` state — it should render a warm placeholder tile. If it renders a broken image or empty div, add the warm gradient placeholder within the `placeholder` branch.

---

## Macro Display Logic

```typescript
// Show macro chips only when ALL three macro values are available
const hasMacros = totalProtein != null && totalCarbs != null && totalFat != null

// "Est." indicator: always shown when macros are AI-estimated
// (Phase 2, Story 3.4, will add USDA provenance badge — that's NOT in scope here)
const showEstBadge = hasMacros  // always true at Phase 1 since no USDA verification yet
```

When `hasMacros` is false (enrichment still in progress), show only the calorie count. Do not show empty macro placeholders or skeleton loaders.

---

## Tests Required

**Test file location:** `src/components/scan/DishRowCompact.test.tsx`
(Co-located with component — not in `__tests__/`)

### Testing approach

```typescript
import { vi, describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DishRowCompact } from './DishRowCompact'
import type { DomainRecipe } from '@/types/database'

const baseRecipe: DomainRecipe = {
  id: 'test-id',
  restaurantId: 'rest-id',
  visitId: null,
  name: 'Pad Thai',
  description: 'Classic Thai noodles',
  dishImageUrl: null,
  estimatedCalories: 520,
  status: 'auto_captured',
  photoStatus: 'placeholder',
  geminiConfidence: 0.9,
  dishRating: null,
  dishReviewSnippet: null,
  createdAt: new Date().toISOString(),
}
```

### Required test cases

```
describe('DishRowCompact')
  ├── rendering
  │   ├── renders dish name
  │   ├── renders calorie count in terracotta
  │   ├── renders macro chips when all three present
  │   ├── does NOT render macro chips when any macro is null
  │   └── shows "Est." badge when macro chips are shown
  ├── photo states
  │   ├── renders placeholder tile when photoStatus='placeholder'
  │   ├── renders PhotoFrame when photoStatus='confirmed'
  │   └── returns null when photoStatus='suppressed'
  ├── accessibility
  │   ├── has role="button"
  │   ├── aria-expanded="false" by default
  │   ├── aria-expanded="true" when isExpanded=true
  │   └── aria-label includes dish name and calories
  ├── interaction
  │   ├── calls onToggle when clicked
  │   └── calls onToggle on Enter key press
  └── edge cases
      └── renders without calorie or macro data gracefully
```

---

## Architecture Guardrails

- **This is a `'use client'` component** — it uses `useReducedMotion()` from Framer Motion
- **Do NOT import from `@/lib/supabase`** — this component is pure UI, no DB access
- **Do NOT import from `@/lib/api-keys`** — server-only module; importing it in a client component will cause a build error
- **Use `PhotoFrame` for the photo area** — do not create a new photo component; `PhotoFrame` already handles placeholder/confirmed/suppressed states
- **Glass tokens via CSS vars** — use Tailwind arbitrary values: `bg-[var(--glass-base)]` and `backdrop-blur-[var(--blur-base)]`; or inline styles for Safari compatibility
- **`useReducedMotion()`** from Framer Motion — gate any animation. If motion is reduced, render immediately with no transition.
- **Do NOT manage expanded state internally** — `isExpanded` and `onToggle` come from the parent (restaurant screen); only one dish can be expanded at a time (Story 2.5 concern)

---

## File Scope

### Files to create

| File | Notes |
|------|-------|
| `src/components/scan/DishRowCompact.tsx` | New component |
| `src/components/scan/DishRowCompact.test.tsx` | Co-located tests |

### Files NOT to touch

| File | Reason |
|------|--------|
| `src/components/ui/DishCard.tsx` | Different component (grid card); must not be broken |
| `src/components/ui/PhotoFrame.tsx` | Reuse as-is; only fix placeholder branch if broken |
| `src/types/database.ts` | Schema types are correct; no new columns needed at this story |
| Any API route | This story is UI-only |

---

## Key Context from Epic 2

Story 2.4 creates the display primitive for the restaurant scan result screen:
- Story 2.3 (Restaurant Confirmation) renders the list after auto-capture — it needs this component
- Story 2.5 (Row Expansion) adds the `DishRowExpanded` state — it extends `DishRowCompact`'s `onToggle` to manage expanded content; the expand animation (`SPRING_CARD_EXPAND`, `height: 0 → auto`) and chevron rotation belong in Story 2.5
- Story 2.6 (AI Ingredient Pipeline) produces the `totalProtein`, `totalCarbs`, `totalFat` values this component displays
- Story 3.4 (USDA Provenance Indicators, Epic 3) replaces the "Est." badge with a USDA badge — do not implement USDA-verified states here

**Parallel work notice**: Stories 2.2, 2.4, 2.6, and 2.8 are designed to be developed in parallel. Each has independent file scope. There are no merge conflicts expected.

---

## Relevant Previous Story Context

### From Story 1.3 — Visual Design System (done)
- Glass tokens (`--glass-base`, `--blur-base`, `--border-glass`) are defined in `src/app/globals.css`
- Color tokens (`--color-accent` = `#C4622D`, `--color-text-primary`, `--color-text-secondary`) are defined
- Font tokens (`--font-display` = Playfair Display, UI font = DM Sans via `@fontsource/dm-sans`) are loaded

### From Story 1.4 — App Shell (done)
- `AtmosphericBackground` is always present behind all screens; glass surfaces rely on this to look correct
- All screens render inside `AppShell` which provides the atmospheric layer

### From Story 1.6 — FloatingNavBar (done)
- The nav bar is a frosted glass pill, not a flat bar
- Confirms that glass token system works on mobile

---

## Definition of Done

- [ ] `src/components/scan/DishRowCompact.tsx` created
- [ ] Renders warm placeholder tile when `photoStatus: 'placeholder'`
- [ ] Renders calorie count in terracotta when `estimatedCalories != null`
- [ ] Renders macro chips (P/C/F) with "Est." badge when all three macro values present
- [ ] Returns `null` when `photoStatus: 'suppressed'`
- [ ] `role="button"`, `aria-expanded`, `aria-label` attributes present
- [ ] `onToggle` called on click and Enter key
- [ ] `src/components/scan/DishRowCompact.test.tsx` covers all required test cases
- [ ] All tests pass (`vitest run`)
- [ ] TypeScript strict mode passes (`tsc --noEmit`)
- [ ] No regression to `DishCard.tsx` or `PhotoFrame.tsx`

---

## Dev Agent Record

_To be filled by the implementing agent._

### Agent Model Used

### Debug Log References

### Completion Notes

### File List
