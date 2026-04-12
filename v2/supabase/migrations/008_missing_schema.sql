-- 008_missing_schema.sql
--
-- Patches a live DB that was provisioned before or outside of migration 001.
-- Three things break when these are absent:
--   1. restaurants SELECT with ORDER BY created_at → 400 (column missing)
--   2. recipes SELECT with visit_id in the column list → 400 (column missing)
--   3. autoSaveToSupabase INSERT into restaurant_visits → 404 (table missing)
--
-- Safe to re-run: all statements are idempotent.
-- Apply via Supabase SQL Editor.

-- ─── Restaurants: ensure all expected columns exist ──────────────────────────

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS address                 TEXT,
  ADD COLUMN IF NOT EXISTS cuisine_type            TEXT,
  ADD COLUMN IF NOT EXISTS reference_image_url     TEXT,
  ADD COLUMN IF NOT EXISTS atmospheric_palette_json TEXT,
  ADD COLUMN IF NOT EXISTS created_at              TIMESTAMPTZ NOT NULL DEFAULT now();

-- ─── Restaurant visits table ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurant_visits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id   UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  visit_type      TEXT NOT NULL CHECK (visit_type IN ('scan', 'search')),
  raw_menu_json   TEXT,
  visited_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS restaurant_visits_restaurant_idx
  ON restaurant_visits(restaurant_id);

-- RLS: public read/write (personal app, no auth)
ALTER TABLE restaurant_visits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'restaurant_visits'
      AND policyname = 'Allow all'
  ) THEN
    CREATE POLICY "Allow all" ON restaurant_visits FOR ALL USING (true) WITH CHECK (true);
  END IF;
END
$$;

-- ─── Recipes: add visit_id FK now that the target table exists ───────────────

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS visit_id UUID REFERENCES restaurant_visits(id) ON DELETE SET NULL;

-- ─── Reload PostgREST schema cache ───────────────────────────────────────────

SELECT pg_notify('pgrst', 'reload schema');
