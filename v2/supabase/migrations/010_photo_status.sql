-- 010_photo_status.sql
--
-- Adds the photo_status column to recipes, implementing the three-state
-- photo state machine described in the v2 architecture:
--
--   confirmed   — a Places (or CSE/MealDB) photo has been resolved and stored
--                 in dish_image_url; the dish card renders a real photo
--   placeholder — the dish was recognised but no photo has been found yet;
--                 the dish card renders a styled placeholder
--   suppressed  — the dish was not recognised (very low Gemini confidence);
--                 the dish card is omitted from the layout entirely
--
-- Default is 'placeholder' — the safe starting state for every new recipe.
-- Rows with dish_image_url already populated are back-filled to 'confirmed'.
--
-- Idempotent: safe to re-run against a live DB.

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS photo_status TEXT NOT NULL DEFAULT 'placeholder'
    CHECK (photo_status IN ('confirmed', 'placeholder', 'suppressed'));

-- Back-fill: recipes that already have a photo URL should be 'confirmed'
UPDATE recipes
  SET photo_status = 'confirmed'
  WHERE dish_image_url IS NOT NULL
    AND photo_status = 'placeholder';

-- Reload PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');
