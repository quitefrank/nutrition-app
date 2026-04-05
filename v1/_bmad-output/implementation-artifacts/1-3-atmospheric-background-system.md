# Story 1.3: Atmospheric Background System

Status: review

## Story

As a user,
I want the app background to feel alive and context-aware,
so that the visual environment matches the cuisine or restaurant I'm viewing.

## Acceptance Criteria

1. **Given** no restaurant context is available **When** the app loads or is on an empty state screen **Then** the atmospheric background renders a neutral dark base (`#0a0a0a`) with no image; no broken or missing visual state occurs.

2. **Given** a `sourceImageUrl` is passed to the atmospheric background **When** the image loads **Then** it renders full-bleed with `filter: blur(48px) saturate(1.4)`, a dark-mode gradient overlay (`linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 100%)`), and a vignette at edges; in light mode the overlay uses `rgba(255,255,255,0)` to `rgba(255,255,255,0.45)`.

3. **Given** the atmospheric background receives a new `sourceImageUrl` **When** the context changes **Then** the transition uses a 400ms ease crossfade to the new image; no hard cut or flash occurs.

4. **Given** restaurant-specific colour extraction fails or returns insufficient data **When** the atmospheric background falls back **Then** it applies a cuisine-type fallback palette (tier 2); if cuisine palette also fails, it falls back to the neutral dark base (tier 3); the tier applied is logged internally (console.debug).

5. **Given** any palette is about to be applied **When** the programmatic contrast check runs **Then** `text-primary` against the composite background must satisfy WCAG AA (4.5:1 for body text, 3:1 for large text and UI components); if it fails, the system falls back one tier without applying the failing palette.

6. **Given** the `AtmosphericBackground` component wraps the root layout **When** rendered on any screen **Then** it extends edge-to-edge including behind the status bar and home indicator; no content shift or horizontal overflow occurs.

7. **Given** a restaurant's atmospheric palette is stored in `restaurants.atmospheric_palette_json` **When** the user returns to the same restaurant context **Then** no re-extraction call is made; the cached palette and image URL are used directly from the `['restaurants', restaurantId]` TanStack Query cache.

## Tasks / Subtasks

- [x] Task 1: Create `src/lib/atmospheric.ts` — colour extraction and contrast utilities (AC: 4, 5)
  - [x] Implement `extractPalette(imageUrl: string): Promise<AtmosphericPalette | null>` using canvas colour sampling
  - [x] Implement `getCuisineFallback(cuisineType: string): AtmosphericPalette` with hardcoded cuisine palette map
  - [x] Implement `checkWcagContrast(foreground: string, background: string): boolean` — returns true if AA passes
  - [x] Implement `getContrastRatio(fg: string, bg: string): number` using relative luminance formula
  - [x] Implement `buildTieredBackground(restaurantId?: string, cuisineType?: string, palette?: AtmosphericPalette | null): AtmosphericState` — resolves tier 1 → 2 → 3 with contrast gating

- [x] Task 2: Create `src/hooks/use-atmospheric.ts` — TanStack Query integration (AC: 7)
  - [x] Define `useAtmosphericState(restaurantId?: string)` hook
  - [x] Read from `['restaurants', restaurantId]` TanStack Query cache; do NOT fire a new network call if restaurant row already cached
  - [x] Extract `atmospheric_palette_json` from cached restaurant row; run contrast check; return resolved `AtmosphericState`
  - [x] Return `{ imageUrl, palette, tier }` — tier: `'restaurant' | 'cuisine' | 'neutral'`

- [x] Task 3: Create `src/components/layout/atmospheric-background.tsx` — the full-bleed component (AC: 1, 2, 3, 6)
  - [x] Render a fixed-position `div` covering 100vw × 100vh, z-index -1, `inset-0 fixed`
  - [x] Background defaults to `var(--bg-base)` (`#0a0a0a` dark / `#f5f5f5` light)
  - [x] When `imageUrl` is provided: render `<img>` with `object-fit: cover`, `filter: blur(48px) saturate(1.4)`, then gradient overlay layer on top
  - [x] Gradient overlay: use CSS `data-theme` attribute to apply correct dark vs light gradient
  - [x] Vignette: `radial-gradient` overlay at edges for subtle depth
  - [x] Crossfade: use framer-motion `AnimatePresence` with `key={imageUrl}` — opacity 0→1, `duration: 0.4, ease: 'easeInOut'`; this is NOT a spring animation
  - [x] Reduce Motion: when `useReducedMotion()` is true, crossfade shortens to 150ms opacity only
  - [x] Must have `aria-hidden="true"` — purely decorative

- [x] Task 4: Integrate into `src/app/layout.tsx` (AC: 6)
  - [x] Import and render `<AtmosphericBackground>` OUTSIDE `#main-content` so it is not affected by the scale transform used for BottomSheet open state (see globals.css `#main-content` transform rule)
  - [x] Position: `AtmosphericBackground` renders first, then `#main-content` wraps all page content
  - [x] Verify no horizontal overflow at 390pt viewport width

- [x] Task 5: Add CSS tokens to `src/app/globals.css` for atmospheric layer (AC: 2)
  - [x] Add `--atmospheric-gradient-dark` and `--atmospheric-gradient-light` CSS custom properties to `:root` and theme selectors
  - [x] These are not currently in globals.css — add them in the correct theme blocks

- [x] Task 6: Write tests for `src/lib/atmospheric.ts` (AC: 4, 5)
  - [x] Test `checkWcagContrast` returns true for known passing pairs (white on black)
  - [x] Test `checkWcagContrast` returns false for known failing pairs (light grey on white)
  - [x] Test `buildTieredBackground` falls back to tier 2 when tier 1 contrast fails
  - [x] Test `buildTieredBackground` returns tier 3 neutral when both tier 1 and tier 2 fail
  - [x] Test `getCuisineFallback` returns a fallback palette for known cuisine types

- [x] Task 7: Smoke test and visual verify (AC: 1, 2, 3)
  - [x] Temporarily pass a test image URL to `AtmosphericBackground` in `layout.tsx` and verify blur + gradient render
  - [x] Change the image URL and verify 400ms crossfade (no hard cut)
  - [x] Remove the image URL and verify neutral dark base (`#0a0a0a`) renders
  - [x] Remove test image URL before marking story done

## Dev Notes

### Critical Context: Layout Structure

The globals.css establishes a `#main-content` div with a CSS `transform: scale(0.95)` triggered when a BottomSheet is open (`body[data-sheet-open] #main-content`). **CSS transform creates a new stacking context** — any `position: fixed` element inside `#main-content` will not behave as truly fixed. Therefore `AtmosphericBackground` MUST be rendered **outside** `#main-content`.

Correct layout.tsx structure:
```tsx
<body>
  <AtmosphericBackground />        {/* fixed, z-index -1, outside #main-content */}
  <div id="main-content">
    {children}                     {/* scaled on sheet open */}
  </div>
  <Toaster />                      {/* also outside #main-content — same reason */}
</body>
```

### Animation: Crossfade NOT Spring

The atmospheric crossfade uses **`400ms ease` not spring physics**. This is a design token spec requirement. Use framer-motion with explicit duration + ease, not the spring config used in glass components:

```tsx
// ✅ Correct — crossfade
transition={{ duration: 0.4, ease: 'easeInOut' }}

// ❌ Wrong — do not use spring here
transition={{ type: 'spring', mass: 1, stiffness: 300, damping: 30 }}
```

When Reduce Motion is enabled: shorten to `duration: 0.15`.

### Crossfade Implementation Pattern

Use two layered images with `AnimatePresence` to crossfade between old and new:

```tsx
// Pattern: two divs layered, old fades out while new fades in
<AnimatePresence>
  {imageUrl && (
    <motion.div
      key={imageUrl}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: shouldReduceMotion ? 0.15 : 0.4, ease: 'easeInOut' }}
    >
      {/* img + gradient overlay */}
    </motion.div>
  )}
</AnimatePresence>
```

### Colour Extraction: Canvas API

For tier 1 (restaurant-specific) palette extraction, use the HTML Canvas API to sample dominant colours from the source image — no third-party library required for MVP:

```typescript
// Basic approach: draw image to offscreen canvas, sample grid of pixels, find dominant
async function extractPalette(imageUrl: string): Promise<AtmosphericPalette | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = 50; canvas.height = 50  // downsample for speed
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, 50, 50)
      const data = ctx.getImageData(0, 0, 50, 50).data
      // Sample pixels and compute average dominant colour
      // Return { dominantColor: '#rrggbb', sourceImageUrl: imageUrl }
      ...
    }
    img.onerror = () => resolve(null)
    img.src = imageUrl
  })
}
```

**Important**: Canvas extraction only works client-side. The `src/lib/atmospheric.ts` file will contain this logic but it must be called from a `'use client'` context (the hook or component), not from a Server Component or API route.

### WCAG AA Contrast Check

The contrast ratio formula uses relative luminance (WCAG 2.1):

```typescript
function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const sRGB = c / 255
    return sRGB <= 0.04045 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function getContrastRatio(fg: string, bg: string): number {
  // Parse hex to RGB, get luminances, return (L1 + 0.05) / (L2 + 0.05)
}

// WCAG AA thresholds:
// Normal text: 4.5:1
// Large text (≥18pt or ≥14pt bold) and UI components: 3:1
```

The check that matters for this story: `text-primary` (`rgba(255,255,255,1.0)` in dark) over the composite background (source image + gradient overlay). The gradient overlay (`rgba(0,0,0,0.65)` at the bottom) ensures most text regions will pass — but the contrast gate must still run before applying any new palette.

### Three-Tier Fallback System

```
Tier 1: Restaurant-specific (imageUrl from restaurants.atmospheric_palette_json)
  → Extract palette from image
  → Run contrast check: if PASS → apply; if FAIL → drop to tier 2

Tier 2: Cuisine-type fallback palette (hardcoded per cuisine)
  → Look up cuisine type in fallback map
  → Run contrast check: if PASS → apply; if FAIL → drop to tier 3

Tier 3: Neutral dark base (#0a0a0a)
  → Always passes contrast (white text on near-black)
  → Apply with no image
```

Cuisine fallback palette map (minimum set for MVP):
```typescript
const CUISINE_FALLBACKS: Record<string, string> = {
  italian: '#1a0f08',     // warm dark brown
  japanese: '#0a0f1a',    // cool dark blue
  french: '#0f1208',      // dark earthy green
  mexican: '#1a0a00',     // deep warm orange-brown
  american: '#0d0d0d',    // neutral dark
  chinese: '#1a0808',     // deep red-black
  indian: '#1a0c00',      // warm spiced dark
  default: '#0a0a0a',     // same as tier 3
}
```

The tier applied must be logged: `console.debug('[atmospheric] tier applied:', tier, { restaurantId, imageUrl })`

### AtmosphericPalette Type

Define in `src/types/domain.ts` (add to existing file, do not create a new one):

```typescript
export type AtmosphericPalette = {
  dominantColor: string           // hex color of dominant extracted colour
  sourceImageUrl: string          // the image URL used for extraction
}

export type AtmosphericState = {
  imageUrl: string | null         // null for tier 3 (neutral)
  palette: AtmosphericPalette | null
  tier: 'restaurant' | 'cuisine' | 'neutral'
  backgroundColorFallback: string // the hex base color (tier 2/3 color)
}
```

### File Locations (Architecture Spec)

Per `_bmad-output/planning-artifacts/architecture.md`:
- `src/components/layout/atmospheric-background.tsx` ← the component
- `src/hooks/use-atmospheric.ts` ← TanStack Query hook
- `src/lib/atmospheric.ts` ← pure utility functions (colour extraction, contrast)

**Deviation noted:** Story 1.2 placed `bottom-sheet.tsx` in `src/components/layout/` rather than `src/components/ui/` as the architecture specified. Do NOT move it — follow the existing pattern for layout components.

### TanStack Query Cache Key

```typescript
// ✅ Correct key for restaurant data
['restaurants', restaurantId]  // defined in architecture.md — do NOT invent new shape
```

The hook reads from this key without firing a new fetch if already cached (staleTime is 5 minutes per the QueryClient config in providers.tsx). Only fire a `useQuery` if restaurantId is defined:

```typescript
const { data: restaurant } = useQuery({
  queryKey: ['restaurants', restaurantId],
  queryFn: () => fetchRestaurant(restaurantId!),
  enabled: !!restaurantId,
  staleTime: 5 * 60 * 1000,
})
```

For this story, the atmospheric palette comes from `restaurant.atmospheric_palette_json`. The story does NOT need to implement the full restaurants API route (that's a later story) — the hook should gracefully handle `undefined` restaurant data by falling back to tier 3.

### Existing Dependencies (Already Installed)

- `framer-motion` — already in use by `glass-card.tsx` and `bottom-sheet.tsx`
- `@tanstack/react-query` — already configured via `providers.tsx`
- No new packages needed for this story

### CSS: Full-Bleed Behind Safe Areas

To extend behind the iOS status bar and home indicator:

```css
/* In component inline styles or a CSS class */
position: fixed;
inset: 0;  /* top: 0, right: 0, bottom: 0, left: 0 */
width: 100%;
height: 100%;
/* Do NOT use env(safe-area-inset-*) here — atmospheric background should bleed under them */
```

The `z-index` must be negative (`z-index: -1`) so all page content renders above it.

### Light / Dark Mode Gradient

The component must apply the correct gradient based on the current theme. Read the theme from `document.documentElement.dataset.theme` or a CSS class. Use Tailwind's `dark:` variant or CSS `data-theme` selector:

```tsx
// Option A: Tailwind dark: variant (preferred)
<div className="bg-gradient-to-b from-transparent to-black/65 dark:to-black/65 to-white/45" />

// Option B: inline style with CSS var (consistent with existing token approach)
// Add --atmospheric-gradient to globals.css and reference via CSS var
```

Dark mode gradient: `linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 100%)`
Light mode gradient: `linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.45) 100%)`

### Existing Code Patterns to Follow

**From `glass-card.tsx`:**
- `'use client'` directive at top
- `useReducedMotion()` from framer-motion for motion accessibility
- `cn()` utility from `@/lib/utils` for className composition
- framer-motion `motion.div` with `initial`, `animate`, `transition` props

**From `globals.css`:**
- Design tokens use CSS custom properties (`--bg-base`, `--text-primary`, etc.)
- Theme switching via `[data-theme="dark"]` and `[data-theme="light"]` data attributes
- Glass styles are in `@layer components` — add any new atmospheric CSS here

### Project Structure Notes

**Files to create:**
```
src/
  components/
    layout/
      atmospheric-background.tsx   ← new (pure UI, 'use client')
  hooks/
    use-atmospheric.ts             ← new ('use client')
  lib/
    atmospheric.ts                 ← new (client-side utility, no 'server-only')
```

**Files to modify:**
```
src/
  app/
    layout.tsx                     ← add AtmosphericBackground outside #main-content
    globals.css                    ← add atmospheric gradient CSS vars
  types/
    domain.ts                      ← add AtmosphericPalette and AtmosphericState types
```

**Files to add tests in:**
```
src/
  lib/
    atmospheric.test.ts            ← new
```

**NEVER modify:**
- `src/components/ui/` — glass components are done; do not touch
- `src/lib/supabase.ts` — singleton; do not touch
- `src/lib/api-keys.ts` — server-only helper; do not touch
- `_bmad-output/`, `_archive/`, `references/`, `.claude/`

### Architecture Enforcement Rules

| Rule | Enforcement |
|------|-------------|
| Supabase client | Import from `@/lib/supabase` only; never inline `createClient()` |
| API responses | `{ data: T }` or `{ error, code }` only |
| TanStack Query keys | Use `['restaurants', restaurantId]` — no new shapes |
| Complex types | In `src/types/domain.ts` — no inline types |
| Canvas API | Client-side only — call from `'use client'` component or hook, not Server Component |
| atmospheric.ts | NO `'server-only'` import — it uses browser APIs (Canvas, Image) |

### Anti-Patterns to Prevent

```typescript
// ❌ Do NOT put AtmosphericBackground inside #main-content
<div id="main-content">
  <AtmosphericBackground />  // broken: fixed positioning fails under transform
  {children}
</div>

// ✅ Put it outside
<AtmosphericBackground />
<div id="main-content">{children}</div>

// ❌ Do NOT use spring animation for crossfade
transition={{ type: 'spring', mass: 1, stiffness: 300, damping: 30 }}

// ✅ Use 400ms ease crossfade per design token spec
transition={{ duration: 0.4, ease: 'easeInOut' }}

// ❌ Do NOT import 'server-only' in atmospheric.ts — it uses Canvas API
import 'server-only'  // would break since Canvas is browser-only

// ❌ Do NOT invent new TanStack Query key shapes
['restaurant', id]      // wrong
['restaurant-data', id] // wrong

// ✅ Use defined key
['restaurants', restaurantId]
```

### References

- Architecture: [_bmad-output/planning-artifacts/architecture.md](_bmad-output/planning-artifacts/architecture.md) — atmospheric theming pipeline, `src/lib/atmospheric.ts`, `src/hooks/use-atmospheric.ts`
- UX Spec: [_bmad-output/planning-artifacts/ux-design-specification.md](_bmad-output/planning-artifacts/ux-design-specification.md) — Atmospheric Background section (line ~1181), Core Components section (line ~666)
- Epics: [_bmad-output/planning-artifacts/epics.md](_bmad-output/planning-artifacts/epics.md) — Epic 1, Story 1.3; UX-DR1
- Previous story (1.2): Story file not found in implementation-artifacts (was reviewed inline in session); refer to existing code in `src/components/layout/` and `src/app/globals.css` for patterns
- Current layout.tsx: Check `src/app/layout.tsx` before editing — understand existing `#main-content` structure

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

No blocking issues encountered.

### Completion Notes List

- Implemented full three-tier atmospheric background system (restaurant → cuisine → neutral).
- `src/lib/atmospheric.ts`: pure browser-side utilities — canvas extraction, WCAG AA contrast check, cuisine fallback map, tiered builder with console.debug tier logging.
- `src/hooks/use-atmospheric.ts`: reads from `['restaurants', restaurantId]` TanStack Query cache; does not trigger network calls; falls back gracefully to tier 3 when no data.
- `src/components/layout/atmospheric-background.tsx`: fixed full-bleed component, z-index -1, outside `#main-content`, `aria-hidden`, 400ms ease crossfade via `AnimatePresence`, reduces to 150ms when `useReducedMotion()` is true.
- Added `--atmospheric-gradient`, `--atmospheric-gradient-dark`, `--atmospheric-gradient-light` CSS tokens to all three theme blocks in globals.css.
- All 48 tests pass (17 new tests in `atmospheric.test.ts`), no regressions.
- Pre-existing TypeScript error in `bottom-sheet.tsx` (Story 1.2, framer-motion ease type) not introduced by this story.

### File List

- src/lib/atmospheric.ts (created)
- src/lib/atmospheric.test.ts (created)
- src/hooks/use-atmospheric.ts (created)
- src/components/layout/atmospheric-background.tsx (created)
- src/types/domain.ts (modified — added AtmosphericPalette and AtmosphericState types)
- src/app/layout.tsx (modified — added AtmosphericBackground outside #main-content)
- src/app/globals.css (modified — added atmospheric gradient CSS custom properties)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified — status: in-progress → review)

### Change Log

- 2026-03-20: Implemented Story 1.3 Atmospheric Background System — colour extraction utilities, WCAG AA contrast gating, three-tier fallback system, full-bleed background component with 400ms crossfade, TanStack Query cache integration, CSS tokens. All 17 new tests pass, 48 total.
