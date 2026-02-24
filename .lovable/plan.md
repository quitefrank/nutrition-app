

# AI Photo Recipe Import

## Overview
Add a new `/ai` route with a multi-stage pipeline: photograph a recipe, AI decomposes it into structured ingredients, auto-match against USDA, let the user review/edit, then create the recipe with accurate macros.

---

## Architecture

The pipeline has 5 stages, managed as React state on a single page component:

```text
[Upload Photo] --> [AI Decompose] --> [USDA Match] --> [User Review/Edit] --> [Create Recipe]
     Stage 0          Stage 1            Stage 2            Stage 3              Stage 4
```

---

## 1. New Edge Function: `ai-decompose`

**File: `supabase/functions/ai-decompose/index.ts`**

- Accepts `{ imageBase64: string, userContext?: string }`
- Calls Lovable AI Gateway (`https://ai.gateway.lovable.dev/v1/chat/completions`) with model `google/gemini-2.5-flash` (multimodal, cost-effective)
- Uses tool calling to extract structured output (not raw JSON in prompt)
- Tool definition:
  - Function name: `extract_recipe`
  - Parameters schema:
    - `title`: string or null
    - `servings`: number or null
    - `ingredients`: array of `{ rawLine, normalizedName, quantity (number|null), unit (string|null), confidence (0-1) }`
- System prompt instructs the model to:
  - Extract recipe title if present
  - Extract servings if visible
  - List every ingredient line
  - Normalize names to plain English food terms
  - Prefer metric units
  - Never invent quantities -- set to null if unclear
  - Set confidence 0-1 per ingredient
- Uses `LOVABLE_API_KEY` (already provisioned)
- Image sent as a data URL in the user message content array (multimodal format)
- Returns the parsed tool call arguments directly
- Handles 429/402 errors and surfaces them

**Config: `supabase/config.toml`** -- add `[functions.ai-decompose]` with `verify_jwt = false`

---

## 2. New Edge Function: `ai-create-recipe`

**File: `supabase/functions/ai-create-recipe/index.ts`**

- Accepts:
  ```
  {
    title: string,
    servings: number,
    ingredients: [{ fdcId: string, quantity: number, unit: string }]
  }
  ```
- For each ingredient:
  - Call `fdc-ingest` logic inline (or query foods table for cached entry): ensure food exists in DB
  - Convert unit to grams using the same conversion map from `src/lib/units.ts`
  - Compute macros: `calories = grams * calories_per_100g / 100` (same for protein, carbs, fat)
- Create `recipes` row with title and servings
- Batch insert `recipe_items` rows
- Return `{ recipeId, itemCount }`

**Config: `supabase/config.toml`** -- add `[functions.ai-create-recipe]` with `verify_jwt = false`

---

## 3. New Page: `src/pages/AIPage.tsx`

Multi-stage wizard managed by a `stage` state variable (0-4).

### Stage 0: Upload
- Toggle between "Photo" and "Photo and Text" modes (using existing Toggle/Button components)
- File input accepting image/* with camera capture (`capture="environment"`)
- Optional text input for user context (visible in "Photo and Text" mode)
- "Analyze" button -- converts image to base64, calls `ai-decompose`
- Loading state with spinner

### Stage 1-2: Processing (automatic)
- After decompose returns, automatically run USDA matching:
  - For each ingredient, call existing `fdc-search` edge function with `normalizedName`
  - Take the top result as auto-selected match
  - Store `matchConfidence` based on search ranking position
- Advance to Stage 3 (review)

### Stage 3: Review and Edit
- Display recipe title (editable Input)
- Display servings (editable Input)
- Editable table with columns:
  - Ingredient name (editable Input, pre-filled with `normalizedName`)
  - Quantity (editable number Input -- empty/highlighted if null)
  - Unit (Select dropdown with SUPPORTED_UNITS)
  - USDA Match (Select dropdown showing top 5 search results per ingredient, auto-selected to best match)
  - Confidence badge: green if >= 0.6, yellow/orange if < 0.6
- Issues summary panel at top:
  - Count of missing quantities
  - Count of low-confidence matches (< 0.6)
  - Piece-based units warning (if unit is "piece", "whole", etc.)
- "Add Row" button to manually add ingredient rows
- "Refine with AI" button (calls ai-decompose again with current structured data as context to improve clarity)
- Live macro preview:
  - For each row where quantity, unit, and USDA match are all set: compute grams_equivalent and macros from the matched food's per-100g values
  - Show running total and per-serving breakdown at the bottom
  - Recomputes on every field change (Step 5 requirement)
- "Create Recipe" button -- calls `ai-create-recipe`

### Stage 4: Done
- Success message with link to the new recipe on `/recipes`
- "Import Another" button to reset

### UI Components Used
- Card, Input, Button, Select, Badge, Dialog (all existing shadcn/ui)
- Table components for the review grid
- Toast for feedback

---

## 4. Navigation Updates

**File: `src/App.tsx`**
- Add route: `<Route path="/ai" element={<AIPage />} />`

**File: `src/components/BottomNav.tsx`**
- Add fifth tab: `{ to: '/ai', icon: Camera, label: 'AI' }` using `Camera` from lucide-react

---

## 5. Files Summary

| File | Action |
|------|--------|
| `supabase/functions/ai-decompose/index.ts` | New -- vision decomposition via Lovable AI |
| `supabase/functions/ai-create-recipe/index.ts` | New -- batch ingest + recipe creation |
| `supabase/config.toml` | Edit -- add two new function configs |
| `src/pages/AIPage.tsx` | New -- multi-stage wizard page |
| `src/App.tsx` | Edit -- add /ai route |
| `src/components/BottomNav.tsx` | Edit -- add AI tab |

No database migrations needed -- uses existing `recipes`, `recipe_items`, and `foods` tables.

---

## Technical Details

### Multimodal message format for Lovable AI
```typescript
messages: [
  { role: "system", content: systemPrompt },
  {
    role: "user",
    content: [
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
      { type: "text", text: userContext || "Extract the recipe from this image." }
    ]
  }
]
```

### Tool calling schema for structured extraction
```typescript
tools: [{
  type: "function",
  function: {
    name: "extract_recipe",
    description: "Extract structured recipe data from the image",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", nullable: true },
        servings: { type: "number", nullable: true },
        ingredients: {
          type: "array",
          items: {
            type: "object",
            properties: {
              rawLine: { type: "string" },
              normalizedName: { type: "string" },
              quantity: { type: "number", nullable: true },
              unit: { type: "string", nullable: true },
              confidence: { type: "number" }
            },
            required: ["rawLine", "normalizedName", "confidence"]
          }
        }
      },
      required: ["ingredients"]
    }
  }
}]
```

### Unit conversion reuse
The `ai-create-recipe` edge function will duplicate the conversion map from `src/lib/units.ts` (g, ml, tbsp, tsp, cup, oz, lb) since edge functions cannot import from `src/`.

### Live macro recalculation (Stage 3)
Client-side computation using the USDA food data already fetched during matching:
```typescript
const grams = quantity * conversionFactor[unit];
const cal = (grams * food.calories_per_100g) / 100;
// same for protein, carbs, fat
```
Runs on every state change to quantity, unit, or food selection fields.

### Error handling
- 429 (rate limit) and 402 (payment required) from Lovable AI are caught in the edge function and surfaced as toast messages on the frontend
- Missing quantities flagged visually but do not block review -- user must fill them before "Create Recipe" is enabled

