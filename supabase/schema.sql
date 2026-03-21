-- Plately schema
-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/<your-project>/editor

-- ============================================================
-- RESTAURANTS
-- Stores restaurant identities and optional atmospheric data.
-- google_places_id is nullable — populated after Places API lookup.
-- ============================================================
CREATE TABLE restaurants (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    TEXT NOT NULL,
  google_places_id        TEXT UNIQUE,
  atmospheric_palette_json JSONB,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RECIPES
-- One row per saved dish/recipe.
-- restaurant_id is nullable (home-cooked meals have no restaurant).
-- confidence_metadata_json holds Gemini confidence scores per field.
-- ============================================================
CREATE TABLE recipes (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT NOT NULL,
  restaurant_id            UUID REFERENCES restaurants(id) ON DELETE SET NULL,
  dish_image_url           TEXT,
  confidence_metadata_json JSONB,
  serving_size             NUMERIC NOT NULL DEFAULT 1,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- RECIPE_INGREDIENTS
-- One row per ingredient in a recipe.
-- confidence_level: 'high' | 'medium' | 'low' (Gemini certainty)
-- ============================================================
CREATE TABLE recipe_ingredients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id        UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  quantity         TEXT,
  unit             TEXT,
  confidence_level TEXT NOT NULL CHECK (confidence_level IN ('high', 'medium', 'low'))
);

-- ============================================================
-- GROCERY_ITEMS
-- Aggregated shopping list entries.
-- recipe_id is nullable — user can add freeform items.
-- ============================================================
CREATE TABLE grocery_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id        UUID REFERENCES recipes(id) ON DELETE SET NULL,
  ingredient_name  TEXT NOT NULL,
  quantity         TEXT,
  unit             TEXT,
  checked          BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX recipes_restaurant_id_idx ON recipes(restaurant_id);
CREATE INDEX recipe_ingredients_recipe_id_idx ON recipe_ingredients(recipe_id);
CREATE INDEX grocery_items_recipe_id_idx ON grocery_items(recipe_id);
CREATE INDEX grocery_items_checked_idx ON grocery_items(checked);
