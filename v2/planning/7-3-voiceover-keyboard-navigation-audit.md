# Story 7.3: VoiceOver & Keyboard Navigation Audit

Status: ready-for-dev
Epic: 7 — Accessibility, Offline & Production Hardening
Story ID: 7.3
Story Key: 7-3-voiceover-keyboard-navigation-audit
Created: 2026-04-13

---

## Story

As a user relying on VoiceOver or keyboard navigation,
I want all core app flows to be fully operable without a display,
So that the app is usable regardless of how I interact with my device.

---

## Acceptance Criteria

**AC1 — Logical reading order and dish card announcements**
**Given** VoiceOver is enabled on iOS
**When** the user navigates the home screen, restaurant dish list, and My Recipes
**Then** all content is announced in a logical reading order; dish cards announce name and calorie count; `DishRowCompact` announces via `aria-label="[Dish name], [cal] calories"` and its expanded state is announced via `aria-expanded`

**AC2 — Async state changes use text content mutation, not aria-label mutation (NFR13)**
**Given** async state changes occur (enrichment resolving, scan confidence banner appearing, processing strip state transitions)
**When** content updates
**Then** changes are announced via `aria-live="polite"` text content mutation — NOT `aria-label` attribute mutation; no async announcement path mutates an `aria-label` attribute to trigger VoiceOver

**AC3 — ScanConfidenceBanner announced assertively without focus disruption**
**Given** the `ScanConfidenceBanner` appears
**When** VoiceOver is active
**Then** it is announced immediately via `role="alert"` and `aria-live="assertive"`; focus is not moved or disrupted for other interactive content on the screen

**AC4 — All interactive elements have meaningful accessible names**
**Given** the FloatingNavBar (TabBar), camera FAB, and all primary controls
**When** traversed with VoiceOver
**Then** every interactive element has a meaningful accessible name; no element is announced as "button" without context; the camera button announces as "Scan a menu" (online) or "Camera unavailable — no internet connection" (offline)

---

## What This Story Changes

This story is an **audit and remediation** pass, not a net-new feature. The dev agent systematically checks every component against the ARIA roles specified in the UX spec, verifies correct NFR13 implementation (text content mutation vs. `aria-label` mutation for async announcements), confirms `focus-visible` is used correctly throughout, and fixes any violations found.

---

## Pre-Audit Findings — Known Violations

The following were identified during story authoring from codebase analysis. The dev agent must verify these against current code before applying fixes, as prior stories may have already addressed them.

---

### Violation 1: ProcessingStrip announces via aria-label mutation (NFR13 — CONFIRMED)

**File:** `src/components/layout/ProcessingStrip.tsx`, lines 68–72
**Current code:**
```typescript
<motion.div
  role="status"
  aria-live="polite"
  aria-label={message ?? config.label}
  ...
>
  <span className="flex-shrink-0">{config.icon}</span>
  <span className="flex-1 text-sm font-medium truncate" ...>
    {message ?? config.label}
  </span>
```

**Violation:** The component has `aria-live="polite"` AND `aria-label` set to the current label text simultaneously. When `state` transitions (e.g. `processing` → `ready` → `error`), React re-renders and the `aria-label` attribute value changes. VoiceOver on iOS does not reliably announce `aria-label` attribute mutations — it only announces text content changes inside `aria-live` regions. The visible text span already contains the label text, so `aria-label` on the container is redundant and creates the NFR13 anti-pattern.

**Fix:** Remove `aria-label` from the `motion.div`. The `aria-live="polite"` region works via text content — the `<span>` child already contains `{message ?? config.label}`. The text content mutation fires the announcement correctly. No change to visual rendering.

---

### Violation 2: ScanConfirmationOverlay aria-live on static element (MINOR — verify)

**File:** `src/components/scan/ScanConfirmationOverlay.tsx`, line 156
**Current code:**
```typescript
<p
  className="text-sm"
  style={{ color: "var(--color-text-secondary)" }}
  aria-live="polite"
>
  Saving dishes…
</p>
```

**Note:** The text "Saving dishes…" is static inside a `<p>` that only mounts once. The `aria-live` here is applied to an element whose text never changes — it will not announce on re-render unless the element unmounts and remounts. Verify whether this paragraph appears/disappears conditionally. If it only mounts once with static text, the `aria-live` is harmless but ineffective. If the text changes, it is an NFR13 candidate. Document the finding.

---

### Violation 3: edit/page.tsx aria-live paired with aria-label on same element (NFR13 — verify)

**File:** `src/app/recipe/[id]/edit/page.tsx`, lines 500–506
**Current code:**
```typescript
<span
  className="text-2xl font-semibold tabular-nums w-8 text-center"
  style={{ ... }}
  aria-live="polite"
  aria-label={`${servings} serving${servings !== 1 ? 's' : ''}`}
>
  {servings}
</span>
```

**Violation:** `aria-live="polite"` is combined with `aria-label` on the same element, and `aria-label` is dynamic (it includes `servings` count). When servings changes, both the text content AND the `aria-label` attribute mutate. VoiceOver may announce the `aria-label` value instead of the text content, which is the NFR13 anti-pattern. The text content (`{servings}`) alone is sufficient for announcement inside the `aria-live` region.

**Fix:** Remove `aria-label` from this element. The text content `{servings}` will be announced by the `aria-live` region. If a more descriptive announcement is needed (e.g. "3 servings" rather than just "3"), change the visible text to `{servings} serving{servings !== 1 ? 's' : ''}` and drop the `aria-label`.

---

## Pre-Audit Findings — Items to Verify Only (likely compliant)

The following were identified during story authoring as likely already compliant based on codebase analysis. The dev agent must confirm each.

| Component / Location | What to check | Why likely compliant |
|---------------------|--------------|----------------------|
| `ScanConfidenceBanner.tsx` | `role="alert"`, `aria-live="assertive"` present | Confirmed in code: line 50–51 |
| `AutoCaptureToast.tsx` | `role="status"`, `aria-live="polite"`, text content announcement | Confirmed: line 37–38; text content renders label string directly |
| `DishRowCompact.tsx` | `role="button"`, `aria-expanded`, `aria-label="[name], [cal] calories"` | Confirmed: lines 59–66; aria-label is static computed value at render time, not mutated async |
| `DishRowExpanded.tsx` — save state live region | Uses `aria-live="polite"` `aria-atomic="true"` with text content mutation (not aria-label mutation) | Confirmed: lines 318–321 — correct NFR13 pattern |
| `TabBar.tsx` — camera FAB | `aria-label="Scan a menu"` (or offline variant); `aria-disabled` when offline | Confirmed: lines 73–76; offline path sets descriptive label |
| `TabBar.tsx` — tab items | `aria-current="page"` on active tab | Confirmed: line 134 |
| `HomeSection.tsx` | `role="region"` + `aria-label={title}` | Confirmed: line 25 |
| `HeroCard.tsx` | `role="article"`, `aria-label="[Restaurant name], last visited [time]"` | Confirmed: lines 88–91; keyboard handler via `onKeyDown` present |
| `HeroCard.tsx` — View all button | `aria-label="View all dishes at [restaurant name]"` | Confirmed: line 222 |
| `TabBar.tsx` nav icons | `aria-hidden="true"` on all SVG icons | Confirmed throughout |
| `DishRowExpanded.tsx` — collapse button | `aria-label="Collapse"` | Confirmed: line 178 |
| `DishRowExpanded.tsx` — portion stepper | `role="group"` + `aria-label="Serving size"`, each button has `aria-pressed` | Confirmed: lines 220–231 |
| `ProcessingStrip.tsx` — icons | `aria-hidden="true"` on all icon SVGs | Confirmed throughout |
| `FAB.tsx` | `aria-label` prop (default "Scan or upload") | Confirmed: line 12 |

---

## Audit Scope — All Components to Verify

The dev agent must read and verify the following files. Mark each as "compliant" or "violation found" in the Dev Agent Record.

### Layout components
- `src/components/layout/TabBar.tsx`
- `src/components/layout/FAB.tsx`
- `src/components/layout/ProcessingStrip.tsx`

### Screen files
- `src/components/screens/HomeScreen.tsx`
- `src/components/screens/RestaurantScreen.tsx`
- `src/components/screens/RecipesScreen.tsx`
- `src/components/screens/SearchScreen.tsx`
- `src/components/screens/GroceryScreen.tsx`
- `src/components/screens/SettingsScreen.tsx`
- `src/components/screens/ImportScreen.tsx`
- `src/components/screens/RestaurantCollectionScreen.tsx`
- `src/app/recipe/[id]/page.tsx`
- `src/app/recipe/[id]/edit/page.tsx`

### Scan and capture components
- `src/components/scan/DishRowCompact.tsx`
- `src/components/scan/DishRowExpanded.tsx`
- `src/components/scan/ScanConfidenceBanner.tsx`
- `src/components/scan/AutoCaptureToast.tsx`
- `src/components/scan/ScanConfirmationOverlay.tsx`
- `src/components/scan/InferenceState.tsx`
- `src/components/scan/TipBanner.tsx`
- `src/components/scan/PartialResultsBanner.tsx`
- `src/components/scan/RestaurantConfirmation.tsx`
- `src/components/scan/ManualDishEntrySheet.tsx`
- `src/components/capture/CameraModal.tsx`

### UI components
- `src/components/ui/MacroBar.tsx`
- `src/components/ui/HomeSection.tsx`
- `src/components/ui/HeroCard.tsx`
- `src/components/ui/PhotoFrame.tsx`
- `src/components/ui/RecipeGridCard.tsx`
- `src/components/ui/RestaurantGridCard.tsx`
- `src/components/ui/DishCard.tsx`
- `src/components/ui/FrostedCard.tsx`
- `src/components/ui/BottomSheet.tsx`
- `src/components/ui/ErrorState.tsx`
- `src/components/ui/SearchBar.tsx`
- `src/components/ui/SwipeToDelete.tsx`
- `src/components/ui/RemoveRestaurantSheet.tsx`
- `src/components/ui/RestaurantSearchResult.tsx`

### Other
- `src/components/banners/SmartBanner.tsx`
- `src/components/pwa/InstallPromptBanner.tsx`

---

## NFR13 — Critical: Async Announcements via Text Content Mutation

### The v1 Regression

The v1 app announced async state changes by mutating `aria-label` attributes. For example, a processing strip would change from `aria-label="Processing…"` to `aria-label="Ready — tap to view"` as state progressed.

**VoiceOver on iOS does NOT reliably announce `aria-label` attribute mutations.** It only announces changes to text content inside `aria-live` regions. This is a known iOS assistive technology behaviour difference from desktop screen readers.

### Wrong Pattern (NFR13 Violation)

```typescript
// WRONG — aria-label mutation does not trigger VoiceOver announcement
<div
  role="status"
  aria-live="polite"
  aria-label={dynamicLabel}  // ← mutating this does NOT announce on iOS VoiceOver
>
  <Icon />
  <span>{dynamicLabel}</span>
</div>
```

The `aria-label` overrides the accessible name computed from text content. When the attribute mutates, VoiceOver does not fire an announcement. The `aria-live` region is effectively silenced because the accessible name is sourced from `aria-label`, not from the child text nodes.

### Correct Pattern (NFR13 Compliant)

```typescript
// CORRECT — text content mutation inside aria-live triggers VoiceOver announcement
<div
  role="status"
  aria-live="polite"
  // No aria-label here — the accessible name comes from visible text children
>
  <Icon aria-hidden="true" />
  <span>{dynamicLabel}</span>  {/* ← mutating this text content DOES announce */}
</div>
```

The `aria-live` region monitors child text node changes. When `dynamicLabel` changes, the span's text content mutates, and VoiceOver fires the announcement.

### Where to Look for NFR13 Violations

Search for elements that combine ALL THREE of:
1. `aria-live` attribute (any value)
2. `aria-label` attribute (or `aria-labelledby` pointing to dynamic content)
3. A dynamic value in the `aria-label` (i.e., template string or state variable)

**Confirmed violation in this codebase:**
- `src/components/layout/ProcessingStrip.tsx` — `aria-live="polite"` + `aria-label={message ?? config.label}` where both `message` and `config.label` are dynamic state-derived values

**Likely violation requiring verification:**
- `src/app/recipe/[id]/edit/page.tsx` — `aria-live="polite"` + `aria-label={`${servings} serving…`}` on the servings counter

**Correct implementations (do not change):**
- `src/components/scan/DishRowExpanded.tsx` — `aria-live="polite"` sr-only div with text content only; no `aria-label` on the live region
- `src/components/scan/AutoCaptureToast.tsx` — `aria-live="polite"` with text content children; no `aria-label` override
- `src/components/scan/ScanConfidenceBanner.tsx` — `role="alert"` `aria-live="assertive"` with text content; no `aria-label` override

### Distinguishing Safe From Unsafe aria-label Use

`aria-label` is safe and correct when:
- Applied to a button/link with no text child (icon-only buttons)
- Applied to a landmark region to name it (e.g. `<nav aria-label="Main navigation">`)
- The element is NOT also an `aria-live` region
- The value is NOT mutated to signal async state changes

`aria-label` is an NFR13 violation when:
- Applied to an element that ALSO has `aria-live`
- The value is dynamic and changes to communicate async state transitions

---

## FilterPillRow — Missing Implementation

**The UX spec defines** `FilterPillRow` with `role="group"` + `aria-label="Filter by category"` and each pill as `role="radio"` with `aria-checked`. However, a search of the codebase found no `FilterPillRow` component. This feature may not yet be implemented.

**Dev agent action:** Search for any category filter or pill row component across all screen files. If found, verify it implements the UX spec ARIA pattern (`role="group"`, pill `role="radio"` or `role="button"` with `aria-checked`/`aria-pressed`). If `FilterPillRow` does not exist yet, document this in the Dev Agent Record as "not yet implemented — no action required".

---

## Focus Indicator Verification (UX-DR27)

The UX spec requires keyboard focus rings to be visible on keyboard navigation only — NOT after tap. This is implemented via CSS `:focus-visible` pseudo-class, not `:focus`.

`globals.css` defines a global `:focus-visible` rule using `box-shadow` with `var(--color-accent)` as the ring colour. The audit must verify:

1. No component explicitly suppresses focus rings with `outline: none` or `outline: 0` without providing a `:focus-visible` replacement
2. No component uses `:focus` instead of `:focus-visible` for ring styles (`:focus` shows rings after tap, which is incorrect)
3. `RecipeGridCard.tsx` uses `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]` as a Tailwind local override — this is acceptable and equivalent to the global
4. `FrostedCard.tsx` in `RestaurantScreen.tsx` uses `focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none` — confirm this pattern is present

**Search pattern:** grep for `outline: none`, `outline: 0`, and `outline-none` in components that have interactive role (`role="button"`, `tabIndex`, or `<button>`) and verify each has a `:focus-visible` ring equivalent.

---

## Dev Notes

### Implementing the aria-live Text Content Pattern

When a component needs to announce async state to VoiceOver, the pattern is:

```typescript
// Persistent live region — always in the DOM, changes text content only
<div
  aria-live="polite"
  aria-atomic="true"
  className="sr-only"    // Visually hidden but available to screen readers
>
  {announcementText}     {/* Change this string to trigger announcement */}
</div>

// Visible UI element — styled normally, no aria-live
<div className="...visible-styles...">
  <Icon aria-hidden="true" />
  <span>{displayText}</span>
</div>
```

The sr-only live region is persistent (stays mounted). Its text content changes when state changes. The visible UI renders the same information without any `aria-live` attribute. This is the pattern used correctly in `DishRowExpanded.tsx` for the "Saved to My Recipes" announcement.

**When NOT to use a separate sr-only region:** If the component already renders its label as visible text (no icon-only scenario), simply ensure `aria-live` is on the container and no `aria-label` overrides the accessible name. The visible text mutation IS the announcement. This is the pattern used correctly in `AutoCaptureToast.tsx`.

### Fixing ProcessingStrip (Violation 1)

The fix for `ProcessingStrip.tsx` is minimal — remove the `aria-label` prop from the `motion.div`:

```typescript
// Before:
<motion.div
  role="status"
  aria-live="polite"
  aria-label={message ?? config.label}   // ← REMOVE THIS
  ...
>

// After:
<motion.div
  role="status"
  aria-live="polite"
  // No aria-label — accessible name comes from visible text child
  ...
>
```

The visible `<span>` child already contains `{message ?? config.label}`. Removing `aria-label` means the accessible name falls back to the text content, and VoiceOver will announce state changes correctly via text content mutation.

No visual change results from this fix.

### Fixing edit/page.tsx servings counter (Violation 3)

```typescript
// Before:
<span
  aria-live="polite"
  aria-label={`${servings} serving${servings !== 1 ? 's' : ''}`}
>
  {servings}
</span>

// After (option A — richer visible text, no aria-label):
<span aria-live="polite">
  {servings} serving{servings !== 1 ? 's' : ''}
</span>

// After (option B — numeric only visible, sr-only for context):
<span aria-live="polite" aria-atomic="true">
  <span aria-hidden="true">{servings}</span>
  <span className="sr-only">
    {`${servings} serving${servings !== 1 ? 's' : ''}`}
  </span>
</span>
```

Option A is simpler and preferred if the visual design can accommodate the full text "3 servings" at the existing font size. Option B is the fallback if the stepper must remain numeric-only visually.

### Testing VoiceOver Manually

**iOS Simulator (limited but useful for structural checks):**
1. Open Xcode → Open Simulator → Settings → Accessibility → VoiceOver → ON
2. Navigate to the app in Safari (PWA or browser)
3. Swipe right/left to move through elements; double-tap to activate
4. Verify: reading order is logical, all buttons announce with context, `aria-live` regions announce state changes

**Real iOS device (preferred for async announcement testing):**
1. Settings → Accessibility → VoiceOver → ON (or triple-click Home)
2. Connect to local dev server via ngrok or LAN IP
3. For async tests: trigger enrichment scan, listen for `aria-live` announcements
4. Verify ScanConfidenceBanner announces immediately on appearance without focus moving

**Key VoiceOver gesture reference:**
- Swipe right: next element
- Swipe left: previous element
- Double-tap: activate
- Three-finger swipe: scroll
- Two-finger scrub (Z): go back

### RTL Testing Patterns for ARIA

```typescript
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Query by role + accessible name
const button = screen.getByRole('button', { name: /scan a menu/i })

// Query by role — checks aria-label, aria-labelledby, or text content
const nav = screen.getByRole('navigation', { name: /main navigation/i })

// Assert aria-expanded
expect(dishRow).toHaveAttribute('aria-expanded', 'false')
await userEvent.click(dishRow)
expect(dishRow).toHaveAttribute('aria-expanded', 'true')

// Assert aria-live text content (NOT aria-label mutation)
const liveRegion = screen.getByRole('status')
expect(liveRegion).not.toHaveAttribute('aria-label')  // NFR13 compliance
expect(liveRegion).toHaveTextContent('Ready — tap to view')  // text content present

// Assert aria-current on active tab
const activeTab = screen.getByRole('link', { name: /home/i })
expect(activeTab).toHaveAttribute('aria-current', 'page')

const inactiveTab = screen.getByRole('link', { name: /search/i })
expect(inactiveTab).not.toHaveAttribute('aria-current')

// Assert aria-pressed on toggle buttons
const portionButton = screen.getByRole('button', { name: /1 serving/i })
expect(portionButton).toHaveAttribute('aria-pressed', 'true')

// Assert aria-hidden on decorative elements
const decorativeIcon = container.querySelector('svg')
expect(decorativeIcon).toHaveAttribute('aria-hidden', 'true')
```

---

## Testing Requirements

### What IS testable (write Vitest + RTL tests for these)

#### Test file: `src/components/layout/ProcessingStrip.a11y.test.tsx`

```
describe('ProcessingStrip — NFR13 compliance and ARIA')
  ├── has role="status" and aria-live="polite"
  ├── does NOT have aria-label on the container element (NFR13 fix verification)
  ├── announces state transitions via text content — text content changes when state changes
  ├── is not rendered when state is "idle"
  ├── "processing" state: text content is "Identifying your dish…"
  ├── "ready" state: text content is "Your dish is ready — tap to view"
  ├── "error" state: text content is "Couldn't identify — tap to retry"
  └── all icon SVGs have aria-hidden="true"
```

**Key assertion for NFR13:**
```typescript
it('does NOT use aria-label to announce state (NFR13)', () => {
  const { rerender } = render(<ProcessingStrip state="processing" />)
  const statusEl = screen.getByRole('status')
  expect(statusEl).not.toHaveAttribute('aria-label')

  rerender(<ProcessingStrip state="ready" resultId="abc" />)
  expect(screen.getByRole('status')).not.toHaveAttribute('aria-label')
  expect(screen.getByRole('status')).toHaveTextContent('Your dish is ready')
})
```

#### Test file: `src/components/scan/DishRowCompact.a11y.test.tsx`

```
describe('DishRowCompact — ARIA roles and keyboard navigation')
  ├── has role="button"
  ├── has tabIndex={0}
  ├── aria-expanded is "false" when isExpanded=false
  ├── aria-expanded is "true" when isExpanded=true
  ├── aria-label includes dish name when estimatedCalories is null
  ├── aria-label includes dish name and calorie count when estimatedCalories is present
  ├── aria-label format: "[Dish name], [N] calories"
  ├── aria-controls points to dish-details-[recipe.id]
  ├── Enter keydown fires onToggle
  ├── Space keydown fires onToggle
  ├── photo image has empty alt (decorative) or aria-hidden
  └── macro chip spans do not have interactive roles (read-only text)
```

#### Test file: `src/components/layout/TabBar.a11y.test.tsx`

```
describe('TabBar — ARIA navigation and accessible names')
  ├── nav element has role="navigation" and aria-label="Main navigation"
  ├── camera FAB has aria-label="Scan a menu" when isOnline=true
  ├── camera FAB has descriptive offline aria-label when isOnline=false
  ├── camera FAB has aria-disabled=true when isOnline=false
  ├── active tab link has aria-current="page"
  ├── inactive tab links do NOT have aria-current attribute
  ├── offline indicator dot has aria-hidden="true"
  └── all icon SVGs in tab items have aria-hidden="true"
```

#### Test file: `src/components/scan/ScanConfidenceBanner.a11y.test.tsx`

> **Note:** A test file (`ScanConfidenceBanner.test.tsx`) already exists and covers `role="alert"` and `aria-live="assertive"`. Augment or create a separate a11y-specific file rather than replacing the existing tests.

```
describe('ScanConfidenceBanner — assertive announcement and button accessibility')
  ├── has role="alert" (existing test — verify passes)
  ├── has aria-live="assertive" (existing test — verify passes)
  ├── "Retake photo" button has accessible name "Retake photo"
  ├── "Add manually" button has accessible name "Add manually"
  ├── "Continue with N" button has accessible name matching rendered text
  ├── all three action buttons have minimum height ≥ 44px (touch target)
  └── does NOT have aria-label on the root element (assertive role + text content is sufficient)
```

#### Test file: `src/components/scan/DishRowExpanded.a11y.test.tsx`

> **Note:** Augment or verify alongside existing `DishRowExpanded.test.tsx`.

```
describe('DishRowExpanded — ARIA and keyboard accessibility')
  ├── collapse button has aria-label="Collapse"
  ├── portion stepper group has role="group" and aria-label="Serving size"
  ├── each portion stepper button has aria-pressed set correctly
  ├── aria-pressed is "true" only for the selected portion value
  ├── sr-only live region has aria-live="polite" and aria-atomic="true"
  ├── sr-only live region announces "Saved to My Recipes" after save (text content check)
  ├── sr-only live region does NOT have aria-label (NFR13 compliance)
  ├── section has id matching aria-controls from the companion DishRowCompact
  └── section has aria-label="[recipe name] details"
```

#### Test file: `src/app/recipe/[id]/edit/edit-page.a11y.test.tsx`

```
describe('RecipeEditPage servings stepper — NFR13 compliance')
  ├── servings counter span has aria-live="polite"
  ├── servings counter span does NOT have aria-label attribute (NFR13 fix verification)
  ├── text content updates when servings value changes
  └── announcement text includes unit ("servings") not just numeric value
```

### What is NOT testable in unit tests (manual VoiceOver audit required)

The following require manual testing on an iOS device or Simulator. Document results in the Dev Agent Record.

| Check | Tool | Pass criteria |
|-------|------|--------------|
| Reading order — HomeScreen (State 0, 1, 2) | VoiceOver on iOS Simulator | Swipe-right traversal matches visual top-to-bottom, left-to-right order |
| Reading order — RestaurantScreen dish list | VoiceOver on iOS Simulator | HeroCard announced before dish rows; dish rows in visual order |
| Reading order — RecipesScreen grid | VoiceOver on iOS Simulator | Cards announced row-by-row; Edit button reachable |
| `aria-live="assertive"` fires for ScanConfidenceBanner | Real iOS device | Banner text is announced immediately on appearance without user navigation |
| `aria-live="polite"` fires for ProcessingStrip state change | Real iOS device | State transition announced within ~500ms of change; no double-announcement |
| `aria-live="polite"` fires for AutoCaptureToast | Real iOS device | "N dishes saved" announced when toast mounts |
| Camera FAB keyboard focus | Desktop browser (keyboard) | Tab to FAB shows visible focus ring; Enter/Space activates camera |
| DishRowCompact expand via keyboard | Desktop browser (keyboard) | Tab to row; Enter expands; DishRowExpanded receives focus or is announced |
| HeroCard keyboard activation | Desktop browser (keyboard) | Tab to card; Enter/Space fires onCardPress |
| No focus traps | Desktop browser (keyboard) | Tab through entire app without getting stuck; Shift+Tab works |
| axe DevTools scan — HomeScreen | axe DevTools browser extension | Zero WCAG 2.1 AA violations (suppress glass-surface false positives with rationale) |
| axe DevTools scan — RestaurantScreen | axe DevTools browser extension | Zero WCAG 2.1 AA violations |
| axe DevTools scan — RecipesScreen | axe DevTools browser extension | Zero WCAG 2.1 AA violations |

---

## Architecture Guardrails

- **Never mutate `aria-label` to announce async state (NFR13 — non-negotiable)** — `aria-label` is for providing static accessible names to elements that lack visible text labels (icon-only buttons, landmark regions). It must never be used as an announcement channel. All async state announcements must use text content mutation inside `aria-live` regions.
- **`role="alert"` implies `aria-live="assertive"`** — setting both is redundant but harmless. Do not remove `aria-live="assertive"` from `ScanConfidenceBanner` — the redundancy is intentional for clarity and cross-browser compatibility.
- **Persistent live regions, not mount/unmount** — when possible, keep `aria-live` regions in the DOM and change their text content. Mounting/unmounting an `aria-live` element resets the browser's live region tracker and may miss rapid state changes. The `DishRowExpanded` sr-only div pattern is the model.
- **`sr-only` class, not `display: none` or `visibility: hidden`** — elements with `display: none` are removed from the accessibility tree and will not announce even if they have `aria-live`. Use `sr-only` (position absolute, clip) for visually hidden live regions.
- **`aria-hidden="true"` on all decorative SVGs** — every `<svg>` that is purely visual must have `aria-hidden="true"`. Never add `role="img"` to decorative icons.
- **`focus-visible` not `focus`** — all focus ring styles must use `:focus-visible` or the Tailwind `focus-visible:` prefix. Never add `outline` styles to `:focus` alone — this causes rings to appear after tap on iOS, which is incorrect.
- **TypeScript strict** — all new props and components added during this story must be fully typed. No `any`.
- **Do not change ARIA roles to fix announcements** — if a role is correct (`role="status"`, `role="alert"`, `role="button"`) do not change it. Fix the announcement channel (text content vs. aria-label) instead.
- **`planning/sprint-status.yaml` is NOT modified** — do not update the sprint status file.

---

## Implementation Order

> **This story can be implemented independently within Epic 7**, in parallel with or after Stories 7.1 and 7.2.

Recommended order:

1. **Full audit pass** — read every file in the audit scope list. Record compliant / violation in the Dev Agent Record. Do not assume the pre-audit findings are exhaustive; verify against current code.
2. **Fix confirmed NFR13 violations** — `ProcessingStrip.tsx` (remove `aria-label` from live region container) → `edit/page.tsx` servings counter (remove `aria-label`, ensure full text is in content).
3. **Fix any additional violations found in step 1** — document each fix in the Dev Agent Record.
4. **Write unit tests** — write the five test files specified in Testing Requirements.
5. **Manual VoiceOver audit** — run the app, use iOS Simulator and/or real device for the VoiceOver checks listed in "What is NOT testable". Document results in the Dev Agent Record.
6. **axe DevTools scan** — run on HomeScreen, RestaurantScreen, RecipesScreen. Suppress glass-surface false positives with documented rationale. Document results.
7. **Full test suite pass** — run all tests; confirm no regressions.

---

## Definition of Done

- [ ] Full audit completed against all files in the audit scope list; results documented in Dev Agent Record
- [ ] Violation 1 fixed: `ProcessingStrip.tsx` — `aria-label` removed from the `aria-live` container; announcements tested via text content
- [ ] Violation 2 verified: `ScanConfirmationOverlay.tsx` "Saving dishes…" `aria-live` usage documented (harmless or fixed if text is dynamic)
- [ ] Violation 3 fixed: `edit/page.tsx` servings counter — `aria-label` removed from `aria-live` element; text content includes unit ("servings")
- [ ] Any additional violations found during audit are fixed and documented
- [ ] `FilterPillRow` presence or absence documented in Dev Agent Record
- [ ] `src/components/layout/ProcessingStrip.a11y.test.tsx` — all cases passing
- [ ] `src/components/scan/DishRowCompact.a11y.test.tsx` — all cases passing
- [ ] `src/components/layout/TabBar.a11y.test.tsx` — all cases passing
- [ ] `src/components/scan/ScanConfidenceBanner.a11y.test.tsx` (or augmented existing test) — all cases passing
- [ ] `src/components/scan/DishRowExpanded.a11y.test.tsx` (or augmented existing test) — all cases passing
- [ ] `src/app/recipe/[id]/edit/edit-page.a11y.test.tsx` — all cases passing
- [ ] Manual VoiceOver audit run on HomeScreen, RestaurantScreen, RecipesScreen — results documented in Dev Agent Record
- [ ] axe DevTools full-page scans run on HomeScreen, RestaurantScreen, RecipesScreen — results documented with any suppressions rationale
- [ ] Focus ring visual check confirmed: keyboard shows ring, tap does not
- [ ] TypeScript strict: no new errors introduced
- [ ] Full test suite passes with no regressions
- [ ] `planning/sprint-status.yaml` is NOT modified

---

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Audit Results

| File | Status | Notes |
|------|--------|-------|
| `src/components/layout/ProcessingStrip.tsx` | _pending_ | Pre-audit: NFR13 violation — aria-label on aria-live container |
| `src/components/layout/TabBar.tsx` | _pending_ | Pre-audit: likely compliant |
| `src/components/layout/FAB.tsx` | _pending_ | Pre-audit: likely compliant |
| `src/components/screens/HomeScreen.tsx` | _pending_ | |
| `src/components/screens/RestaurantScreen.tsx` | _pending_ | |
| `src/components/screens/RecipesScreen.tsx` | _pending_ | |
| `src/components/screens/SearchScreen.tsx` | _pending_ | |
| `src/components/screens/GroceryScreen.tsx` | _pending_ | |
| `src/components/screens/SettingsScreen.tsx` | _pending_ | |
| `src/components/screens/ImportScreen.tsx` | _pending_ | |
| `src/components/screens/RestaurantCollectionScreen.tsx` | _pending_ | |
| `src/app/recipe/[id]/page.tsx` | _pending_ | |
| `src/app/recipe/[id]/edit/page.tsx` | _pending_ | Pre-audit: NFR13 violation — aria-label on aria-live servings counter |
| `src/components/scan/DishRowCompact.tsx` | _pending_ | Pre-audit: likely compliant |
| `src/components/scan/DishRowExpanded.tsx` | _pending_ | Pre-audit: correct NFR13 pattern — verify |
| `src/components/scan/ScanConfidenceBanner.tsx` | _pending_ | Pre-audit: likely compliant |
| `src/components/scan/AutoCaptureToast.tsx` | _pending_ | Pre-audit: likely compliant |
| `src/components/scan/ScanConfirmationOverlay.tsx` | _pending_ | Pre-audit: verify aria-live on static text |
| `src/components/scan/InferenceState.tsx` | _pending_ | |
| `src/components/scan/TipBanner.tsx` | _pending_ | |
| `src/components/scan/PartialResultsBanner.tsx` | _pending_ | |
| `src/components/scan/RestaurantConfirmation.tsx` | _pending_ | |
| `src/components/scan/ManualDishEntrySheet.tsx` | _pending_ | |
| `src/components/capture/CameraModal.tsx` | _pending_ | |
| `src/components/ui/MacroBar.tsx` | _pending_ | |
| `src/components/ui/HomeSection.tsx` | _pending_ | Pre-audit: likely compliant |
| `src/components/ui/HeroCard.tsx` | _pending_ | Pre-audit: likely compliant |
| `src/components/ui/PhotoFrame.tsx` | _pending_ | |
| `src/components/ui/RecipeGridCard.tsx` | _pending_ | |
| `src/components/ui/RestaurantGridCard.tsx` | _pending_ | |
| `src/components/ui/DishCard.tsx` | _pending_ | |
| `src/components/ui/FrostedCard.tsx` | _pending_ | |
| `src/components/ui/BottomSheet.tsx` | _pending_ | |
| `src/components/ui/ErrorState.tsx` | _pending_ | |
| `src/components/ui/SearchBar.tsx` | _pending_ | |
| `src/components/ui/SwipeToDelete.tsx` | _pending_ | |
| `src/components/ui/RemoveRestaurantSheet.tsx` | _pending_ | |
| `src/components/ui/RestaurantSearchResult.tsx` | _pending_ | |
| `src/components/banners/SmartBanner.tsx` | _pending_ | |
| `src/components/pwa/InstallPromptBanner.tsx` | _pending_ | |

### NFR13 Violations Found

| File | Element | Violation | Fix Applied |
|------|---------|-----------|-------------|
| `src/components/layout/ProcessingStrip.tsx` | `<motion.div role="status" aria-live="polite">` | `aria-label` attribute mutates with state | _pending_ |
| `src/app/recipe/[id]/edit/page.tsx` | servings counter `<span>` | `aria-label` + `aria-live` on same element | _pending_ |

### Manual VoiceOver Audit Results

| Check | Device | Result | Notes |
|-------|--------|--------|-------|
| Reading order — HomeScreen | _pending_ | _pending_ | |
| Reading order — RestaurantScreen | _pending_ | _pending_ | |
| Reading order — RecipesScreen | _pending_ | _pending_ | |
| ScanConfidenceBanner assertive announcement | _pending_ | _pending_ | |
| ProcessingStrip polite announcement | _pending_ | _pending_ | |
| AutoCaptureToast polite announcement | _pending_ | _pending_ | |
| Camera FAB keyboard focus and activation | _pending_ | _pending_ | |
| DishRowCompact expand via keyboard | _pending_ | _pending_ | |
| HeroCard keyboard activation | _pending_ | _pending_ | |
| No focus traps | _pending_ | _pending_ | |

### axe DevTools Scan Results

| Screen | Violations | Suppressions | Pass/Fail |
|--------|-----------|-------------|-----------|
| HomeScreen | _pending_ | _pending_ | _pending_ |
| RestaurantScreen | _pending_ | _pending_ | _pending_ |
| RecipesScreen | _pending_ | _pending_ | _pending_ |

### Debug Log References

_To be filled by dev agent_

### Completion Notes List

_To be filled by dev agent_

### File List

**Modified:**
_To be filled by dev agent_

**Created:**
_To be filled by dev agent_

**Not modified (verified compliant):**
_To be filled by dev agent_

### Change Log

_To be filled by dev agent_
