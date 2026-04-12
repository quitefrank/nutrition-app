# Story 1.3: Visual Design System

Status: done

## Story

As a user,
I want the app to present a consistent visual language of warm glass surfaces, rich atmospheric backdrops, and refined typography on every screen,
So that Plately feels premium and immediately recognisable.

## Acceptance Criteria

1. **Given** the app loads **When** any screen renders **Then** all 4 glass surface tokens (`--glass-base`, `--glass-elevated`, `--glass-overlay`, `--glass-sunken`), 3 blur tokens (`--blur-base`, `--blur-elevated`, `--blur-heavy`), border tokens (`--border-glass`, `--border-glass-strong`), and shadow tokens (`--shadow-float`, `--shadow-card`) are defined as CSS custom properties in `globals.css` — no interactive surface uses a solid background

2. **Given** the color token system is defined **When** text and accents are rendered **Then** primary text is `#1A1612`, terracotta accent is `#C4622D`, tertiary labels are `#9E9589`, background base is `#FAFAF7`, and status tints (error/success/warning) are present in the token set

3. **Given** the typography system is configured **When** Playfair Display and DM Sans are loaded **Then** Playfair Display appears only on display/hero text (restaurant names, dish names in expanded view, page taglines); DM Sans is used for all UI text; all font sizes use rem units; the root font-size baseline is 16px on `html`

4. **Given** the spacing scale is defined **When** components are spaced **Then** `--space-1` through `--space-8` (4px base unit stepping to 32px) are defined and available for component use; no arbitrary pixel values appear in layout code that duplicate these steps

## Tasks / Subtasks

- [x] Task 1: Audit existing `globals.css` token gap and plan additions (AC: #1, #2, #3, #4)
  - [x] 1.1 — Compare existing `@theme inline` block against the full UX-DR token spec; identify what is present, what is wrong, and what is missing
  - [x] 1.2 — Document findings: glass tokens need correct rgba values (not the dark-mode `rgba(255,255,255,0.12)` approximation); blur tokens need full `backdrop-filter` expressions; border and overlay tokens are absent; spacing scale `--space-1` through `--space-8` are absent from the current file

- [x] Task 2: Replace and complete glass surface tokens (AC: #1)
  - [x] 2.1 — Replace `--glass-base` with `rgba(255, 252, 247, 0.82)` (warm cream glass for cards/panels over atmospheric bg)
  - [x] 2.2 — Replace `--glass-elevated` with `rgba(255, 253, 249, 0.94)` (nav pill, modals)
  - [x] 2.3 — Add `--glass-overlay: rgba(255, 252, 247, 0.72)` (inline banners, bottom sheets)
  - [x] 2.4 — Add `--glass-sunken: rgba(240, 238, 232, 0.78)` (input backgrounds, recessed surfaces)

- [x] Task 3: Replace and complete blur tokens (AC: #1)
  - [x] 3.1 — Replace `--blur-base` with the full `backdrop-filter` expression: `blur(24px) saturate(1.4) brightness(1.02)` (note: rename from bare pixel value to full expression)
  - [x] 3.2 — Replace `--blur-strong` (or add as `--blur-elevated`): `blur(32px) saturate(1.5) brightness(1.03)`
  - [x] 3.3 — Add `--blur-heavy: blur(48px) saturate(1.6)` (atmospheric background layer)
  - [x] 3.4 — Update `.glass` and `.glass-elevated` utility classes to consume the new full-expression blur tokens correctly (using `backdrop-filter: var(--blur-base)` — not inline pixel values)

- [x] Task 4: Add border and shadow tokens (AC: #1)
  - [x] 4.1 — Add `--border-glass: 1px solid rgba(180, 170, 158, 0.22)`
  - [x] 4.2 — Add `--border-glass-strong: 1px solid rgba(180, 170, 158, 0.32)`
  - [x] 4.3 — Rename `--shadow-elevated` to `--shadow-float` (matching UX-DR spec name: `0 8px 32px rgba(80,60,40,0.12), 0 2px 8px rgba(80,60,40,0.08)`) — `--shadow-card` value is already correct; add `--shadow-float` as the alias or rename
  - [x] 4.4 — Retain `--shadow-modal` for existing usage

- [x] Task 5: Complete the color token system (AC: #2)
  - [x] 5.1 — Verify `--color-bg-base: #FAFAF7` is present (currently `--color-base`); add `--color-bg-base` alias or rename for UX-DR3 compliance
  - [x] 5.2 — Add `--color-bg-elevated: #EFEDE6` and `--color-bg-sunken: #E8E6DF` (currently named `--color-surface-raised` and `--color-surface-sunken` — add the UX-DR canonical names alongside or replace)
  - [x] 5.3 — Confirm all text scale tokens exist: `--color-text-primary: #1A1612`, `--color-text-secondary: #6B6458`, `--color-text-tertiary: #9E9589`, `--color-text-disabled: #C4BDB5` — all are present; no changes needed
  - [x] 5.4 — Confirm accent tokens: `--color-accent: #C4622D`, `--color-accent-tint: #FAEEE6` (currently `--color-accent-light`), `--color-accent-dark: #9E4B1F` — add `--color-accent-tint` alias
  - [x] 5.5 — Confirm status tint tokens match spec rgba values: error `rgba(251,234,234,0.95)`, success `rgba(232,245,238,0.95)`, warning `rgba(251,243,226,0.95)` — add these as `--tint-error`, `--tint-success`, `--tint-warning` alongside the existing solid `--color-error` / `--color-success` / `--color-warning` values

- [x] Task 6: Verify and complete typography system (AC: #3)
  - [x] 6.1 — Confirm `html { font-size: 16px }` is set as the root baseline (it is present — no change needed)
  - [x] 6.2 — Confirm `--font-display: "Playfair Display"` and `--font-body: "DM Sans"` are defined (both present — no change needed)
  - [x] 6.3 — Audit heading size declarations: current `h1: 2rem`, `h2: 1.5rem`, `h3: 1.25rem`, `h4: 1.0625rem` are correct rem-based values; verify they match UX-DR4 Display/H2/H3/H4 levels
  - [x] 6.4 — Add the remaining type scale as CSS custom properties for component use: `--text-display: 2rem`, `--text-h2: 1.5rem`, `--text-h3: 1.25rem`, `--text-h4: 1.0625rem`, `--text-body: 0.9375rem`, `--text-label: 0.8125rem`, `--text-caption: 0.6875rem`, `--text-tab: 0.625rem`
  - [x] 6.5 — Confirm font loading: `@fontsource/dm-sans` and `@fontsource/playfair-display` are installed; they must be imported in `src/app/layout.tsx` — NOT via `<link>` tags or `next/font/google` (fontsource packages load the font from node_modules, avoiding Google CDN network dependency)

- [x] Task 7: Add spacing scale (AC: #4)
  - [x] 7.1 — Add `--space-1: 4px`, `--space-2: 8px`, `--space-3: 12px`, `--space-4: 16px`, `--space-5: 20px`, `--space-6: 24px`, `--space-8: 32px` to the `@theme inline` block (note: `--space-7` is not in the UX-DR spec — do not invent it)
  - [x] 7.2 — Confirm safe-area spacing tokens `--space-safe-bottom` and `--space-safe-top` are present (they are — no change needed)

- [x] Task 8: Update utility classes to use corrected tokens (AC: #1)
  - [x] 8.1 — Update `.frosted` to use `--border-glass` token instead of inline `var(--color-card-border)` border
  - [x] 8.2 — Update `.glass` to use `var(--blur-base)` (which is now the full expression) — the current class uses `blur(var(--blur-base)) saturate(1.2)` which will break when `--blur-base` becomes a full expression; restructure to `backdrop-filter: var(--blur-base)` with saturation/brightness embedded in the token
  - [x] 8.3 — Update `.glass-elevated` similarly to `backdrop-filter: var(--blur-elevated)` consuming the full token
  - [x] 8.4 — Add `.glass-overlay` utility class: `background: var(--glass-overlay); backdrop-filter: var(--blur-base); -webkit-backdrop-filter: var(--blur-base); border: var(--border-glass)`
  - [x] 8.5 — Add `.glass-sunken` utility class: `background: var(--glass-sunken); border: var(--border-glass)`

- [x] Task 9: Write token smoke tests (AC: #1, #2, #3, #4)
  - [x] 9.1 — Create `src/app/__tests__/globals.css.test.ts` (or co-locate as appropriate): read `globals.css` as a string and assert that all required custom property names are present — this is a fast, low-cost regression guard
  - [x] 9.2 — Test list: `--glass-base`, `--glass-elevated`, `--glass-overlay`, `--glass-sunken`, `--blur-base`, `--blur-elevated`, `--blur-heavy`, `--border-glass`, `--border-glass-strong`, `--shadow-float`, `--shadow-card`, `--color-accent`, `--color-text-primary`, `--space-1`, `--space-8`

## Dev Notes

### Overview

This story is **CSS-only**. No React components are created or modified. The deliverable is a corrected and completed `src/app/globals.css` that defines the full token vocabulary the rest of the app will reference. All component implementation is deferred to later stories.

The current `globals.css` is a working v1-era file. It has the right structure but the token values and naming do not match the UX design spec. This story brings it into alignment.

---

### Current State of globals.css (pre-story audit)

The file uses Tailwind v4's `@theme inline` block and is already structured correctly. Issues to fix:

| Token | Current State | Required State |
|-------|--------------|----------------|
| `--glass-base` | `rgba(255, 255, 255, 0.12)` — dark-over surface value | `rgba(255, 252, 247, 0.82)` — warm cream for light glass |
| `--glass-elevated` | `rgba(255, 255, 255, 0.18)` | `rgba(255, 253, 249, 0.94)` |
| `--glass-overlay` | Missing | `rgba(255, 252, 247, 0.72)` |
| `--glass-sunken` | Missing | `rgba(240, 238, 232, 0.78)` |
| `--blur-base` | `20px` — bare pixel, not full expression | `blur(24px) saturate(1.4) brightness(1.02)` |
| `--blur-strong` / `--blur-elevated` | `32px` — bare pixel | `blur(32px) saturate(1.5) brightness(1.03)` |
| `--blur-heavy` | Missing | `blur(48px) saturate(1.6)` |
| `--border-glass` | Missing | `1px solid rgba(180, 170, 158, 0.22)` |
| `--border-glass-strong` | Missing | `1px solid rgba(180, 170, 158, 0.32)` |
| `--shadow-float` | Missing (exists as `--shadow-elevated`) | `0 8px 32px rgba(80,60,40,0.12), 0 2px 8px rgba(80,60,40,0.08)` |
| `--space-1` through `--space-8` | Missing | 4px → 32px in 4px steps (no step-7) |
| `--text-*` scale tokens | Missing | `--text-display` through `--text-tab` in rem |
| `--tint-error/success/warning` | Partial (solid colors only) | rgba tint values per spec |
| `--color-bg-base` | `--color-base` (wrong name) | `--color-bg-base: #FAFAF7` + keep alias |
| `--color-accent-tint` | `--color-accent-light` (wrong name) | `--color-accent-tint: #FAEEE6` + keep alias |

---

### Tailwind v4 — Critical Differences from v3

This project uses **Tailwind CSS v4** (package version `^4`). The approach differs fundamentally from v3:

**v3 approach (do NOT use):**
```js
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: { accent: '#C4622D' }
    }
  }
}
```

**v4 approach (correct for this project):**
```css
/* globals.css */
@import "tailwindcss";

@theme inline {
  --color-accent: #C4622D;
  --font-body: "DM Sans";
  /* etc. */
}
```

In Tailwind v4:
- There is **no `tailwind.config.js`** (or it is minimal). CSS custom properties defined inside `@theme inline {}` become Tailwind utilities automatically.
- `@theme inline` means the variables are inlined rather than generating a separate `:root` block. The properties are available as CSS variables AND as Tailwind utility classes (e.g., `bg-accent`, `text-text-primary`).
- Custom properties defined OUTSIDE `@theme inline` (in `:root` or bare) are available as CSS variables but are NOT automatically exposed as Tailwind utilities.
- The `@import "tailwindcss"` directive replaces `@tailwind base; @tailwind components; @tailwind utilities;`.

**Implication for this story:** All design tokens that components may need to reference as Tailwind utilities (colors, font families, etc.) should remain inside `@theme inline`. The new glass tokens (`--glass-base`, `--blur-base`, etc.) do NOT need to be inside `@theme inline` because they are referenced via `var()` in CSS classes and Tailwind arbitrary values (`bg-[var(--glass-base)]`), not as auto-generated utilities. They belong in `:root` or a top-level CSS block.

**Recommended structure:**
```css
@import "tailwindcss";

@theme inline {
  /* Tailwind utility tokens — colors, fonts, spacing, radii, etc. */
  --font-display: "Playfair Display";
  --color-accent: #C4622D;
  --space-1: 4px;
  /* etc. */
}

/* CSS custom properties used via var() — glass tokens, blur expressions */
:root {
  --glass-base: rgba(255, 252, 247, 0.82);
  --blur-base: blur(24px) saturate(1.4) brightness(1.02);
  --border-glass: 1px solid rgba(180, 170, 158, 0.22);
  --shadow-float: 0 8px 32px rgba(80,60,40,0.12), 0 2px 8px rgba(80,60,40,0.08);
  /* etc. */
}
```

---

### Exact Token Values — Complete Reference

All values come directly from the UX design specification and ARCH11. No deviations.

#### Glass Surface Tokens (`:root`)
```css
--glass-base:     rgba(255, 252, 247, 0.82);   /* cards, panels over atmospheric bg */
--glass-elevated: rgba(255, 253, 249, 0.94);   /* nav pill, modals, bottom sheets */
--glass-overlay:  rgba(255, 252, 247, 0.72);   /* inline banners, overlays */
--glass-sunken:   rgba(240, 238, 232, 0.78);   /* input backgrounds, recessed states */
```

#### Blur Tokens (`:root`) — full backdrop-filter expressions
```css
--blur-base:     blur(24px) saturate(1.4) brightness(1.02);
--blur-elevated: blur(32px) saturate(1.5) brightness(1.03);
--blur-heavy:    blur(48px) saturate(1.6);   /* atmospheric background layer */
```

**IMPORTANT:** Because `--blur-base` is now a full `backdrop-filter` expression, every utility class that references it must use:
```css
backdrop-filter: var(--blur-base);
-webkit-backdrop-filter: var(--blur-base);
```
NOT `blur(var(--blur-base))` — that would nest a function call inside a function, which is invalid CSS.

#### Border Tokens (`:root`)
```css
--border-glass:        1px solid rgba(180, 170, 158, 0.22);
--border-glass-strong: 1px solid rgba(180, 170, 158, 0.32);
```

#### Shadow Tokens (`@theme inline` or `:root`)
```css
--shadow-float: 0 8px 32px rgba(80,60,40,0.12), 0 2px 8px rgba(80,60,40,0.08);
--shadow-card:  0 2px 12px rgba(80,60,40,0.08), 0 1px 3px rgba(80,60,40,0.06);
/* --shadow-modal already present — retain as-is */
```

#### Color Tokens (`@theme inline`)
```css
/* Background scale */
--color-bg-base:    #FAFAF7;
--color-bg-elevated: #EFEDE6;
--color-bg-sunken:  #E8E6DF;

/* Text scale */
--color-text-primary:   #1A1612;
--color-text-secondary: #6B6458;
--color-text-tertiary:  #9E9589;
--color-text-disabled:  #C4BDB5;

/* Accent — terracotta */
--color-accent:      #C4622D;
--color-accent-tint: #FAEEE6;
--color-accent-dark: #9E4B1F;

/* Status tints — rgba values for glass-compatible overlays */
--tint-success: rgba(232, 245, 238, 0.95);
--tint-error:   rgba(251, 234, 234, 0.95);
--tint-warning: rgba(251, 243, 226, 0.95);
```

#### Typography Scale (`@theme inline`)
```css
--font-display: "Playfair Display";
--font-body:    "DM Sans";

--text-display: 2rem;       /* 32px — restaurant hero, empty state headline */
--text-h2:      1.5rem;     /* 24px — section titles */
--text-h3:      1.25rem;    /* 20px — card titles, dish names */
--text-h4:      1.0625rem;  /* 17px — sub-section headers */
--text-body:    0.9375rem;  /* 15px — all body text */
--text-label:   0.8125rem;  /* 13px — metadata, secondary labels */
--text-caption: 0.6875rem;  /* 11px — timestamps, provenance labels */
--text-tab:     0.625rem;   /* 10px — nav tab labels */
```

#### Spacing Scale (`@theme inline`)
```css
--space-1: 4px;   /* icon-to-label gap */
--space-2: 8px;   /* chip internal padding */
--space-3: 12px;  /* between related elements */
--space-4: 16px;  /* screen horizontal gutters */
--space-5: 20px;  /* card internal padding */
--space-6: 24px;  /* section gaps */
--space-8: 32px;  /* major section separators */
/* Note: --space-7 (28px) is NOT in the spec — do not add it */
```

---

### Font Loading — @fontsource in Next.js App Router

The project uses `@fontsource/dm-sans` and `@fontsource/playfair-display` (both at `^5.2.8`), which are already installed per `package.json`. These are NOT Google Fonts web imports — they bundle the font files into the project.

Load them in `src/app/layout.tsx` via CSS imports at the top of the file:

```typescript
// src/app/layout.tsx
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/playfair-display/700.css";
```

**Do NOT use `next/font/google`** — it would download from Google CDN, conflicting with the already-installed fontsource packages.

**Check `src/app/layout.tsx` first** — if these imports already exist, no change is needed. This story only adds them if they are absent.

The `--font-display` and `--font-body` CSS custom properties in `globals.css` reference these family names. Tailwind v4 exposes them as `font-display` and `font-body` utility classes automatically via `@theme inline`.

---

### Utility Classes — Updated Signatures

After the token updates, the CSS utility classes in `globals.css` must be updated to consume the corrected tokens:

```css
/* .frosted — light frosted glass for content sitting on cream/white background */
.frosted {
  background: var(--glass-base);
  backdrop-filter: var(--blur-base);
  -webkit-backdrop-filter: var(--blur-base);
  border: var(--border-glass);
  box-shadow: var(--shadow-card);
}

/* .frosted-elevated — nav pill, modals, bottom sheets */
.frosted-elevated {
  background: var(--glass-elevated);
  backdrop-filter: var(--blur-elevated);
  -webkit-backdrop-filter: var(--blur-elevated);
  border: var(--border-glass);
  box-shadow: var(--shadow-float);
}

/* .glass — used where content sits directly over atmospheric background photo */
/* Semantically identical to .frosted but the naming distinction is preserved for clarity */
.glass {
  background: var(--glass-base);
  backdrop-filter: var(--blur-base);
  -webkit-backdrop-filter: var(--blur-base);
  border: var(--border-glass);
}

/* .glass-elevated */
.glass-elevated {
  background: var(--glass-elevated);
  backdrop-filter: var(--blur-elevated);
  -webkit-backdrop-filter: var(--blur-elevated);
  border: var(--border-glass);
  box-shadow: var(--shadow-float);
}

/* .glass-overlay — banners, inline feedback surfaces */
.glass-overlay {
  background: var(--glass-overlay);
  backdrop-filter: var(--blur-base);
  -webkit-backdrop-filter: var(--blur-base);
  border: var(--border-glass);
}

/* .glass-sunken — inputs, recessed surfaces */
.glass-sunken {
  background: var(--glass-sunken);
  border: var(--border-glass);
}
```

---

### Token Naming Alignment Note

The existing file uses some names that differ from the UX design spec. To avoid breaking existing component code, **add the spec-canonical names alongside the existing names** rather than renaming:

| Existing name | Spec-canonical name | Action |
|--------------|--------------------|----|
| `--color-base` | `--color-bg-base` | Add `--color-bg-base` alias; keep `--color-base` |
| `--color-surface-raised` | `--color-bg-elevated` | Add `--color-bg-elevated`; keep `--color-surface-raised` |
| `--color-surface-sunken` | `--color-bg-sunken` | Add `--color-bg-sunken`; keep `--color-surface-sunken` |
| `--color-accent-light` | `--color-accent-tint` | Add `--color-accent-tint`; keep `--color-accent-light` |
| `--shadow-elevated` | `--shadow-float` | Add `--shadow-float`; keep `--shadow-elevated` for existing usage |
| `--blur-strong` | `--blur-elevated` | Add `--blur-elevated`; keep `--blur-strong` for transition |

This approach prevents regressions in existing components that already reference the old names while making the spec-canonical names available for new components.

---

### Atmospheric Background CSS

The `.atmospheric-bg`, `.atmospheric-bg__image`, and `.atmospheric-bg__overlay` utility classes are already in `globals.css` and are correct. The `filter: blur(40px) saturate(1.3)` on `.atmospheric-bg__image` matches the UX spec. No changes needed in this story.

The atmospheric overlay gradient is already correct:
```css
linear-gradient(
  180deg,
  rgba(250, 250, 247, 0.55) 0%,
  rgba(244, 243, 238, 0.72) 60%,
  rgba(239, 237, 230, 0.88) 100%
)
```

---

### Reduced Motion

The `@media (prefers-reduced-motion: reduce)` block is already present and correct — it kills all `animation-duration` and `transition-duration` to `0.01ms`. No changes needed.

---

### What This Story Does NOT Do

This story is **token definition only**. It does not:
- Create or modify any React component
- Implement the FloatingNavBar (Story 1.6)
- Implement the atmospheric background at root layout level (Story 1.7)
- Implement the app shell layout or safe-area padding (Story 1.4)
- Implement the animation spring system (Story 1.5)
- Implement Framer Motion spring presets or `src/lib/springs.ts` (Story 1.5)
- Verify that existing components apply the tokens correctly (that is the concern of each component story)

---

### Project Structure Notes

**Primary file for this story:**
- `/Users/frank.milan/Claude/Personal/nutrition-app/v2/src/app/globals.css` — the single target file

**Secondary file (check only, may need import additions):**
- `/Users/frank.milan/Claude/Personal/nutrition-app/v2/src/app/layout.tsx` — check that `@fontsource` imports exist; add if absent

**Test file to create:**
- `/Users/frank.milan/Claude/Personal/nutrition-app/v2/src/app/__tests__/design-tokens.test.ts` — simple string-scan of globals.css for required property names

**No other files are modified in this story.**

---

### Testing Notes

The token smoke tests are a simple string-scan, not a browser render test:

```typescript
// src/app/__tests__/design-tokens.test.ts
import { readFileSync } from "fs";
import { join } from "path";
import { describe, it, expect } from "vitest";

const css = readFileSync(
  join(process.cwd(), "src/app/globals.css"),
  "utf-8"
);

const REQUIRED_TOKENS = [
  "--glass-base",
  "--glass-elevated",
  "--glass-overlay",
  "--glass-sunken",
  "--blur-base",
  "--blur-elevated",
  "--blur-heavy",
  "--border-glass",
  "--border-glass-strong",
  "--shadow-float",
  "--shadow-card",
  "--color-accent",
  "--color-text-primary",
  "--color-text-tertiary",
  "--space-1",
  "--space-8",
  "--text-display",
  "--text-caption",
  "--tint-error",
  "--tint-success",
  "--tint-warning",
];

describe("Design token system", () => {
  REQUIRED_TOKENS.forEach((token) => {
    it(`defines ${token}`, () => {
      expect(css).toContain(token);
    });
  });
});
```

Run tests with: `npx vitest run`

---

### References

- **epics.md** — Story 1.3 acceptance criteria, UX-DR1 (glass token system), UX-DR2 (atmospheric background), UX-DR3 (color tokens), UX-DR4 (typography), UX-DR5 (spacing), UX-DR25 (reduced motion), UX-DR26 (Dynamic Type / rem units), UX-DR28 (responsive strategy)
- **ux-design-specification.md** — "Design System Foundation" section (Glass Token System table, Color System table, Typography System table, Spacing & Layout Foundation table), "Design Token Reference" section
- **architecture.md** — ARCH11 (glass token system definition), ARCH14 (springs.ts — deferred to Story 1.5), ARCH15 (atmospheric layer — deferred to Story 1.7)
- **1-1-infrastructure-hardening.md** — Pattern for file structure, test co-location, Vitest usage

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

**2026-04-12 — Story 1.3 complete**

globals.css was fully rewritten to align with the UX-DR token spec. Summary of changes:

- **Glass surface tokens** (moved to `:root`): replaced dark-mode approximation values with warm-cream UX-DR1 values; added `--glass-overlay` and `--glass-sunken`.
- **Blur tokens** (moved to `:root`): replaced bare pixel values (`20px`, `32px`) with full `backdrop-filter` expressions; added `--blur-elevated` and `--blur-heavy`; retained `--blur-strong` as a legacy alias.
- **Border tokens** (`:root`): added `--border-glass` and `--border-glass-strong`.
- **Shadow tokens** (`@theme inline`): added `--shadow-float` as UX-DR canonical name; retained `--shadow-elevated` for existing components.
- **Color tokens** (`@theme inline`): added UX-DR3 canonical names `--color-bg-base`, `--color-bg-elevated`, `--color-bg-sunken`, `--color-accent-tint` alongside legacy aliases; added rgba status tints `--tint-error`, `--tint-success`, `--tint-warning`.
- **Typography scale** (`@theme inline`): added `--text-display` through `--text-tab` (8 tokens, rem units).
- **Spacing scale** (`@theme inline`): added `--space-1` through `--space-8` (7 steps, no `--space-7`).
- **Utility classes**: updated `.frosted`, `.frosted-elevated`, `.glass`, `.glass-elevated` to use token-driven `backdrop-filter: var(--blur-*)` and `border: var(--border-glass)`; added `.glass-overlay` and `.glass-sunken`.
- **layout.tsx**: NOT modified — `@fontsource` imports for both DM Sans (300/400/500/600) and Playfair Display (400/500/600/700) were already present, exceeding the story requirement.
- **Tests**: created `src/app/__tests__/design-tokens.test.ts`; all 21 token assertions pass.

### File List

- `src/app/globals.css` — primary deliverable, complete token vocabulary
- `src/app/__tests__/design-tokens.test.ts` — smoke test (21 assertions, all passing)
