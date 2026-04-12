-- 003_unique_ingredient_per_recipe.sql
--
-- Adds a unique constraint on (recipe_id, name) so that concurrent enrichment
-- write-backs can use INSERT … ON CONFLICT DO UPDATE (upsert) safely.
--
-- Without this constraint, two parallel fire-and-forget write-backs can both
-- see an empty existingNames set and both INSERT — producing duplicate rows
-- with different USDA matches for the same ingredient.
--
-- Applied manually via Supabase SQL Editor on 2026-04-10.
-- NOTE: This migration uses DROP CONSTRAINT IF EXISTS + ADD CONSTRAINT (not a DO $$ IF NOT EXISTS
-- guard). Re-running it is safe (DROP clears the way) but briefly removes the constraint during
-- execution. Migration 009 supersedes this with a proper idempotent guard — prefer 009 for fresh
-- environments.

-- First, remove any existing duplicates (keep lowest id per recipe+name).
-- This must run before adding the constraint or it will fail.
DELETE FROM recipe_ingredients a
USING recipe_ingredients b
WHERE a.recipe_id = b.recipe_id
  AND a.name = b.name
  AND a.id > b.id;

-- Historical one-time data fix (2026-04-10): removed a specific bad USDA match for 'Mixed Greens'
-- that had an implausibly high calorie value (>50 kcal for a leafy-green serving). This is a
-- one-off cleanup tied to a known data quality incident — do not use this pattern in future
-- migrations.
DELETE FROM recipe_ingredients
WHERE name = 'Mixed Greens'
  AND calories_per_serving > 50;

-- Add the unique constraint
ALTER TABLE recipe_ingredients
  DROP CONSTRAINT IF EXISTS recipe_ingredients_recipe_id_name_key;

ALTER TABLE recipe_ingredients
  ADD CONSTRAINT recipe_ingredients_recipe_id_name_key UNIQUE (recipe_id, name);
