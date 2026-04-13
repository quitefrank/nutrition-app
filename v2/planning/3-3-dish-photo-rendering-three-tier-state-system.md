# Story 3.3: Dish Photo Rendering — Three-Tier State System

Status: done
Epic: 3 — Dish Photos, USDA Nutrition & Portion Control
Story ID: 3.3
Story Key: 3-3-dish-photo-rendering-three-tier-state-system
Created: 2026-04-12

---

## Story

As a user,
I want to see a real photo of every recognised dish, a warm styled placeholder when no photo is available, and no card at all for unrecognised dishes,
So that my dish list is always visually coherent — no broken images or empty slots.

---

## Acceptance Criteria

**AC1 — Confirmed state: full-bleed photo**
**Given** a dish has `photo_status: 'confirmed'` and a valid `dishImageUrl`
**When** the dish card renders
**Then** a full-bleed photo is displayed in the 72×72px thumbnail (DishRowCompact) or 156px hero area (DishRowExpanded); no overlay or label obscures the photo

**AC2 — Placeholder state: warm tile with "No photo available"**
**Given** a dish has `photo_status: 'placeholder'`
**When** the dish card renders
**Then** a warm tile is shown using `--color-bg-elevated` background, a subtle plate silhouette icon at 60% opacity, and a "No photo available" label at 11px in `--color-text-tertiary`; the card layout is identical to a confirmed photo card (no layout shift between states)

**AC3 — Suppressed state: no card rendered**
**Given** a dish has `photo_status: 'suppressed'`
**When** the dish list renders
**Then** no card is rendered for that dish; no empty slot, skeleton, or placeholder card appears in its place

**AC4 — Photo fetch failure: degrade to warm placeholder**
**Given** a dish has `photo_status: 'confirmed'` but the `<img>` URL fails to load at render time (network error, 404, etc.)
**When** the image triggers an `onError` event
**Then** the card immediately shows the warm placeholder tile (same as AC2); no broken `<img>` element is visible to the user

**AC5 — Correct accessible name on placeholder**
**Given** a dish renders in placeholder state
**When** inspected for accessibility
**Then** the placeholder tile has an accessible label that does NOT say "loading" — it uses `aria-label="No photo for [dish name]"` or similar non-loading language

---

## This Is Brownfield — Audit First, Fix Second

**`src/components/ui/PhotoFrame.tsx` already exists** with a partial implementation covering the three states. Do NOT reinvent it. Your task is to fix the four documented gaps and add a comprehensive test file.

### What is already correctly implemented

| Feature | Notes |
|---------|-------|
| `suppressed` → `return null` | Correct — do not change |
| `confirmed` + valid URL → renders `<Image>` | Correct — keep `fill`, `sizes`, `unoptimized`, `object-cover` |
| `placeholder` → renders a div with `PlateIcon` | Exists but needs fixes (see gaps below) |
| `PlateIcon` SVG component | Correct — do not change |

### Gaps to fix

**GAP 1 — No `onError` handler (AC4 violation)**

The `confirmed` branch renders `<Image>` with no error handling. If the URL is stale, 404'd, or the CDN times out, the browser shows a broken image icon.

**Fix:** Add `useState<boolean>(false)` for `imageError`. Set it to `true` in `<Image onError={() => setImageError(true)}>`. When `imageError` is `true`, fall through to the placeholder render instead of the image.

```typescript
// Add at the top of the component function:
const [imageError, setImageError] = useState(false)

// In the confirmed branch:
if (photoStatus === "confirmed" && dishImageUrl && !imageError) {
  return (
    <div className={`relative overflow-hidden rounded-xl ${className ?? ""}`}>
      <Image
        src={dishImageUrl}
        alt={dishName}
        fill
        sizes="(max-width: 768px) 50vw, 33vw"
        className="object-cover"
        unoptimized
        onError={() => setImageError(true)}
      />
    </div>
  )
}
// Falls through to placeholder render below
```

**GAP 2 — Wrong placeholder background (AC2 violation)**

Current: `bg-white/10` — a cold white tint, does not match the warm cream design system.

**Fix:** Replace `bg-white/10` with inline style `background: "var(--color-bg-elevated)"`.

**GAP 3 — Missing "No photo available" label (AC2 violation)**

The UX spec (UX-DR23) requires a "No photo available" label at 11px below the plate icon. Currently absent.

**Fix:** Add a `<span>` below `<PlateIcon />`:

```typescript
<span
  style={{
    fontSize: 11,
    color: "var(--color-text-tertiary)",
    marginTop: 4,
    textAlign: "center",
    lineHeight: 1.3,
  }}
>
  No photo available
</span>
```

The placeholder container must use `flex-col` to stack the icon and label vertically.

**GAP 4 — Wrong `aria-label` on placeholder (AC5 violation)**

Current: `aria-label="Photo loading for ${dishName}"` — incorrect; the dish is not loading, it simply has no photo.

**Fix:** Change to `aria-label={`No photo for ${dishName}`}`.

### Complete fixed placeholder render

```typescript
// placeholder — no photo available (or confirmed URL failed to load)
return (
  <div
    className={`flex flex-col items-center justify-center rounded-xl ${className ?? ""}`}
    aria-label={`No photo for ${dishName}`}
    style={{ background: "var(--color-bg-elevated)" }}
  >
    <PlateIcon />
    <span
      style={{
        fontSize: 11,
        color: "var(--color-text-tertiary)",
        marginTop: 4,
        textAlign: "center",
        lineHeight: 1.3,
      }}
    >
      No photo available
    </span>
  </div>
)
```

### useState import

`useState` must be imported from React. `PhotoFrame.tsx` currently has no React imports (it uses Next.js Image and a local type). Add:

```typescript
import { useState } from "react"
```

---

## Existing Integration — No Changes Needed

The parent components already integrate PhotoFrame correctly:

| Component | Already correct? | Notes |
|-----------|-----------------|-------|
| `DishRowCompact.tsx` | ✅ Yes | Line ~42: `if (recipe.photoStatus === "suppressed") return null` + PhotoFrame at 72×72px |
| `DishRowExpanded.tsx` | ✅ Yes | Line ~80: `{recipe.photoStatus !== "suppressed" && (...)}` + PhotoFrame at full height |

**Do NOT modify `DishRowCompact.tsx` or `DishRowExpanded.tsx`** — they are already correct consumers of `PhotoFrame`.

---

## Tests Required

**Test file location:** `src/components/ui/PhotoFrame.test.tsx` — **new file** (does not exist)

The test file covers all states and the error fallback. Use `vi.mock("next/image")` to make `<Image>` testable in Vitest.

### Mock setup

```typescript
// At the top of the test file, before imports:
vi.mock("next/image", () => ({
  default: ({ src, alt, onError, ...rest }: {
    src: string; alt: string; onError?: () => void; fill?: boolean; className?: string; unoptimized?: boolean
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onError={onError} data-testid="dish-image" {...rest} />
  ),
}))
```

### Required test cases

```
describe('PhotoFrame')
  ├── confirmed state: renders img with correct src and alt
  ├── confirmed state: no placeholder label rendered
  ├── placeholder state: renders "No photo available" text
  ├── placeholder state: does NOT render an img element
  ├── placeholder state: aria-label does not contain "loading"
  ├── suppressed state: renders nothing (returns null)
  ├── error fallback: when confirmed img fires onError, shows placeholder label
  ├── error fallback: after onError, no img element visible
  └── error fallback: placeholder aria-label present after onError
```

### Testing approach notes

- **Confirmed state**: render with `photoStatus="confirmed"` and `dishImageUrl="https://example.com/photo.jpg"`. Assert `screen.getByTestId('dish-image')` has `src="https://example.com/photo.jpg"`. Assert `screen.queryByText('No photo available')` is null.
- **Placeholder state**: render with `photoStatus="placeholder"`. Assert `screen.getByText('No photo available')` exists. Assert `screen.queryByTestId('dish-image')` is null.
- **Placeholder aria-label**: `screen.getByLabelText(/no photo for/i)` — must match, not contain "loading".
- **Suppressed state**: `const { container } = render(...)`. Assert `container.firstChild` is null.
- **Error fallback**: render confirmed state, then `fireEvent.error(screen.getByTestId('dish-image'))`. After firing, assert "No photo available" text appears and no img is in the DOM.

### Fixture

```typescript
const defaultProps = {
  dishName: "Pad Thai",
  className: "w-[72px] h-[72px]",
}
```

---

## Architecture Guardrails

- **`useState` is required for image error** — The `onError` handler must use `useState` to track the error; no `useRef`, no class-based error boundary.
- **Both confirmed and placeholder use the same outer shape** — The placeholder tile must occupy the same bounding box as a photo card; do not add extra margin or change `className` handling between states.
- **`--color-bg-elevated` not a class** — This token is a CSS custom property; use `style={{ background: "var(--color-bg-elevated)" }}`, not a Tailwind class.
- **`PlateIcon` is `aria-hidden="true"`** — The SVG has `aria-hidden="true"` already; the accessible name comes from the container's `aria-label`, not the icon.
- **No PII in logs (SEC-DAT-1.00)** — `onError` sets state only; do not log the failed URL or dish name.
- **`next/image` must stay** — Do not replace `<Image>` with a plain `<img>` tag. Only the error fallback path drops back to the placeholder div.
- **`unoptimized` prop stays** — Google Places CDN URLs are external; `unoptimized` is required to bypass Next.js image optimization for third-party URLs.

---

## File Scope

### Files to modify

| File | Change |
|------|--------|
| `src/components/ui/PhotoFrame.tsx` | Add `imageError` state, `onError` handler, fix placeholder background, add "No photo available" label, fix `aria-label` |

### Files to create

| File | Change |
|------|--------|
| `src/components/ui/PhotoFrame.test.tsx` | New — 9 test cases covering all three states and error fallback |

### Files NOT to touch

| File | Reason |
|------|--------|
| `src/components/scan/DishRowCompact.tsx` | Already correctly integrates PhotoFrame |
| `src/components/scan/DishRowExpanded.tsx` | Already correctly integrates PhotoFrame |
| `src/components/ui/MacroBar.tsx` | Not in scope |
| `src/types/database.ts` | PhotoStatus enum already defined correctly |
| `planning/sprint-status.yaml` | Do not update sprint status |

---

## Definition of Done

- [x] `PhotoFrame` renders a full-bleed `<Image>` (with `onError` handler) when `photoStatus === "confirmed"` and `dishImageUrl` is non-null and the image has not errored
- [x] `PhotoFrame` renders the warm placeholder tile (cream `--color-bg-elevated` background, plate silhouette, "No photo available" 11px label) when `photoStatus === "placeholder"` OR when the confirmed image fires `onError`
- [x] `PhotoFrame` returns `null` (renders nothing) when `photoStatus === "suppressed"`
- [x] Placeholder tile `aria-label` is `"No photo for [dishName]"` — does not contain the word "loading"
- [x] Placeholder container uses `flex-col` to vertically stack icon + label
- [x] Background token is `var(--color-bg-elevated)` via inline style — no `bg-white/10` Tailwind class remains
- [x] All 9 test cases in `PhotoFrame.test.tsx` pass
- [x] TypeScript strict mode passes with no new errors

---

## Dev Agent Record

### File List

| File | Change |
|------|--------|
| `src/components/ui/PhotoFrame.tsx` | Modified — added `imageError` state + `onError` handler; fixed placeholder background to `var(--color-bg-elevated)`; added "No photo available" label; changed `aria-label` to `"No photo for ${dishName}"`; added `flex-col` to placeholder container |
| `src/components/ui/PhotoFrame.test.tsx` | Created — 9 test cases covering all three states and error fallback |
| `src/components/scan/DishRowCompact.test.tsx` | Updated — one test updated to match new `aria-label` pattern (`/no photo for/` instead of `/photo loading for/`) |

### Change Log

- 2026-04-12: Story 3.3 — Fixed 4 gaps in `PhotoFrame.tsx` (GAP 1: onError fallback, GAP 2: warm background token, GAP 3: "No photo available" label, GAP 4: correct aria-label). Created `PhotoFrame.test.tsx` with 9 test cases. Updated `DishRowCompact.test.tsx` aria-label assertion to match. All 339 tests pass.

### Completion Notes

**Implementation summary:**

Fixed all four documented gaps in `src/components/ui/PhotoFrame.tsx`:

1. **GAP 1 (AC4)** — Added `useState<boolean>(false)` for `imageError`. Added `onError={() => setImageError(true)}` to the `<Image>` component. The confirmed branch now checks `!imageError`; when the image errors, the component falls through to the placeholder render.

2. **GAP 2 (AC2)** — Replaced `bg-white/10` Tailwind class with `style={{ background: "var(--color-bg-elevated)" }}`. The placeholder div now uses a warm cream background matching the design system token.

3. **GAP 3 (AC2)** — Added `flex-col` to the placeholder container and a `<span>` with `"No photo available"` text (11px, `--color-text-tertiary`, 4px margin-top).

4. **GAP 4 (AC5)** — Changed `aria-label` from `"Photo loading for ${dishName}"` to `"No photo for ${dishName}"`.

**Tests created:** `src/components/ui/PhotoFrame.test.tsx` — 9 test cases using `vi.mock("next/image")` to render a plain `<img>` with `data-testid="dish-image"` for testability.

**Regression fix:** Updated one assertion in `DishRowCompact.test.tsx` that was testing the old aria-label text; it now correctly matches `/no photo for pad thai/i`.

