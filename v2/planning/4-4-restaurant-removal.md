# Story 4.4: Restaurant Removal

## Status: ready-for-dev

## Story

As a user, I want to remove a restaurant from my collection so that I can keep my saved restaurants tidy.

## Acceptance Criteria

1. Long-pressing (500ms hold) a RestaurantGridCard on touch, or right-clicking on desktop, opens a context bottom sheet with "Remove restaurant" and "Cancel" options.
2. A dedicated "Remove" action is accessible from the restaurant detail screen header (three-dot menu or explicit button).
3. Tapping "Remove restaurant" shows a confirmation bottom sheet: "Remove [name]? This will also remove [N] dishes." with "Remove" (destructive, terracotta) and "Cancel" buttons.
4. On confirm: the card disappears immediately from the collection grid with a fade-out animation (`opacity: 0, scale: 0.95` over 200ms); the `DELETE /api/restaurants/[id]` call fires in the background (optimistic update).
5. If the DELETE fails: the card reappears in its original position; an inline error toast is displayed; the user can retry or dismiss.
6. Removing the last restaurant in the collection transitions the screen to the existing empty state.
7. The bottom sheet is keyboard accessible: focus is trapped inside while open; pressing Escape dismisses the sheet without removing anything.

## Technical Notes

### API Contract

`DELETE /api/restaurants/[id]`

- Validates `id` param as UUID format using Zod; returns `422` with error envelope on failure.
- Soft-deletes all matching recipes: `UPDATE recipes SET removed_at = NOW() WHERE restaurant_id = :id AND removed_at IS NULL`.
- Soft-deletes the restaurant row: `UPDATE restaurants SET removed_at = NOW() WHERE id = :id AND removed_at IS NULL`.
- Returns `{ success: true }` on success (`200`).
- Returns `{ error: { code: "NOT_FOUND", message: "Restaurant not found" } }` (`404`) if restaurant does not exist or is already removed.
- Returns `{ error: { code: "INVALID_ID", message: "id must be a valid UUID" } }` (`422`) for malformed id.
- Auth: row-level security via Supabase anon key. Uses `createClient()` from `@/lib/supabase/server`.

### Database Schema (existing)

```
restaurants: id (uuid PK), place_id, name, address, cuisine_type, ..., removed_at (timestamptz nullable)
recipes:     id (uuid PK), restaurant_id (uuid FK), ..., removed_at (timestamptz nullable)
```

Soft-delete: set `removed_at = NOW()`. The existing `useRestaurantsWithRecipes` hook already filters `WHERE removed_at IS NULL` — no changes needed there.

### Component Tree

```
RestaurantCollectionScreen
  └─ RestaurantGridCard (+ onLongPress prop)
       └─ [long-press / right-click] → sets removingRestaurantId
  └─ RemoveRestaurantSheet (rendered when removingRestaurantId is set)
       └─ BottomSheet (reusable)
```

### Animation & Glass Conventions

- **BottomSheet:** `--glass-base` background, `--shadow-float` shadow, `22px` top border radius, spring transition (`y: '100%' → 0`). `useReducedMotion()` gates translate animation — opacity-only fallback when reduced motion is preferred.
- **Card fade-out:** `opacity: 0, scale: 0.95` over 200ms with Framer Motion `AnimatePresence` before unmounting the card from the grid.
- **Destructive button:** `background: var(--color-accent)` (#C4622D terracotta).

### Architecture Rules

- **ARCH7:** DELETE route returns `{ success: true }` or `{ error: { code, message } }`.
- **ARCH8:** Validate `id` as UUID with Zod before any DB access.
- **ARCH16:** Mutation key `['restaurants', 'remove', id]`; invalidates `['restaurants', 'with-recipes']` on success.
- **ARCH18:** Supabase client in route.ts uses `createClient()` from `@/lib/supabase/server`.

### Long-Press Implementation

`RestaurantGridCard` gains an `onLongPress?: () => void` prop. Implementation:
- `onContextMenu`: fires `onLongPress` immediately (right-click / desktop).
- `onPointerDown`: starts a 500ms timer; `onPointerUp` / `onPointerCancel` / `onPointerLeave` clear it.
- No existing props or tests are broken; `onLongPress` is purely additive.

### TanStack Mutation

`useRemoveRestaurant` performs an optimistic update:
1. `onMutate`: snapshot current `['restaurants', 'with-recipes']` cache; remove the target restaurant from the snapshot; write the snapshot back via `queryClient.setQueryData`.
2. `onError`: restore snapshot via `queryClient.setQueryData`; surface inline error toast.
3. `onSettled`: call `queryClient.invalidateQueries({ queryKey: ['restaurants', 'with-recipes'] })`.

## Files to Create

- `src/app/api/restaurants/[id]/route.ts` — DELETE handler (soft-delete restaurant + recipes)
- `src/components/ui/BottomSheet.tsx` — reusable slide-up sheet with backdrop, focus trap, spring animation, reduced-motion fallback
- `src/components/ui/RemoveRestaurantSheet.tsx` — confirmation sheet; shows restaurant name + dish count; destructive confirm button; uses `useRemoveRestaurant()`
- `src/hooks/useRemoveRestaurant.ts` — TanStack mutation with optimistic update

## Files to Modify

- `src/components/ui/RestaurantGridCard.tsx` — add optional `onLongPress?: () => void` prop; wire to `onContextMenu` and 500ms `onPointerDown` timer
- `src/components/screens/RestaurantCollectionScreen.tsx` — manage `removingRestaurantId: string | null` state; pass `onLongPress` to each card; render `RemoveRestaurantSheet`; wrap grid items in `AnimatePresence` for fade-out

## Tests

- `src/components/ui/BottomSheet.test.tsx`
  - Renders children when `isOpen` is true
  - Does not render children (or is hidden) when `isOpen` is false
  - Backdrop click calls `onClose`
  - Escape key press calls `onClose`
  - Focus is trapped inside the sheet while open

- `src/components/ui/RemoveRestaurantSheet.test.tsx`
  - Displays the restaurant name in the confirmation copy
  - Displays the correct dish count in the confirmation copy
  - Calls the `useRemoveRestaurant` mutation and then `onClose` when "Remove" is confirmed
  - Calls `onClose` without firing a mutation when "Cancel" is tapped

- `src/hooks/useRemoveRestaurant.test.ts`
  - Calls `DELETE /api/restaurants/:id` with the correct id
  - Invalidates `['restaurants', 'with-recipes']` on success
  - Restores optimistic cache snapshot on error

- `src/app/api/restaurants/[id]/route.test.ts`
  - Returns `200 { success: true }` and soft-deletes both the restaurant and its recipes
  - Returns `422` with error envelope for a non-UUID id param
  - Returns `404` with error envelope when the restaurant does not exist or is already removed
