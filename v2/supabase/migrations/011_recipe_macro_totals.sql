-- 011_recipe_macro_totals.sql
--
-- Story 3.6: Denormalised macro totals on recipes.
--
-- Adds four nullable numeric columns to the recipes table. These are written
-- once during Phase-2 enrichment (useEnrichment) and treated as a cache of
-- the sum of recipe_ingredients macro data. They remain null until enrichment
-- runs for a given recipe — null means "not yet enriched"; 0 is a valid stored
-- value meaning "enriched, and this macro is genuinely zero grams".
--
-- Columns:
--   total_protein_g — total protein in grams (from USDA-enriched ingredients)
--   total_carbs_g   — total carbohydrates in grams
--   total_fat_g     — total fat in grams
--   total_fibre_g   — dietary fibre in grams (always null until a future story
--                     adds fibre to the enrichment pipeline)
--
-- Null propagation: null in DB → null in DomainRecipe.totalProteinG →
--   null passed to DishRowCompact → hasMacros = false → chip row hidden.
--   This is the correct degraded state for un-enriched recipes.
--
-- Architecture guardrail (ARCH3): schema changes via numbered migration only.
-- Idempotent: safe to re-run with IF NOT EXISTS.

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS total_protein_g numeric,
  ADD COLUMN IF NOT EXISTS total_carbs_g   numeric,
  ADD COLUMN IF NOT EXISTS total_fat_g     numeric,
  ADD COLUMN IF NOT EXISTS total_fibre_g   numeric;

-- Reload PostgREST schema cache
SELECT pg_notify('pgrst', 'reload schema');
