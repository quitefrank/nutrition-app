-- 009_canonical_baseline.sql
--
-- Canonical v2 baseline — adds every column/constraint that 001 omitted
-- and that patches 002–008 introduced ad-hoc.
--
-- This migration is the new "start here" baseline for v2.
-- All future migrations (010+) should apply on top of this.
--
-- MIGRATION SEQUENCE CONTRACT:
-- All future schema changes must be applied via numbered migration files only.
-- No ad-hoc ALTER TABLE. New migrations must be numbered sequentially after the highest
-- existing migration number and be idempotent (IF NOT EXISTS / DO $$ BEGIN … END $$ guards).
--
-- Idempotent: every statement uses IF NOT EXISTS or DO $$ BEGIN … END $$ guards.
-- Safe to run against a live DB that already has 002–008 applied.
-- Also safe to run against a fresh DB that only has 001 applied.

-- ─── restaurants: rating columns (from 005 / 006) ─────────────────────────────

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS rating             REAL,
  ADD COLUMN IF NOT EXISTS user_ratings_total INTEGER;

-- ─── recipes: search-grounding rating columns (from 005 / 007) ───────────────

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS dish_rating         REAL,
  ADD COLUMN IF NOT EXISTS dish_review_snippet TEXT;

-- ─── grocery_items: dish provenance column (from 006) ────────────────────────

ALTER TABLE grocery_items
  ADD COLUMN IF NOT EXISTS dish_name TEXT;

-- ─── recipe_ingredients: unique constraint (from 003) ─────────────────────────
-- Ensures concurrent USDA enrichment write-backs can use ON CONFLICT upsert.
-- Deduplicates any existing rows before adding the constraint.

DELETE FROM recipe_ingredients a
USING recipe_ingredients b
WHERE a.recipe_id = b.recipe_id
  AND a.name      = b.name
  AND a.id        > b.id;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'recipe_ingredients'::regclass
      AND contype  = 'u'
      AND conname  = 'recipe_ingredients_recipe_id_name_key'
  ) THEN
    ALTER TABLE recipe_ingredients
      ADD CONSTRAINT recipe_ingredients_recipe_id_name_key UNIQUE (recipe_id, name);
  END IF;
END
$$;

-- ─── Reload PostgREST schema cache ───────────────────────────────────────────

SELECT pg_notify('pgrst', 'reload schema');
