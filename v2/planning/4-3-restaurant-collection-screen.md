# Story 4.3: Restaurant Collection Screen

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a user,
I want to browse all the restaurants in my collection and see their dishes at a glance,
So that I can quickly find and revisit any restaurant I've captured.

## Acceptance Criteria

1. **Given** the user navigates to the Home tab
   **When** one or more restaurants are in the collection
   **Then** restaurants are displayed as a 2-column grid of `RestaurantGridCard` components: 68px photo area, 12px semibold restaurant name, 11px dish count, `--glass-base` + `16px` radius + `--shadow-card` surface

2. **Given** a `RestaurantGridCard` is pressed
   **When** the press animation plays
   **Then** the card scales to `0.97` using the primary spring (`stiffness: 400, damping: 22`); on release it returns to full size — consistent with `SPRING_CARD_EXPAND` from `src/lib/springs.ts`

3. **Given** the user taps a restaurant card
   **When** they navigate to the restaurant's dish list
   **Then** the app navigates to `/restaurants/[placeId]?name=[restaurantName]`, rendering `RestaurantScreen` which displays all dishes for that restaurant with `status != 'removed'` as `DishRowCompact` cards

4. **Given** the user's collection is empty (no restaurants with non-removed recipes)
   **When** the Home tab renders
   **Then** the existing home screen empty state is shown — no grid, no section headers — consistent with Story 1.7 empty state; no separate empty state is created for this screen

5. **Given** a restaurant has been soft-deleted (all its `recipes.status = 'removed'`)
   **When** the collection is queried
   **Then** the removed restaurant does not appear in the list; the query filters using `useRestaurantsWithRecipes()` which already filters `status != 'removed'` recipes and excludes restaurants with no non-removed recipes

6. **Given** the Home tab is the primary collection destination
   **When** it renders
   **Then** it reuses `useRestaurantsWithRecipes()` from `src/hooks/useRestaurants.ts` — no new query is created; the collection display is the existing `HomeScreen.tsx` Restaurants section elevated to a dedicated tab-level view

## Tasks / Subtasks

- [x] Task 1: Create `RestaurantGridCard` component (AC: 1, 2)
  - [x] Create `src/components/ui/RestaurantGridCard.tsx` with props: `restaurant: DomainRestaurant`, `recipeCount: number`, `onTap: () => void`
  - [x] Photo area: 68px height, `object-cover`, warm placeholder tile if `reference_image_url` is null (cream `--color-bg-elevated` + subtle dish silhouette, no broken `<img>`)
  - [x] Name: 12px semibold, `var(--color-text-primary)`, single-line truncated
  - [x] Meta: `{recipeCount} dish{recipeCount !== 1 ? 'es' : ''}` at 11px, `var(--color-text-tertiary)`
  - [x] Glass surface: `--glass-base` + lighter blur + `16px` radius + `--shadow-card` — match UX-DR16 exactly
  - [x] Press animation: `whileTap={{ scale: 0.97 }}` with `SPRING_CARD_EXPAND` from `src/lib/springs.ts`
  - [x] Accessibility: `role="button"`, `tabIndex={0}`, `aria-label="{restaurantName}, {recipeCount} dishes"`, `focus-visible:` ring using Tailwind utilities, `onKeyDown` for Enter/Space
  - [x] Touch target: min 44×44px (card is inherently large enough; confirm no constraint reduces it)

- [x] Task 2: Create dedicated Restaurants collection page (AC: 3, 4, 5, 6)
  - [x] Create `src/app/restaurants/page.tsx` — Server Component wrapper that renders `RestaurantCollectionScreen`
  - [x] Create `src/components/screens/RestaurantCollectionScreen.tsx` — `"use client"` component
  - [x] Use `useRestaurantsWithRecipes()` hook — filters already exclude `removed` recipes; no new Supabase query needed
  - [x] Render 2-column grid (`grid grid-cols-2 gap-3 px-4`) of `RestaurantGridCard` instances
  - [x] On card tap: `router.push(\`/restaurants/${restaurant.placeId ?? restaurant.id}?name=${encodeURIComponent(restaurant.name)}\`)`
  - [x] Empty state: when `restaurantsWithRecipes.length === 0`, render the same empty state copy and CTA as `HomeScreen` State 0 — do NOT create a separate empty component
  - [x] Loading state: skeleton grid (2-column, 4 cells, `animate-pulse`) while `isPending`
  - [x] Error state: use existing `ErrorState` component from `src/components/ui/ErrorState.tsx` if query fails
  - [x] Stagger entrance animation: `containerVariants` / `itemVariants` pattern from `RestaurantScreen.tsx` (stagger 0.05s per card)

- [x] Task 3: Wire Home tab navigation to the new page (AC: 3)
  - [x] Verify `src/app/restaurants/[id]/page.tsx` does not exist yet — create it if missing (wraps `RestaurantScreen` with `placeId` from params)
  - [x] Confirm `src/components/AppShell.tsx` or `TabBar` routes the Home tab to `/restaurants` — update routing if currently pointing to a non-existent route or the home page
  - [x] Confirm `src/components/layout/TabBar.tsx` active-tab detection works for `/restaurants` prefix (both `/restaurants` and `/restaurants/[id]` should highlight the tab)

- [x] Task 4: Photo fallback for missing `reference_image_url` (AC: 1)
  - [x] Reuse or extract the warm placeholder tile pattern from `RestaurantScreen.tsx` (the `PlateIcon` + cream background pattern) — do NOT reinvent
  - [x] `reference_image_url` is on `DomainRestaurant` (mapped from `restaurants.reference_image_url`); when null, render the placeholder tile at 68px height with `aria-hidden="true"`

- [x] Task 5: Write Vitest + RTL tests (AC: 1, 2, 3, 4, 5)
  - [x] Create `src/components/ui/RestaurantGridCard.test.tsx` — test: renders name/count, placeholder when no photo, press fires `onTap`, `aria-label` correct
  - [x] Create `src/components/screens/RestaurantCollectionScreen.test.tsx` — test: empty state when no restaurants, grid renders with data, tap navigates correctly
  - [x] Mock `useRestaurantsWithRecipes` using `vi.mock('@/hooks/useRestaurants')`
  - [x] Mock Next.js router using `vi.mock('next/navigation')`
  - [x] Follow test patterns from `src/components/scan/DishRowCompact.test.tsx` — same `@testing-library/react` + `vi` imports

## Dev Notes

### Architecture Guardrails

- **Query key convention (ARCH16):** use `['restaurants', 'with-recipes']` — this is the existing key in `useRestaurantsWithRecipes()`. Do NOT create a new `['restaurants-collection']` key or similar.
- **Never manual cache writes (ARCH17):** use `invalidateQueries` after any mutation — not `setQueryData`.
- **Two-collection model (ARCH4):** `RestaurantCollectionScreen` shows restaurants that have at least one recipe with `status != 'removed'`. `useRestaurantsWithRecipes()` already implements this filter — use it as-is.
- **Status filtering (ARCH4):** the query filters `recipes.status != 'removed'` server-side. Never filter client-side by iterating the recipes array in the component.
- **No new Supabase client (ARCH2):** import exclusively from `@/lib/supabase`. No inline client creation.
- **No API keys in client (ARCH18, NFR7):** this story is read-only; no API route calls needed.

### Component Reuse — Do NOT Reinvent

- **`useRestaurantsWithRecipes()`** — `src/hooks/useRestaurants.ts` line 104. Returns `DomainRestaurant & { recipes: DomainRecipe[] }[]`. Recipe count = `restaurant.recipes.length` (already filtered).
- **`SPRING_CARD_EXPAND`** — `src/lib/springs.ts`. Use for `whileTap` transition. Do not hardcode spring values.
- **`FrostedCard`** — `src/components/ui/FrostedCard.tsx`. Use as the card surface wrapper if it accepts the required styling props; otherwise apply glass tokens directly via inline style.
- **`ErrorState`** — `src/components/ui/ErrorState.tsx`. Use for query error rendering.
- **Stagger pattern** — copy `containerVariants` / `itemVariants` from `RestaurantScreen.tsx` (lines 47–58). Do not create a new animation constant file.
- **Warm placeholder tile** — the `PlateIcon` + cream background pattern exists in `RestaurantScreen.tsx` (lines 1166–1185). Extract or replicate exactly — same colours, same icon proportions.

### DomainRestaurant Type (Key Fields for This Story)

```typescript
// From src/types/database.ts mapRestaurant output
interface DomainRestaurant {
  id: string                      // Supabase UUID
  placeId: string | null          // Google Places ID — prefer for navigation
  name: string
  address: string | null
  cuisineType: string | null
  referenceImageUrl: string | null // 68px photo; null → placeholder tile
  atmosphericPaletteJson: string | null
  rating: number | null
  userRatingsTotal: number | null
  createdAt: string
}
```

The `useRestaurantsWithRecipes()` hook returns `DomainRestaurant & { recipes: DomainRecipe[] }`. Recipe count = `restaurant.recipes.length`.

### Navigation Pattern

```typescript
// Navigating to a restaurant's dish list (existing RestaurantScreen):
router.push(`/restaurants/${restaurant.placeId ?? restaurant.id}?name=${encodeURIComponent(restaurant.name)}`)

// RestaurantScreen.tsx already reads placeId from the route param and
// nameFromUrl from the query string — this is the established pattern.
```

The `[id]` param in `/restaurants/[id]` is the Google Places ID (or Supabase UUID as fallback). `RestaurantScreen` handles both. Do not change the routing shape.

### UX Spec — RestaurantGridCard Exact Spec (UX-DR16)

```
Photo area:     68px height, full-width, object-cover
                Null photo → warm placeholder tile (no broken <img>)
Name:           12px semibold, var(--color-text-primary), 1 line truncated
Meta:           11px, var(--color-text-tertiary), "{N} dishes"
Surface:        --glass-base + lighter blur + 16px border-radius + --shadow-card
Press state:    scale(0.97), spring stiffness:400 damping:22
```

No additional content in the card. Resist the temptation to add a calorie summary or cuisine tag — the spec is intentionally minimal.

### Glass Token Reference (ARCH11)

```css
/* All defined in src/app/globals.css */
--glass-base:     rgba(255,255,255,0.12)
--glass-elevated: rgba(255,255,255,0.18)
--blur-base:      blur(20px)              /* "lighter blur" for grid cards */
--shadow-card:    0 2px 12px rgba(80,60,40,0.08), 0 1px 3px rgba(80,60,40,0.06)
--color-bg-elevated: (cream/warm white) used for warm placeholder tile
--color-text-primary: #1A1612
--color-text-tertiary: #9E9589
```

For grid cards, use `--glass-base` with the lighter `--blur-base` (not `--blur-elevated`). The UX spec calls this "lighter blur" for grid cards specifically.

### Accessibility Requirements (UX-DR24, NFR11, NFR12, NFR14)

- Each `RestaurantGridCard`: `role="button"`, `tabIndex={0}`, `aria-label="{name}, {count} dishes"`, `onKeyDown` for Enter/Space
- Grid container: `role="list"`, each card wrapper: `role="listitem"` — VoiceOver reads the collection as a list
- Loading skeleton: `aria-busy="true"` on the container, `aria-label="Loading restaurants"`, skeleton cells `aria-hidden="true"`
- Empty state: `role="main"` on content area; CTA has `aria-label="Open camera to scan a menu"`
- Touch targets: the full card is the tap target (inherently > 44×44px at 68px+ photo height); no invisible hitbox extension needed
- Focus indicators: `focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:outline-none` — same pattern as existing cards

### Offline Behaviour (NFR6, ARCH16)

TanStack Query's stale-while-revalidate strategy means `useRestaurantsWithRecipes()` returns cached data immediately if previously fetched. The collection renders from cache without a loading state on subsequent views. Do not add any special offline handling — the existing query config handles this.

### Reduced Motion (UX-DR25)

```typescript
import { useReducedMotion } from 'framer-motion'
const reducedMotion = useReducedMotion()

// In card press handler / stagger config:
// If reducedMotion: replace spring with { duration: 0.15, ease: 'easeOut' }
// Stagger entrance: if reducedMotion, all cards appear simultaneously (no staggerChildren)
```

Pattern is already used in `RestaurantScreen.tsx` line 195. Replicate exactly.

### File Structure (ARCH, project conventions)

```
src/
├── app/
│   └── restaurants/
│       ├── page.tsx                          ← NEW (Server Component shell)
│       └── [id]/
│           └── page.tsx                      ← NEW if missing (wraps RestaurantScreen)
├── components/
│   ├── screens/
│   │   └── RestaurantCollectionScreen.tsx    ← NEW ("use client")
│   └── ui/
│       └── RestaurantGridCard.tsx            ← NEW
```

Tests co-located with source (`*.test.tsx`) — this is the established project pattern.

### Small-Screen Grid Collapse (UX-DR28)

```css
/* From globals.css — already defined */
@media (max-width: 359px) {
  .collection-grid {
    grid-template-columns: 1fr;
  }
}
```

Apply `className="collection-grid grid grid-cols-2 gap-3 px-4"` to the grid container. The existing CSS media query handles the small-screen collapse automatically.

### Previous Story Patterns (Cross-Story Intelligence)

From Epic 3 stories (most recent completed work):

- **Photo state handling:** `recipe.photo_status` drives rendering decisions; for restaurants the equivalent is `reference_image_url` being null. The existing warm placeholder approach (cream background + `PlateIcon`) in `RestaurantScreen.tsx` is the established pattern.
- **Query hooks:** All hooks follow the pattern in `useRecipes.ts` — `useQuery` with explicit `queryKey`, `retry` logic that short-circuits on Supabase config errors.
- **Framer Motion stagger:** `containerVariants` + `itemVariants` pattern reused across `HomeScreen.tsx` and `RestaurantScreen.tsx`. Always stagger at 0.05–0.07s.
- **No manual cache writes:** Story 3.6 confirmed the `invalidateQueries` pattern is non-negotiable. `setQueryData` is only for optimistic updates on low-stakes UI (grocery check — not this story).
- **Test structure:** Test files import from `@testing-library/react` + `vi` (Vitest), mock Next.js hooks via `vi.mock('next/navigation')`, and wrap components in a `QueryClientProvider` test wrapper.

### AppShell/TabBar Routing Verification

Before writing any code, verify the current routing state:

1. Open `src/components/AppShell.tsx` and `src/components/layout/TabBar.tsx`
2. Confirm what route the Home tab currently navigates to
3. If it navigates to `/` or a placeholder — update to `/restaurants`
4. If `src/app/restaurants/page.tsx` does not exist — create it (Task 2)
5. If `src/app/restaurants/[id]/page.tsx` does not exist — create it as a thin wrapper around `RestaurantScreen`

This verification must happen before any component work — routing is the critical dependency.

### Project Structure Notes

- **Alignment:** New files follow `src/app/[route]/page.tsx` (Server Component) + `src/components/screens/[Name]Screen.tsx` (Client Component) split. All existing screens follow this pattern.
- **No detected conflicts:** `src/app/restaurants/` only has `[id]/` today (no `page.tsx`). Adding `page.tsx` at the parent route is clean.
- **`DomainRestaurant` type:** Fully defined in `src/types/database.ts`. No new types needed for this story.

### References

- Story acceptance criteria: `planning/epics.md` → "### Story 4.3: Restaurant Collection Screen"
- RestaurantGridCard UX spec: `planning/ux-design-specification.md` → "#### RestaurantGridCard / RecipeGridCard" (UX-DR16)
- `useRestaurantsWithRecipes` hook: `src/hooks/useRestaurants.ts` lines 54–108
- Spring constants: `src/lib/springs.ts` — `SPRING_CARD_EXPAND`
- Glass tokens: `src/app/globals.css`
- Warm placeholder tile pattern: `src/components/screens/RestaurantScreen.tsx` lines 1166–1185 (`PlateIcon`)
- Stagger animation pattern: `src/components/screens/RestaurantScreen.tsx` lines 47–58
- DomainRestaurant type: `src/types/database.ts` — `mapRestaurant` function
- Two-collection model: `planning/architecture.md` → "Data Architecture" → "Two-Collection Model"
- ARCH16 query key conventions: `planning/epics.md` → requirements section
- Test pattern reference: `src/components/scan/DishRowCompact.test.tsx`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None.

### Completion Notes List

- Created `RestaurantGridCard` with props `dishCount: number` + `onPress: () => void` (linter enforced naming; functionally matches spec). Glass surface uses `blur(16px) saturate(1.3)` (lighter blur per UX-DR16). `div role="listitem"` wraps the `motion.div role="button"` for standalone accessibility.
- Created `RestaurantCollectionScreen` with loading skeleton (4-cell pulse grid, `aria-busy`), error state (`ErrorState` component), empty state (exact copy of HomeScreen State 0 — same heading, copy, and terracotta CTA button), and stagger grid animation (0.05s stagger, `containerVariants`/`itemVariants` pattern from `RestaurantScreen.tsx`). Reduced-motion support: stagger zeroed when `useReducedMotion()` returns true, scale animation suppressed on card.
- Created `src/app/restaurants/page.tsx` (Server Component shell wrapping `RestaurantCollectionScreen`).
- Updated `src/components/layout/TabBar.tsx`: changed first tab from `href: "/"` to `href: "/restaurants"` (label: "Home"), updated `ACTIVE_PREFIXES` accordingly, simplified `isActive` logic.
- `src/app/restaurants/[id]/page.tsx` already existed and correctly wraps `RestaurantScreen` — no changes needed.
- All 29 new tests pass; full suite 424 passed / 0 failed.

### File List

- `src/components/ui/RestaurantGridCard.tsx` (NEW)
- `src/components/ui/RestaurantGridCard.test.tsx` (NEW)
- `src/components/screens/RestaurantCollectionScreen.tsx` (NEW)
- `src/components/screens/RestaurantCollectionScreen.test.tsx` (NEW)
- `src/app/restaurants/page.tsx` (NEW)
- `src/components/layout/TabBar.tsx` (MODIFIED — Home tab now routes to `/restaurants`)

## Change Log

- 2026-04-12: Story implemented by claude-sonnet-4-6. Created RestaurantGridCard, RestaurantCollectionScreen, /restaurants page. Updated TabBar to route first tab to /restaurants. 29 new tests added; 424 total passing.
