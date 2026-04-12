-- 007_recipe_ratings.sql
--
-- Adds dish_rating and dish_review_snippet to recipes if missing.
-- Migration 005 adds these columns, but the live DB may not have had
-- 005 applied, causing the enrich route's write-back to fail silently
-- (Supabase rejects the entire update when any named column is absent).
--
-- Safe to re-run: idempotent.
-- Apply via Supabase SQL Editor.

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS dish_rating REAL,
  ADD COLUMN IF NOT EXISTS dish_review_snippet TEXT;

-- Reload PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');
