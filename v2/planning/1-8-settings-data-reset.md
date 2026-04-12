# Story 1.8: Settings Screen & Data Reset

Status: done

## Story

As a user,
I want to access a Settings screen from the header and permanently clear all my data,
So that I have full control over what's stored on my device.

## Acceptance Criteria

1. Settings is reachable from any screen via a header icon; it does not occupy a primary nav tab
2. Data reset confirmed: all records in `restaurants`, `restaurant_visits`, `recipes`, `recipe_ingredients`, and `grocery_items` are deleted; user is navigated to empty home state
3. A confirmation modal is shown before any deletion occurs

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List

- 2026-04-12: Story implemented. Created `src/hooks/useDataReset.ts` — a TanStack React Query mutation that deletes all rows from all 5 tables in FK dependency order (grocery_items → recipe_ingredients → recipes → restaurant_visits → restaurants), then clears the query cache. Updated `src/components/screens/SettingsScreen.tsx` to use useDataReset instead of useDeleteAllRecipes, and added `router.push("/"); router.refresh()` after successful deletion to navigate to the empty home state.

### File List

- `src/hooks/useDataReset.ts` — new file: full data reset mutation
- `src/components/screens/SettingsScreen.tsx` — modified: uses useDataReset, navigates to home after reset
