-- 002_patch_missing_columns.sql
--
-- Patches columns that were absent from the live database due to schema drift.
-- The initial migration (001) defines these columns, but the live Supabase project
-- was provisioned from an earlier version of the schema that did not include them,
-- causing all recipe_ingredients INSERTs to fail silently at runtime.
--
-- Applied manually via Supabase SQL Editor on 2026-04-10.
-- All statements are idempotent (IF NOT EXISTS / IF EXISTS guards).

-- ─── recipe_ingredients: add missing nutrition + metadata columns ──────────────

ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS usda_fdc_id          integer,
  ADD COLUMN IF NOT EXISTS calories_per_serving  real,
  ADD COLUMN IF NOT EXISTS protein_g             real,
  ADD COLUMN IF NOT EXISTS fat_g                 real,
  ADD COLUMN IF NOT EXISTS carbs_g               real,
  ADD COLUMN IF NOT EXISTS confidence            text NOT NULL DEFAULT 'medium'
    CHECK (confidence IN ('high', 'medium', 'low'));

-- Drop the legacy column name present in the old schema version.
-- confidence_level → confidence (matches codebase and 001 schema).
ALTER TABLE recipe_ingredients
  DROP COLUMN IF EXISTS confidence_level;

-- ─── recipes: add status tracking column ──────────────────────────────────────
-- The canonical 001 schema uses a recipe_status enum type; the live DB received
-- a text column with an equivalent CHECK constraint during the patch.

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'auto_captured'
    CHECK (status IN ('auto_captured', 'kept', 'removed'));
