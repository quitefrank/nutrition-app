

# Replace Nutritionix with USDA FoodData Central

## Summary
Replace the Nutritionix integration with USDA FoodData Central (FDC) across the entire app. Since there is no existing food data in the database, we can safely rename the column.

---

## 1. Database Migration

Rename `nutritionix_id` to `fdc_id` in the `foods` table and update the unique constraint:

- Drop the existing unique index on `(user_id, nutritionix_id)`
- Rename column `nutritionix_id` to `fdc_id`
- Create new unique index on `(user_id, fdc_id)`
- Change the default for `source` from `'nutritionix'` to `'usda_fdc'`

## 2. Add FDC_API_KEY Secret

Request the `FDC_API_KEY` secret. Users can get a free API key from [https://fdc.nal.usda.gov/api-key-signup](https://fdc.nal.usda.gov/api-key-signup).

## 3. Replace Edge Functions

### `fdc-search` (replaces `nutritionix-search`)
- Calls `POST https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${FDC_API_KEY}`
- Body: `{ query, pageSize: 25, dataType: ["Foundation","SR Legacy","Survey (FNDDS)","Branded"] }`
- Returns: `{ results: [{ fdcId, description, brandOwner, dataType }] }`

### `fdc-ingest` (replaces `nutritionix-ingest`)
- Auth required, reads user from token
- Dedupe check: look for existing `(user_id, fdc_id)` match
- Fetches `GET https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${FDC_API_KEY}`
- Parses macros from `foodNutrients` by nutrient number: 208 (calories), 203 (protein), 204 (fat), 205 (carbs)
- Handles kJ-to-kcal conversion if needed
- All macros stored as per-100g; serving fields set to null for v1
- Source set to `"usda_fdc"`

### Delete old functions
- Remove `nutritionix-search` and `nutritionix-ingest` edge functions and their deployed instances

## 4. Update Frontend

### `FoodsPage.tsx`
- Change search to invoke `fdc-search` instead of `nutritionix-search`
- Change ingest to invoke `fdc-ingest` with `{ fdcId }` instead of `{ queryText, nutritionixId }`
- Display results showing `description` and `brandOwner` instead of `displayName` and `brandName`
- Update any "Nutritionix" labels to "USDA FoodData Central"

### `FoodsPage.tsx` detail dialog
- Label source as "USDA FDC" where applicable

### Other pages (RecipesPage, GroceriesPage, TodayPage)
- No changes needed -- they reference foods by `id`, not by source-specific fields

## 5. Files Changed

| File | Action |
|------|--------|
| `supabase/migrations/` (new) | Rename column, update index and default |
| `supabase/functions/fdc-search/index.ts` | New edge function |
| `supabase/functions/fdc-ingest/index.ts` | New edge function |
| `supabase/functions/nutritionix-search/index.ts` | Delete |
| `supabase/functions/nutritionix-ingest/index.ts` | Delete |
| `src/pages/FoodsPage.tsx` | Update to use FDC functions |

## Technical Details

### FDC Nutrient Parsing Logic
```text
for each nutrient in foodNutrients:
  if nutrient.nutrient.number == "208" -> calories (check unitName; if "kJ" divide by 4.184)
  if nutrient.nutrient.number == "203" -> protein
  if nutrient.nutrient.number == "204" -> fat  
  if nutrient.nutrient.number == "205" -> carbs
  value = nutrient.amount (already per 100g in FDC)
```

### No changes to
- Unit conversion (`src/lib/units.ts`)
- Recipe/daily log macro calculations
- Groceries logic
- Auth, navigation, or app shell
