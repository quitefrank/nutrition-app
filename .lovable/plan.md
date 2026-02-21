
# MacroLite Feature Update Plan

## Overview
Five changes: black preview background, food delete/replace, recipe edit/delete, groceries UX overhaul, and smarter USDA search sorting.

---

## 1. Preview Background Black

**File: `src/components/AppShell.tsx`**

Wrap the existing container in an outer `div` with `bg-black min-h-screen flex justify-center`. The inner container gets `bg-background` explicitly.

**File: `src/components/BottomNav.tsx`**

Constrain the nav bar to the phone container width instead of full-screen `left-0 right-0`. Use a centered approach matching the `max-w-lg` container.

---

## 2. Foods Page: Delete + Replace Food

**File: `src/pages/FoodsPage.tsx`**

Add two buttons to the existing food detail dialog:

### A) Delete Food
- Mutation checks `recipe_items`, `daily_log_items`, `groceries` for rows referencing `selectedFood.id`
- If references found: show an AlertDialog with counts and "Delete and remove references" option
- Cascade: delete dependent rows first, then the food
- Invalidate queries: `my_foods`, `recipes`, `groceries`, `daily_log_items`

### B) Replace Food
- New dialog state for replacement flow with two modes:
  1. Pick from existing cached foods (Select dropdown)
  2. Search USDA and ingest a new food (reuse existing `fdc-search` / `fdc-ingest` flow)
- Once replacement food is selected, call a new edge function `food-replace`

**New file: `supabase/functions/food-replace/index.ts`**

Edge function that:
- Accepts `{ oldFoodId, newFoodId }`
- Fetches new food's per-100g macros
- Updates `recipe_items` where `food_id = oldFoodId`: sets `food_id = newFoodId`, recomputes `calories`, `protein`, `carbs`, `fat` using each row's `grams_equivalent` and new macros
- Updates `daily_log_items` where `food_id = oldFoodId`: same recomputation
- Updates `groceries` where `food_id = oldFoodId`: sets `food_id = newFoodId`
- Returns `{ recipeItems, logItems, groceryItems }` counts

---

## 3. Recipes Page: Edit + Delete Recipe

**File: `src/pages/RecipesPage.tsx`**

### A) Edit Recipe
- Add edit mode toggle in the detail dialog
- Editable fields: `name` and `servings`
- Save mutation updates the `recipes` row, invalidates queries, shows toast

### B) Delete Recipe
- AlertDialog confirmation
- Cascade delete: `recipe_items` then `daily_log_items` (where `recipe_id` matches), then the recipe itself
- Close dialog, invalidate queries, toast

---

## 4. Groceries Page: Filter Dropdown + Status Dropdown + Checkbox

**File: `src/pages/GroceriesPage.tsx`**

### A) Filter dropdown
- Replace the four filter buttons with a single `Select` component (options: all, need, low, have)

### B) Status dropdown per item
- Replace the clickable Badge with a `Select` per row (options: need, low, have)
- `onValueChange` updates the row's status in Supabase

### C) Checkbox for shopping flow
- When an item's status is `need`, render a Checkbox on the left
- Checking it sets status to `have` immediately
- Item disappears from view if filter is `need`

---

## 5. USDA Search: Sort by Closest Match

**File: `supabase/functions/fdc-search/index.ts`**

Add a scoring function after receiving FDC results:
- Normalize query and descriptions (lowercase, trim, collapse whitespace, remove punctuation)
- Score each result:
  - +100 for exact match
  - +50 if description starts with query
  - +10 per query token found in description
  - +5 bonus for Foundation / SR Legacy data types
  - Subtract a fraction of Levenshtein distance (simple implementation) between query and beginning of description
- Sort descending by score before returning

---

## Files Summary

| File | Action |
|------|--------|
| `src/components/AppShell.tsx` | Edit -- black outer wrapper |
| `src/components/BottomNav.tsx` | Edit -- constrain to phone container |
| `src/pages/FoodsPage.tsx` | Edit -- add delete/replace to detail dialog |
| `src/pages/RecipesPage.tsx` | Edit -- add edit/delete to detail dialog |
| `src/pages/GroceriesPage.tsx` | Edit -- dropdown filter, status select, checkbox |
| `supabase/functions/fdc-search/index.ts` | Edit -- add scoring + sorting |
| `supabase/functions/food-replace/index.ts` | New -- server-side food replacement |
