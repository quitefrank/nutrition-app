# Story 4.6: Home Screen Progressive States

## Status: ready-for-dev

## Story
As a user, I want the home screen to show me the most relevant content for where I am in my journey so that I always see something useful.

## Acceptance Criteria

1. **State 0 — Empty:** User has no restaurants or recipes. Full-screen atmospheric empty state renders: Playfair tagline "Take home the food you love", supporting subtext, a large terracotta "Scan a menu" primary CTA, and a secondary ghost "Find a restaurant" CTA. Layout and copy are identical to RestaurantCollectionScreen's empty state but composed for full-screen with the atmospheric background effect.

2. **State 1 — Has restaurants, no recent activity:** Renders a scrollable feed containing a "Your restaurants" HomeSection (up to 4 RestaurantGridCards) and a "Scan for something new" HomeSection placeholder. No HeroCard and no recent-activity section are shown.

3. **State 2 — Has recent dishes (visited within last 7 days):** Renders a HeroCard for the most recently visited restaurant at the top (full-bleed or near-full-bleed), followed by a "Recent dishes" HomeSection (up to 4 RecipeGridCards from that visit), followed by a "Your restaurants" HomeSection (remaining restaurants as RestaurantGridCards, up to 4). State 2 takes priority over State 1 when a recent restaurant exists.

4. **State 3 — Has many restaurants (5+):** This is a modifier applied to State 1 or State 2, not a separate screen. The "Your restaurants" HomeSection shows a "See all (N)" link (via the HomeSection `seeAll` prop) that navigates to `/restaurants`. The link is hidden when the restaurant count is 4 or fewer.

5. All transitions between states animate with `AnimatePresence` and fade/slide-in variants. When `useReducedMotion()` returns true, all animations use opacity only (no translate).

6. Tapping a RestaurantGridCard navigates to `/restaurants/[placeId ?? id]?name=...`. Tapping a RecipeGridCard navigates to `/recipes/[id]`. Tapping the HeroCard navigates to the same restaurant page route.

7. Tapping the "Scan a menu" CTA calls `openCamera()` from `useCameraContext()`. Tapping "Find a restaurant" renders `RestaurantSearchOverlay` inline (controlled by local `searchOpen` state).

8. The Home screen reads exclusively from `useRestaurantsWithRecipes()` (query key `['restaurants', 'with-recipes']`). No new API calls are introduced.

9. While the hook is pending, a skeleton loading state is displayed. When the hook returns an error, the shared `ErrorState` component is rendered.

## Technical Notes

### State derivation logic (client-side, from hook data)

```ts
// restaurants: (DomainRestaurant & { recipes: DomainRecipe[] })[]

const hasRestaurants = restaurants.length > 0

const recentRestaurant = restaurants.find(r => {
  const mostRecentDish = [...r.recipes].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0]
  return mostRecentDish && isWithin7Days(mostRecentDish.createdAt)
})

const hasRecent = !!recentRestaurant
const hasManyRestaurants = restaurants.length >= 5

// Primary state
// State 0: !hasRestaurants
// State 1: hasRestaurants && !hasRecent
// State 2: hasRestaurants && hasRecent  (takes priority over State 1)
// State 3: modifier — hasManyRestaurants adds "See all" to whichever state is active
```

### Component tree

```
HomeScreen
├── [isPending]  SkeletonFeed
├── [isError]    ErrorState
├── [State 0]    AtmosphericEmptyState (full-screen, same atmospheric bg as RestaurantScreen)
│   ├── Tagline (Playfair, "Take home the food you love")
│   ├── Subtext
│   ├── "Scan a menu" CTA → useCameraContext().openCamera()
│   └── "Find a restaurant" ghost CTA → setSearchOpen(true)
├── [State 1/2]  Scrollable feed (AnimatePresence)
│   ├── [State 2 only] HeroCard (most recent restaurant) → /restaurants/[placeId ?? id]
│   ├── [State 2 only] HomeSection "Recent dishes"
│   │   └── RecipeGridCard × (up to 4) → /recipes/[id]
│   └── HomeSection "Your restaurants" (seeAll={hasManyRestaurants ? `/restaurants` : undefined})
│       └── RestaurantGridCard × (up to 4) → /restaurants/[placeId ?? id]?name=...
└── RestaurantSearchOverlay (rendered when searchOpen === true)
```

### Animation contract

- Wrap state content in `<AnimatePresence mode="wait">` with keyed `<motion.div>` children.
- Default variants: `{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }`.
- Reduced motion variants: `{ hidden: { opacity: 0 }, visible: { opacity: 1 } }`.
- Use `useReducedMotion()` from Framer Motion to select the correct variant set.

### API / query contract

- Hook: `useRestaurantsWithRecipes()` — query key `['restaurants', 'with-recipes']`
- Return type: `{ data: (DomainRestaurant & { recipes: DomainRecipe[] })[], isPending, isError }`
- No new API routes. No new query keys.

### Context dependencies

- `useCameraContext()` from `@/contexts/CameraContext` — provides `openCamera()`
- `useRouter()` from `next/navigation` — for programmatic navigation

## Files to Create

- `src/components/screens/HomeScreen.tsx` — main screen component implementing all four states
- `src/components/screens/HomeScreen.test.tsx` — unit and interaction tests

## Files to Modify

- `src/app/page.tsx` — replace current placeholder or legacy HomeScreen import with `<HomeScreen />`

## Tests

- Renders the atmospheric empty state (State 0) when `useRestaurantsWithRecipes` returns an empty array
- Renders State 1 (RestaurantGridCards present, no HeroCard) when restaurants exist but none have dishes within the last 7 days
- Renders State 2 (HeroCard + "Recent dishes" section) when at least one restaurant has a recipe created within the last 7 days
- "See all (N)" link is visible when restaurant count is 5 or more
- "See all (N)" link is not rendered when restaurant count is 4 or fewer
- Tapping a RestaurantGridCard calls `router.push` with the correct `/restaurants/[placeId ?? id]?name=...` path
- Tapping a RecipeGridCard calls `router.push` with the correct `/recipes/[id]` path
- Tapping the HeroCard calls `router.push` with the restaurant page route
- Tapping "Scan a menu" CTA calls `openCamera()` from `useCameraContext()`
- Tapping "Find a restaurant" CTA renders `RestaurantSearchOverlay`
- Skeleton loading state is shown while `isPending` is true
- `ErrorState` component is rendered when `isError` is true
