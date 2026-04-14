-- 012_missing_recipe_columns.sql
--
-- Adds two columns that the app code expects but are absent from the live DB:
--
--   recipes.estimated_calories  — integer; Gemini-provided calorie estimate.
--                                  In the initial schema (001) this was declared
--                                  but the live DB was provisioned via the
--                                  Supabase UI before 001 was applied, so the
--                                  column was never created.
--
--   recipes.removed_at          — soft-delete timestamp (NULL = active).
--   restaurants.removed_at      — soft-delete timestamp (NULL = active).
--                                  Used by DELETE /api/restaurants/[id] to
--                                  soft-delete a restaurant and its recipes.
--                                  Never added via a prior migration.
--
-- Idempotent: safe to re-run; all statements use IF NOT EXISTS guards.

-- ─── recipes ──────────────────────────────────────────────────────────────────

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS estimated_calories integer,
  ADD COLUMN IF NOT EXISTS removed_at         timestamptz;

-- ─── restaurants ──────────────────────────────────────────────────────────────

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS removed_at timestamptz;

-- ─── Reload PostgREST schema cache ───────────────────────────────────────────

SELECT pg_notify('pgrst', 'reload schema');
