-- 006_patch_restaurants.sql
--
-- Ensures the restaurants table has all columns required by the v2 codebase.
-- The live DB may have been provisioned from a schema version that predates
-- some of these columns, causing silent insert failures in autoSaveToSupabase.
--
-- Safe to re-run: all statements are idempotent.
-- Apply via Supabase SQL Editor.

-- Core Google Places integration column
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS place_id text;

-- Add unique constraint on place_id if not already present
-- (safe: drops first in case of a name mismatch, then recreates)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'restaurants'::regclass
      AND contype = 'u'
      AND conname = 'restaurants_place_id_key'
  ) THEN
    ALTER TABLE restaurants ADD CONSTRAINT restaurants_place_id_key UNIQUE (place_id);
  END IF;
END
$$;

-- Rating columns (also added in 005, safe to repeat with IF NOT EXISTS)
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS rating REAL,
  ADD COLUMN IF NOT EXISTS user_ratings_total INTEGER;

-- Recipes: gemini_confidence (may be missing on older live DBs)
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS gemini_confidence REAL
    CHECK (gemini_confidence >= 0 AND gemini_confidence <= 1);

-- Recipes: dish_image_url (may be missing on older live DBs)
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS dish_image_url TEXT;

-- Grocery items: dish_name column (required by v2 domain types)
ALTER TABLE grocery_items
  ADD COLUMN IF NOT EXISTS dish_name TEXT;

-- Reload PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');
