

# Photo Scan: Fully Automatic AI Food/Recipe Scanner

## Overview
Replace the existing multi-step `/ai` route with a single-tap `/scan` flow. The user photographs a food or recipe, the AI classifies it, extracts ingredients with amounts, the app auto-matches USDA data, computes macros, and saves -- all without confirmation screens. An "Undo" toast allows reverting.

---

## 1. New Edge Function: `ai-scan`

**File: `supabase/functions/ai-scan/index.ts`** (new)

- Accepts `{ imageBase64: string }`
- Calls Lovable AI Gateway with `google/gemini-2.5-flash` (multimodal, already provisioned via `LOVABLE_API_KEY`)
- Uses tool calling with a function `scan_food_or_recipe` that returns:
  ```
  {
    type: "food" | "recipe",
    title: string | null,
    servings: number | null,
    items: [{
      name: string,
      quantity: number | null,
      unit: string | null,
      grams_estimate: number | null
    }]
  }
  ```
- System prompt rules:
  - Classify as "recipe" if multiple ingredient lines, steps, or ingredient list visible; otherwise "food"
  - Always try to return quantity + unit
  - If quantity/unit not readable, MUST provide `grams_estimate`
  - For piece-based amounts (slice, clove, piece), always include `grams_estimate`
  - Return JSON only, never ask user questions
- Handles 429/402 errors

**Config: `supabase/config.toml`** -- add `[functions.ai-scan]` with `verify_jwt = false`

---

## 2. New Page: `src/pages/ScanPage.tsx`

Single-screen flow with three visual states:

### State: idle
- Camera/file upload input (mobile-friendly, `accept="image/*" capture="environment"`)
- Single "Scan" button (no photo/text toggle)
- No optional text input

### State: scanning (loading)
- Spinner with status messages ("Analyzing...", "Matching USDA...", "Computing macros...", "Saving...")

### State: done (results)
- Summary card showing:
  - Type badge: "Food" or "Recipe"
  - Title
  - For recipe: total macros + per-serving macros
  - For food: portion macros
- Compact breakdown list: each item showing name, amount display (`{qty} {unit}` or `~{grams_estimate} g estimated`), and per-item macros
- "Scan Another" button to reset

### Auto-pipeline (triggered on Scan tap):
1. Convert image to base64, call `ai-scan`
2. For each returned item:
   - Call `fdc-search` with `item.name`
   - Take top result
   - Call `fdc-ingest` for that fdcId to ensure cached
3. Determine `grams_equivalent` per item:
   - If `grams_estimate` provided by AI, use it
   - Else if `quantity` + `unit` present and unit is in supported list (g, ml, tbsp, tsp, cup, oz, lb), convert
   - Else default to 100g for food type, 0g for recipe items (should be rare)
4. Compute macros: `calories = grams_equivalent * calories_per_100g / 100` (same for protein, carbs, fat)
5. Auto-save:
   - **If type="recipe"**: Insert `recipes` row (name = title or "Scanned Recipe", servings = servings or 1), then insert `recipe_items` rows
   - **If type="food"**: Upsert today's `daily_logs` row, insert `daily_log_items` row
6. Show toast: "Saved! Undo" with action button
7. Transition to done state

### Undo logic:
- Track created IDs (recipe ID + recipe_item IDs, or daily_log_item ID)
- On Undo click:
  - If recipe: delete recipe_items, then delete recipe row
  - If food log: delete the daily_log_item row; if the daily_log has no remaining items, delete it too
- Show toast "Undone"
- Reset to idle state

---

## 3. Navigation Updates

**File: `src/App.tsx`**
- Replace the `/ai` route with `/scan` route pointing to `ScanPage`
- Remove `AIPage` import, add `ScanPage` import

**File: `src/components/BottomNav.tsx`**
- Replace the AI tab with: `{ to: '/scan', icon: ScanLine, label: 'Scan' }` using `ScanLine` from lucide-react

---

## 4. Cleanup

**File: `src/pages/AIPage.tsx`** -- delete (replaced by ScanPage)

The existing `ai-decompose` and `ai-create-recipe` edge functions remain in place since they may be used by other flows, but could be removed later.

---

## Files Summary

| File | Action |
|------|--------|
| `supabase/functions/ai-scan/index.ts` | New -- vision classify + extract |
| `src/pages/ScanPage.tsx` | New -- fully automatic scan page |
| `src/App.tsx` | Edit -- swap /ai for /scan |
| `src/components/BottomNav.tsx` | Edit -- swap AI tab for Scan tab |
| `src/pages/AIPage.tsx` | Delete |
| `supabase/config.toml` | Edit -- add ai-scan function |

No new secrets needed (`LOVABLE_API_KEY` is already provisioned). No database migrations needed.

---

## Technical Details

### Grams resolution priority
```text
1. AI provides grams_estimate  -->  use grams_estimate
2. AI provides quantity + supported unit  -->  convert (g=1, ml=1, tbsp=15, tsp=5, cup=240, oz=28.35, lb=453.59)
3. Fallback  -->  100g for food, 0g for recipe item (edge case)
```

### Amount display logic
- If quantity + unit available: show `"{quantity} {unit}"`
- Else if grams_estimate: show `"~{grams_estimate}g (est.)"`
- Never show blank amounts

### Tool calling schema for ai-scan
```typescript
tools: [{
  type: "function",
  function: {
    name: "scan_food_or_recipe",
    parameters: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["food", "recipe"] },
        title: { type: "string", nullable: true },
        servings: { type: "number", nullable: true },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "number", nullable: true },
              unit: { type: "string", nullable: true },
              grams_estimate: { type: "number", nullable: true }
            },
            required: ["name"]
          }
        }
      },
      required: ["type", "items"]
    }
  }
}]
```

### Undo data structure tracked in React state
```typescript
interface UndoData {
  type: 'recipe' | 'food';
  recipeId?: string;
  recipeItemIds?: string[];
  logItemId?: string;
  dailyLogId?: string;
  dailyLogWasNew?: boolean;
}
```

