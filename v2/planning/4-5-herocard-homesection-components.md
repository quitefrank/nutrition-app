# Story 4.5: HeroCard & HomeSection Components

Status: review
Epic: 4 — Restaurant Search & Collection Management
Story ID: 4.5
Story Key: 4-5-herocard-homesection-components
Created: 2026-04-12

---

## Story

As a user,
I want to see my most recently visited restaurant as a prominent hero card at the top of the home screen,
So that I can quickly jump back into what I was last exploring.

---

## Acceptance Criteria

**AC1 — HeroCard State 1 anatomy (single restaurant)**
**Given** the HeroCard is rendered for State 1 (exactly one restaurant in the collection)
**When** it displays
**Then** it shows a full-width photo strip at `148px` height with a dark gradient overlay; restaurant name and meta are overlaid bottom-left; a dish thumbnail row (`52×52px` mini cards) and footer (dish count + "View all ›") appear in the card body; surface uses `--glass-base` + `--blur-base` + `22px` radius + `--shadow-float`

**AC2 — HeroCard height transition (State 1 → State 2)**
**Given** the HeroCard transitions from State 1 to State 2
**When** a second restaurant is added to the collection
**Then** the photo strip height animates from `148px` to `112px` over `400ms ease-out`

**AC3 — HeroCard accessibility**
**Given** the HeroCard is rendered
**When** inspected for accessibility
**Then** it has `role="article"` and `aria-label="[Restaurant name], last visited [time]"`

**AC4 — HomeSection anatomy**
**Given** a HomeSection renders with content
**When** its content slot is populated
**Then** the section header shows the title at `16px` semibold; "See all (N)" appears only when items > 4 as a `12px` terracotta text link; the section has `role="region"` with `aria-label="[Section title]"`

**AC5 — RestaurantGridCard anatomy**
**Given** a RestaurantGridCard renders in a 2-column grid
**When** it displays
**Then** it shows a photo area of `68px`, restaurant name at `12px` semibold, dish count at `11px`; surface uses `--glass-base` + lighter blur + `16px` radius + `--shadow-card`; press animates to `scale(0.97)` using `SPRING_CARD_EXPAND`

**AC6 — RecipeGridCard anatomy**
**Given** a RecipeGridCard renders in a 2-column grid
**When** it displays
**Then** it shows a photo area of `68px`, dish name at `12px` semibold, calorie count in terracotta at `11px`; surface uses `--glass-base` + lighter blur + `16px` radius + `--shadow-card`; press animates to `scale(0.97)` using `SPRING_CARD_EXPAND`

**AC7 — Reduced motion compliance**
**Given** `prefers-reduced-motion: reduce` is active
**When** HeroCard height transitions or grid card press animations run
**Then** all scale transforms are suppressed; no `400ms ease-out` runs; opacity-only or no animation applies

---

## Component Specifications (UX-DR14–16)

### HeroCard

**File:** `src/components/ui/HeroCard.tsx`

**Props interface:**
```typescript
interface HeroCardProps {
  restaurant: DomainRestaurant           // restaurant data (name, address, cuisineType, referenceImageUrl)
  dishes: DomainRecipe[]                 // to render 52×52 dish thumbnail row
  dishCount: number                      // for footer text "N dishes"
  state: 1 | 2                           // controls photo strip height (148px vs 112px)
  lastVisitedAt?: string | null          // ISO string for aria-label "last visited [time]"
  onViewAll: () => void                  // tap "View all ›" footer
  onCardPress?: () => void               // tap the card body
}
```

**Anatomy — top-to-bottom:**
1. **Photo strip** — full-width `<img>` using `restaurant.referenceImageUrl`; fallback to warm gradient if null; height: `148px` (State 1) or `112px` (State 2 via `motion.div` animate); dark gradient overlay `linear-gradient(to top, rgba(20,14,8,0.72) 0%, transparent 60%)` overlaid on the image; restaurant name (`16px` semibold, white) + meta (`12px`, `rgba(255,255,255,0.75)`) pinned bottom-left over the gradient
2. **Card body** — glass surface; dish thumbnail row: up to 5 dishes rendered as `52×52px` rounded squares (`11px` radius) with `object-cover`; overflow dishes show a count badge instead of a 6th thumbnail
3. **Footer row** — dish count text (`12px` `--color-text-tertiary`) + "View all ›" terracotta inline text link; tapping "View all ›" calls `onViewAll`

**Surface:** `background: var(--glass-base)`, `backdrop-filter: var(--blur-base)`, `-webkit-backdrop-filter: var(--blur-base)`, `border-radius: 22px`, `box-shadow: var(--shadow-float)`, `border: var(--border-glass)`

**Height animation (AC2):**
```typescript
// Use Framer Motion animate prop — not CSS transition
<motion.div
  animate={{ height: state === 1 ? 148 : 112 }}
  transition={reducedMotion ? { duration: 0 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
/>
```

**Accessibility:**
- `role="article"` on the outer card element
- `aria-label={`${restaurant.name}, last visited ${formattedTime}`}` — format `lastVisitedAt` as human-readable (e.g. "today at 3:45 PM")
- Dish thumbnails: `aria-hidden="true"` (decorative)
- "View all ›" button: `aria-label={`View all dishes at ${restaurant.name}`}`

**Reduced motion:** Use `const reducedMotion = useReducedMotion()` from `framer-motion`. When true: set `animate={{ height: state === 1 ? 148 : 112 }}` with `transition={{ duration: 0 }}`; suppress all scale transforms.

---

### HomeSection

**File:** `src/components/ui/HomeSection.tsx`

**Props interface:**
```typescript
interface HomeSectionProps {
  title: string                          // "Restaurants" or "My Recipes"
  itemCount: number                      // drives "See all (N)" visibility
  onSeeAll?: () => void                  // called when "See all" tapped
  children: React.ReactNode              // grid or list content slot
}
```

**Anatomy:**
- Header row: title `16px` semibold (`--color-text-primary`, DM Sans) + optional "See all (N)" link right-aligned
- "See all (N)" appears **only when `itemCount > 4`**; styled as `12px`, `--color-accent`, `font-weight: 500`; tap calls `onSeeAll`
- Content slot: renders `children` directly below the header

**Accessibility:**
- `role="region"` on the outer wrapper
- `aria-label={title}` on the outer wrapper

---

### RestaurantGridCard

**File:** `src/components/ui/RestaurantGridCard.tsx`

**Props interface:**
```typescript
interface RestaurantGridCardProps {
  restaurant: DomainRestaurant
  dishCount: number
  onPress: () => void
}
```

**Anatomy:** Photo area `68px` height (full card width, `object-cover`; fallback to warm gradient) + card body: name `12px` semibold (`--color-text-primary`) + dish count `11px` (`--color-text-tertiary`, e.g. "8 dishes")

**Surface:** `background: var(--glass-base)`, `backdrop-filter: blur(16px) saturate(1.3)` (lighter blur — not full `--blur-base`), `border-radius: 16px`, `box-shadow: var(--shadow-card)`, `border: var(--border-glass)`

**Press animation:** `whileTap={{ scale: 0.97 }}` + `transition={SPRING_CARD_EXPAND}`. When `reducedMotion` is true, suppress `scale`.

**Photo source:** `restaurant.referenceImageUrl` — may be null; use the warm gradient fallback (same as `PhotoFrame` placeholder approach — terracotta tint gradient, no text label needed for the small card).

---

### RecipeGridCard

**File:** `src/components/ui/RecipeGridCard.tsx`

**Props interface:**
```typescript
interface RecipeGridCardProps {
  recipe: DomainRecipe
  onPress: () => void
}
```

**Anatomy:** Photo area `68px` height (full card width, `object-cover` using `recipe.dishImageUrl`; fallback to warm gradient when `recipe.photoStatus === 'placeholder'`) + card body: name `12px` semibold (`--color-text-primary`) + calorie count `11px` terracotta (`--color-accent`, e.g. "480 cal"; omit if `recipe.estimatedCalories` is null)

**Surface:** Same as `RestaurantGridCard`: lighter blur, `16px` radius, `--shadow-card`, `--border-glass`

**Press animation:** `whileTap={{ scale: 0.97 }}` + `transition={SPRING_CARD_EXPAND}`. When `reducedMotion` is true, suppress `scale`.

**Photo fallback:** When `recipe.photoStatus !== 'confirmed'` or `recipe.dishImageUrl` is null — render the warm gradient tile (same terracotta-tint gradient used in `GalleryDishCard` in `HomeScreen.tsx`).

---

## Dev Notes

### This Is Greenfield UI — New Components Only

Story 4.5 creates four new pure UI components. It does **not** wire them into the home screen — that integration is Story 4.6. The dev agent must:
1. Create the components in `src/components/ui/`
2. Write Vitest + RTL unit tests for each
3. NOT modify `HomeScreen.tsx`, `HomeScreenClient.tsx`, or any screen-level file
4. NOT modify `sprint-status.yaml`

### Project Structure

New files go in `src/components/ui/` — matching existing UI primitives (`FrostedCard`, `PhotoFrame`, `MacroBar`, `DishCard`). No new folders needed.

```
src/components/ui/
├── HeroCard.tsx              ← NEW
├── HeroCard.test.tsx         ← NEW
├── HomeSection.tsx           ← NEW
├── HomeSection.test.tsx      ← NEW
├── RestaurantGridCard.tsx    ← NEW
├── RestaurantGridCard.test.tsx ← NEW
├── RecipeGridCard.tsx        ← NEW
├── RecipeGridCard.test.tsx   ← NEW
```

### Key Imports — Do Not Reinvent

| Need | Import from |
|------|-------------|
| Spring presets | `@/lib/springs` — use `SPRING_CARD_EXPAND` for card press; NOT custom spring values |
| Framer Motion | `framer-motion` — `motion`, `useReducedMotion` |
| Types | `@/types/database` — `DomainRestaurant`, `DomainRecipe` |
| CSS tokens | `var(--glass-base)`, `var(--blur-base)`, `var(--shadow-float)`, `var(--shadow-card)`, `var(--border-glass)`, `var(--color-accent)`, `var(--color-text-primary)`, `var(--color-text-tertiary)` — all defined in `src/app/globals.css` `:root` block |
| Photo placeholder pattern | Copy from `GalleryDishCard` in `HomeScreen.tsx` (lines 499–507) — the terracotta-tint gradient `linear-gradient(135deg, rgba(196,98,45,0.22) 0%, rgba(228,174,110,0.18) 100%)` |

### Glass Token Usage — Critical

Tokens are **NOT Tailwind classes** — they are CSS custom properties used as `var()` in inline `style={}` props or CSS modules. The correct pattern (from `globals.css`):

```typescript
// Correct — inline style
<div style={{
  background: "var(--glass-base)",
  backdropFilter: "var(--blur-base)",
  WebkitBackdropFilter: "var(--blur-base)",
  border: "var(--border-glass)",
  borderRadius: 22,
  boxShadow: "var(--shadow-float)",
}} />

// Wrong — Tailwind arbitrary value will not cascade blur correctly
<div className="bg-[var(--glass-base)] backdrop-blur-[var(--blur-base)]" />
```

The existing `FrostedCard` uses CSS utility classes `frosted` and `frosted-elevated` (defined in `globals.css` lines 181–196). For HeroCard, use inline styles directly — the `22px` radius and `--shadow-float` are non-standard and not covered by the `.frosted` utility class.

For `RestaurantGridCard` and `RecipeGridCard`, the "lighter blur" spec means `blur(16px) saturate(1.3)` — do NOT use `var(--blur-base)` (which is `blur(24px) saturate(1.4) brightness(1.02)`).

### Framer Motion — useReducedMotion Pattern

```typescript
import { motion, useReducedMotion } from "framer-motion"
import { SPRING_CARD_EXPAND } from "@/lib/springs"

function RestaurantGridCard({ onPress }: Props) {
  const reducedMotion = useReducedMotion()

  return (
    <motion.button
      onClick={onPress}
      whileTap={reducedMotion ? {} : { scale: 0.97 }}
      transition={SPRING_CARD_EXPAND}
    >
      ...
    </motion.button>
  )
}
```

`useReducedMotion()` returns `boolean | null`. Treat `null` as false (motion allowed). This is the established pattern in `springs.ts` docs.

### HeroCard — "Last Visited" Time Formatting

Format `lastVisitedAt` (ISO 8601 string) using the same approach as `formatScanLabel` in `HomeScreen.tsx`:

```typescript
function formatLastVisited(isoString: string | null | undefined): string {
  if (!isoString) return "recently"
  const d = new Date(isoString)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) {
    return `today at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" })
}
// aria-label: `${restaurant.name}, last visited ${formatLastVisited(lastVisitedAt)}`
```

Do NOT add a new utility to `@/lib/` for this — keep it local to `HeroCard.tsx`.

### HeroCard — Dish Thumbnail Row

- Render up to 5 dish thumbnails as `52×52px` rounded squares (`border-radius: 11px`)
- Use `recipe.dishImageUrl` with `photoStatus` check: render `<img>` when `photoStatus === 'confirmed'`; render terracotta-tint gradient tile otherwise
- For dishes beyond index 4: render a `52×52px` badge showing "+N more" in the same tile style
- Horizontal scroll: `overflow-x: auto`, `gap: 8px`, `-webkit-overflow-scrolling: touch`
- No `SwipeToDelete` in this component — thumbnails are display-only

### HomeSection — "See all" Threshold

The threshold is `itemCount > 4` — meaning 5+ items trigger "See all (N)". The count in the link text is `itemCount`, not the capped display count.

### Accessibility — touch targets

All interactive elements must meet `44×44px` minimum touch target (NFR12). For small grid cards, pad the hitbox with invisible area if the visual element is shorter:

```typescript
// Pattern for small buttons — visual + invisible extension
<motion.button
  style={{ minHeight: 44, minWidth: 44 }}
  ...
/>
```

### DomainRestaurant — Fields Available

From `src/types/database.ts`:
- `id`, `placeId`, `name`, `address`, `cuisineType`, `referenceImageUrl`, `rating`, `userRatingsTotal`, `createdAt`
- **No `status` field on `DomainRestaurant`** — restaurants are never filtered by status at the type level (filtering happens in Supabase queries). Do not add a status check.

### DomainRecipe — Fields Available

From `src/types/database.ts`:
- `id`, `restaurantId`, `name`, `description`, `dishImageUrl`, `estimatedCalories`, `status`, `photoStatus`, `totalProteinG`, `totalCarbsG`, `totalFatG`, `totalFibreG`, etc.
- Use `recipe.estimatedCalories` for the calorie display in `RecipeGridCard` (USDA-enriched total is in `totalCarbsG` etc., but the summary calorie for the card is `estimatedCalories` — check after enrichment whether it's populated)

---

## Testing Requirements

### Framework

Vitest + React Testing Library. Config: `vitest.config.ts` in project root. framer-motion is mocked via `src/test/mocks/framer-motion.tsx` (all animation props stripped; transitions are synchronous in tests). The mock means `whileTap` and `animate` do NOT fire in tests — test rendered output and prop-driven state only.

### Test files — one per component

**`HeroCard.test.tsx`:**
```
describe('HeroCard')
  ├── renders restaurant name in photo strip
  ├── renders aria-label with restaurant name and last visited time
  ├── renders role="article"
  ├── renders up to 5 dish thumbnails
  ├── renders "+N more" badge when dishes > 5
  ├── calls onViewAll when footer "View all" is tapped
  ├── renders gradient fallback when referenceImageUrl is null
  └── renders photo strip at 148px (state=1) or 112px (state=2) initial height
```

**`HomeSection.test.tsx`:**
```
describe('HomeSection')
  ├── renders title
  ├── renders role="region" with aria-label matching title
  ├── hides "See all" when itemCount <= 4
  ├── shows "See all (N)" when itemCount > 4
  ├── calls onSeeAll when "See all" is tapped
  └── renders children in content slot
```

**`RestaurantGridCard.test.tsx`:**
```
describe('RestaurantGridCard')
  ├── renders restaurant name
  ├── renders dish count (e.g. "8 dishes")
  ├── calls onPress when tapped
  └── renders gradient fallback when referenceImageUrl is null
```

**`RecipeGridCard.test.tsx`:**
```
describe('RecipeGridCard')
  ├── renders dish name
  ├── renders calorie count in terracotta when estimatedCalories is non-null
  ├── omits calorie line when estimatedCalories is null
  ├── calls onPress when tapped
  └── renders gradient fallback when photoStatus is 'placeholder'
```

### Test data helpers

Construct minimal mock objects typed as `DomainRestaurant` and `DomainRecipe` inline in each test file. Do NOT create a shared `fixtures.ts` — test data should be local and explicit.

```typescript
const mockRestaurant: DomainRestaurant = {
  id: "rest-1",
  placeId: "ChIJ_test",
  name: "Sala Thai",
  address: "123 Main St",
  cuisineType: "Thai",
  referenceImageUrl: null,
  atmosphericPaletteJson: null,
  rating: 4.5,
  userRatingsTotal: 312,
  createdAt: new Date().toISOString(),
}

const mockRecipe: DomainRecipe = {
  id: "recipe-1",
  restaurantId: "rest-1",
  visitId: null,
  name: "Pad Thai",
  description: null,
  dishImageUrl: null,
  estimatedCalories: 480,
  status: "auto_captured",
  photoStatus: "placeholder",
  geminiConfidence: null,
  dishRating: null,
  dishReviewSnippet: null,
  totalProteinG: null,
  totalCarbsG: null,
  totalFatG: null,
  totalFibreG: null,
  createdAt: new Date().toISOString(),
}
```

---

## What Story 4.6 Will Consume

Story 4.6 (Home Screen Progressive States) will import all four components created here and integrate them into `HomeScreen.tsx`. The dev agent for 4.5 must export all four components with the exact prop interfaces defined above — 4.6 will not change the component signatures.

The `state: 1 | 2` prop on `HeroCard` is driven by `restaurantCount` in 4.6:
- `state={restaurantCount === 1 ? 1 : 2}`

---

## What Does NOT Change in This Story

| File | Reason |
|------|--------|
| `src/components/screens/HomeScreen.tsx` | Integration deferred to Story 4.6 |
| `src/components/screens/HomeScreenClient.tsx` | Not in scope |
| `src/types/database.ts` | No schema changes needed; types are already sufficient |
| `src/app/globals.css` | Glass tokens already defined; no additions needed |
| `src/lib/springs.ts` | Already has `SPRING_CARD_EXPAND`; do not add new presets |
| `planning/sprint-status.yaml` | Do NOT update |
| Any existing `src/components/ui/` files | Not modified; only new files added |
| Any API routes | No API work in this story |
| Any Supabase migrations | No schema changes needed |

---

## Architecture Guardrails

- **`SPRING_CARD_EXPAND` for all card press** — do not inline `{ type: "spring", stiffness: 400, damping: 22 }` in components; import from `@/lib/springs`
- **No Supabase calls in these components** — they are pure presentational components receiving data via props; all data fetching is the responsibility of the parent (Story 4.6)
- **No `'use client'` needed unless Framer Motion motion component requires it** — check: `motion.div` and `useReducedMotion()` are client-side hooks; all four components need `'use client'` at the top
- **Glass tokens via inline `style={}` not Tailwind** — see pattern above
- **`-webkit-backdrop-filter` alongside `backdrop-filter`** — required for Safari PWA compatibility (primary target is iPhone Safari)
- **TypeScript strict mode** — no `any` types; all props must be fully typed; no implicit returns
- **No PII in logs (SEC-DAT-1.00)** — these components have no API calls and no logs; no risk, but do not add `console.log` with restaurant names in error handlers

---

## Definition of Done

- [x] `HeroCard.tsx` created in `src/components/ui/` with correct anatomy (photo strip, dish thumbnails, footer), glass surface, accessibility attributes, and height animation
- [x] `HomeSection.tsx` created in `src/components/ui/` with conditional "See all (N)" link and `role="region"`
- [x] `RestaurantGridCard.tsx` created in `src/components/ui/` with photo area, name, dish count, press animation
- [x] `RecipeGridCard.tsx` created in `src/components/ui/` with photo area, name, calorie count in terracotta, press animation
- [x] All four components: reduced motion suppresses scale transforms and height transitions
- [x] `HeroCard.test.tsx`, `HomeSection.test.tsx`, `RestaurantGridCard.test.tsx`, `RecipeGridCard.test.tsx` created in `src/components/ui/`
- [x] All tests pass (`npx vitest run`) — 49/49 passing
- [x] TypeScript strict mode: no new errors (`npx tsc --noEmit`) — 0 new errors in component files
- [x] `HomeScreen.tsx` is NOT modified
- [x] `sprint-status.yaml` is NOT modified

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

No blockers encountered.

### Completion Notes List

- Implemented all four components (`HeroCard`, `HomeSection`, `RestaurantGridCard`, `RecipeGridCard`) in `src/components/ui/`
- `RestaurantGridCard.tsx` pre-existed with old `recipeCount`/`onTap` API; updated to story-spec API (`dishCount`/`onPress`) and warm gradient fallback. Existing `PlaceholderTile` helper removed; replaced with inline gradient div per spec.
- All glass tokens applied via inline `style={}` with `-webkit-backdrop-filter` alongside `backdrop-filter` for Safari PWA compatibility
- `useReducedMotion()` gates all scale and height animations per AC7
- `SPRING_CARD_EXPAND` imported from `@/lib/springs` — no inline spring configs
- `formatLastVisited()` helper kept local to `HeroCard.tsx` — not promoted to `@/lib/`
- All four test files written; 49/49 tests pass
- No TypeScript errors introduced in new files (pre-existing errors in other files remain)
- `HomeScreen.tsx` and `sprint-status.yaml` untouched

### File List

- src/components/ui/HeroCard.tsx (new)
- src/components/ui/HeroCard.test.tsx (new)
- src/components/ui/HomeSection.tsx (new)
- src/components/ui/HomeSection.test.tsx (new)
- src/components/ui/RestaurantGridCard.tsx (modified — API migration + gradient fallback)
- src/components/ui/RestaurantGridCard.test.tsx (modified — updated to new API, fixed aria-hidden img queries)
- src/components/ui/RecipeGridCard.tsx (new)
- src/components/ui/RecipeGridCard.test.tsx (new)
