-- Migration 005: Add rating columns for restaurants and dishes

-- Restaurant ratings (from Google Places API)
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS rating REAL,
  ADD COLUMN IF NOT EXISTS user_ratings_total INTEGER;

-- Dish ratings (from Gemini Search grounding)
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS dish_rating REAL,
  ADD COLUMN IF NOT EXISTS dish_review_snippet TEXT;

-- Reload PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');
