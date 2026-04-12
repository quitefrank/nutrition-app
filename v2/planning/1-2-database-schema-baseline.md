# Story 1.2: Database Schema Baseline

Status: review

## Story

As a developer,
I want the complete v2 5-table schema applied via a single canonical migration, with all prior patch migrations superseded,
So that the schema is auditable and applied deterministically in any environment.

## Acceptance Criteria

1. **Given** patch migrations 002–008 exist as ad-hoc fixes
   **When** the canonical migration is written
   **Then** migration `009` consolidates all columns, constraints, and indexes introduced by patches 002–008 into a single idempotent file. The authoritative baseline for any environment is the full sequence: `001` → `009` → `010`. Migration `001` remains load-bearing (table creation, enums, sentinel row, base indexes) and must not be removed.

2. **Given** the canonical migration is applied to a clean database
   **When** queried
   **Then** `restaurant_visits.visit_type` enforces values `scan | search` via a CHECK constraint; `recipes.status` enforces values `auto_captured | kept | removed` via either a PostgreSQL enum type (fresh install via `001`) or a TEXT CHECK constraint (live DB patched by `002`) — both are accepted and functionally equivalent; `recipes.photo_status` enforces values `confirmed | placeholder | suppressed` via a TEXT CHECK constraint

3. **Given** all schema changes going forward
   **When** a developer adds a column or table
   **Then** it is applied only through a new numbered migration file — no `ALTER TABLE` outside of migrations

## Tasks / Subtasks

- [x] Task 1: Verify the complete schema is covered by `001` + `009` + `010` (AC: #1, #2)
  - [x] 1.1 — Cross-reference all columns in `src/types/database.ts` (the TypeScript contract) against what `001_initial_schema.sql`, `009_canonical_baseline.sql`, and `010_photo_status.sql` collectively define
  - [x] 1.2 — Confirm all 5 ARCH6 tables are present with correct column names, types, and constraints (see ARCH6 Schema Contract in Dev Notes below)
  - [x] 1.3 — Verify `recipes.status` CHECK constraint covers `'auto_captured'`, `'kept'`, `'removed'` (in `001` via the `recipe_status` enum type, and in `002` via a TEXT CHECK for live DBs)
  - [x] 1.4 — Verify `recipes.photo_status` CHECK constraint covers `'confirmed'`, `'placeholder'`, `'suppressed'` (in `010`)
  - [x] 1.5 — Verify `restaurant_visits.visit_type` CHECK constraint covers `'scan'`, `'search'` (in `001` and `008`)
  - [x] 1.6 — Confirm the unique constraint on `recipe_ingredients(recipe_id, name)` is present (in `009`, added idempotently)
  - [x] 1.7 — Confirm `grocery_items` uses `checked` (not `is_checked`) and `recipe_ids` (not `added_from_recipe_id`) — this is a known ARCH6 doc discrepancy; actual code and DB use the shorter names

- [x] Task 2: Write `011_` migration only if a genuine gap is found (AC: #1)
  - [x] 2.1 — If Task 1 confirms no gaps: skip this task entirely; document the verification result in Dev Agent Record

- [x] Task 3: Add the migration sequence contract comment to `009_canonical_baseline.sql` if not already present (AC: #3)
  - [x] 3.1 — Story 1.1 completion notes confirm the comment was added in that story; verify it still reads correctly and add nothing if it does

- [x] Task 4: Confirm TypeScript types align with the schema (AC: #1, #2)
  - [x] 4.1 — `RecipeStatusEnum` in `src/types/database.ts` must match `['auto_captured', 'kept', 'removed']`
  - [x] 4.2 — `PhotoStatusEnum` must match `['confirmed', 'placeholder', 'suppressed']`
  - [x] 4.3 — `VisitTypeEnum` must match `['scan', 'search']`
  - [x] 4.4 — All 5 tables must have a corresponding Row schema in `database.ts`

- [x] Task 5: Document verification outcome (AC: #3)
  - [x] 5.1 — Add a Completion Note in Dev Agent Record confirming which tables/columns were verified, whether any gap was found, and what (if any) new migration was written

## Dev Notes

### Pre-story Audit: Migration State as of Story 1.1 Completion

Story 1.1 (Task 3) verified the migration baseline and confirmed:

- `001` + `009` + `010` together cover all 5 ARCH6 tables
- No `011_*.sql` was needed as of 2026-04-13
- ARCH6 doc has stale column names for `grocery_items`: actual DB and TypeScript use `checked` (not `is_checked`) and `recipe_ids` (not `added_from_recipe_id`)

**The primary work of this story is verification, not new migration writing.** If the 1.1 audit was thorough, this story may resolve entirely as a schema documentation pass with a Completion Note confirming nothing changed.

---

### ARCH6 Schema Contract — All 5 Tables

The following is the authoritative v2 contract. Verify each column exists in the migration sequence (`001` → `009` → `010`).

#### `restaurants`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PRIMARY KEY | `gen_random_uuid()` default |
| `place_id` | `text` UNIQUE NULLABLE | Google Places ID; dedup key |
| `name` | `text` NOT NULL | |
| `address` | `text` NULLABLE | Added in `008` if missing |
| `cuisine_type` | `text` NULLABLE | Added in `008` if missing |
| `reference_image_url` | `text` NULLABLE | Added in `008` if missing |
| `atmospheric_palette_json` | `text` NULLABLE | JSON string; stored as text |
| `rating` | `real` NULLABLE | Added in `009` |
| `user_ratings_total` | `integer` NULLABLE | Added in `009` |
| `created_at` | `timestamptz` NOT NULL | `now()` default; added in `008` if missing |

#### `restaurant_visits`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PRIMARY KEY | `gen_random_uuid()` default |
| `restaurant_id` | `uuid` NOT NULL FK → `restaurants(id)` | `ON DELETE CASCADE` |
| `visit_type` | `text` NOT NULL | CHECK: `('scan', 'search')` |
| `raw_menu_json` | `text` NULLABLE | Cached Gemini scan output |
| `visited_at` | `timestamptz` NOT NULL | `now()` default |

Required index: `restaurant_visits_restaurant_idx` on `(restaurant_id)`.

#### `recipes`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PRIMARY KEY | `gen_random_uuid()` default |
| `restaurant_id` | `uuid` NOT NULL FK → `restaurants(id)` | `ON DELETE CASCADE` |
| `visit_id` | `uuid` NULLABLE FK → `restaurant_visits(id)` | `ON DELETE SET NULL`; added in `008` |
| `name` | `text` NOT NULL | |
| `description` | `text` NULLABLE | |
| `dish_image_url` | `text` NULLABLE | |
| `estimated_calories` | `integer` NULLABLE | |
| `status` | `text`/`recipe_status enum` NOT NULL | DEFAULT `'auto_captured'`; CHECK or enum covering `auto_captured`, `kept`, `removed` |
| `photo_status` | `text` NOT NULL | DEFAULT `'placeholder'`; CHECK: `('confirmed', 'placeholder', 'suppressed')`; added in `010` |
| `gemini_confidence` | `real` NULLABLE | CHECK: `>= 0 AND <= 1` |
| `dish_rating` | `real` NULLABLE | Added in `009` |
| `dish_review_snippet` | `text` NULLABLE | Added in `009` |
| `created_at` | `timestamptz` NOT NULL | `now()` default |

Required indexes: `recipes_restaurant_idx` on `(restaurant_id)`, `recipes_status_idx` on `(status)`.

**Two-collection model note:** All recipe collection queries MUST filter by `status`. The correct query pattern is `.neq('status', 'removed')` for restaurant view, or `.eq('status', 'kept')` for My Recipes. A query without a status filter is an anti-pattern (see ARCH4, architecture.md enforcement guidelines).

#### `recipe_ingredients`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PRIMARY KEY | `gen_random_uuid()` default |
| `recipe_id` | `uuid` NOT NULL FK → `recipes(id)` | `ON DELETE CASCADE` |
| `name` | `text` NOT NULL | |
| `quantity` | `text` NULLABLE | |
| `unit` | `text` NULLABLE | |
| `usda_fdc_id` | `integer` NULLABLE | Added in `002` if missing |
| `calories_per_serving` | `real` NULLABLE | Added in `002` if missing |
| `protein_g` | `real` NULLABLE | Added in `002` if missing |
| `fat_g` | `real` NULLABLE | Added in `002` if missing |
| `carbs_g` | `real` NULLABLE | Added in `002` if missing |
| `confidence` | `text` NOT NULL | DEFAULT `'medium'`; CHECK: `('high', 'medium', 'low')` |

Required unique constraint: `recipe_ingredients_recipe_id_name_key` on `(recipe_id, name)` — added idempotently in `009`.
Required index: `recipe_ingredients_recipe_idx` on `(recipe_id)`.

**Note:** The legacy column `confidence_level` was dropped in `002`. If any environment is missing this drop, it is safe to re-run `002` — it is idempotent.

#### `grocery_items`
| Column | Type | Notes |
|--------|------|-------|
| `id` | `uuid` PRIMARY KEY | `gen_random_uuid()` default |
| `name` | `text` NOT NULL | |
| `quantity` | `text` NULLABLE | |
| `unit` | `text` NULLABLE | |
| `checked` | `boolean` NOT NULL | DEFAULT `false`; **NOT** `is_checked` |
| `recipe_ids` | `uuid[]` NOT NULL | DEFAULT `'{}'`; **NOT** `added_from_recipe_id` |
| `dish_name` | `text` NULLABLE | Added in `009` |
| `created_at` | `timestamptz` NOT NULL | `now()` default |

**ARCH6 doc discrepancy:** The architecture.md ARCH6 section lists `is_checked` and `added_from_recipe_id` as the column names. These are WRONG — the actual schema (confirmed in `001` and TypeScript types) uses `checked` and `recipe_ids`. The architecture doc is stale. The code, `001` schema, and `database.ts` Zod schemas are authoritative.

---

### Row Level Security

All 5 tables have RLS enabled with an "Allow all" policy (public read/write — personal app, no auth). This is defined in `001` and extended to `restaurant_visits` in `008`. Any new table written in a future `011+` migration must follow the same RLS pattern:

```sql
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all" ON new_table FOR ALL USING (true) WITH CHECK (true);
```

---

### Migration Idempotency Pattern

All migrations in this codebase use idempotent guards. New migrations must follow the same pattern:

```sql
-- For adding columns:
ALTER TABLE table_name
  ADD COLUMN IF NOT EXISTS column_name data_type [constraints];

-- For adding constraints (cannot use IF NOT EXISTS directly):
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'table_name'::regclass
      AND contype  = 'u'  -- 'u' = unique, 'c' = check, 'p' = primary key, 'f' = foreign key
      AND conname  = 'constraint_name'
  ) THEN
    ALTER TABLE table_name ADD CONSTRAINT constraint_name ...;
  END IF;
END
$$;

-- For creating tables:
CREATE TABLE IF NOT EXISTS table_name (...);

-- For creating indexes:
CREATE INDEX IF NOT EXISTS index_name ON table_name(column_name);

-- Always reload PostgREST schema cache at the end:
SELECT pg_notify('pgrst', 'reload schema');
```

---

### `recipes.status` — Two Schema Variants

The `status` column exists in two forms depending on the environment:

- **Fresh DB (running `001` clean):** Created as a `recipe_status` PostgreSQL ENUM type (`'auto_captured'`, `'kept'`, `'removed'`). The enum is created via `CREATE TYPE IF NOT EXISTS recipe_status AS ENUM (...)`.
- **Live DB patched by `002`:** Created as a `TEXT` column with `CHECK (status IN ('auto_captured', 'kept', 'removed'))`.

Both produce functionally equivalent behavior for the application. The TypeScript Zod schema (`RecipeStatusEnum`) handles both correctly. **Do not attempt to normalise these** — adding a migration to convert `TEXT` to `ENUM` in a live DB is risky and unnecessary.

---

### `recipes.photo_status` — Three-State Machine (ARCH5)

The `photo_status` column is the schema foundation for ARCH5. It is used by every component that renders a dish card. The three values drive:

| Value | Render behavior |
|-------|-----------------|
| `'confirmed'` | Full-bleed photo rendered in card; no indicator |
| `'placeholder'` | Warm placeholder tile rendered; no broken `<img>` |
| `'suppressed'` | Card not rendered at all; no empty slot in layout |

Default is `'placeholder'` — the safe starting state for every newly created recipe row. `photo_status` is updated to `'confirmed'` by the Places enrichment pipeline after a photo URL is stored in `dish_image_url`.

This column was missing from the initial schema and was added by `010_photo_status.sql`. It is back-filled: existing rows with a non-null `dish_image_url` are set to `'confirmed'`.

---

### Migration File Location and Naming

- **All migrations:** `supabase/migrations/`
- **Naming convention:** `{NNN}_{description}.sql` where `NNN` is zero-padded 3-digit sequential number
- **Current sequence:** `001` through `010` (note: `009` and `010` may be unordered in the filesystem — always use numeric sorting, not alphabetical)
- **Next migration (if needed):** `011_<description>.sql`
- **Non-negotiable rule (FR42, ARCH3):** No schema change ever happens outside a numbered migration file. No raw `ALTER TABLE` in application code, no SQL Editor ad-hoc changes, no Supabase dashboard column adds.

---

### schema contract comment in 009

Story 1.1 added the following contract comment to `009_canonical_baseline.sql` (verified in 1.1 completion notes). Do not modify or move it:

```
-- MIGRATION SEQUENCE CONTRACT:
-- All future schema changes must be applied via numbered migration files only.
-- No ad-hoc ALTER TABLE. New migrations must be numbered sequentially (011_, 012_, ...)
-- and be idempotent (IF NOT EXISTS / DO $$ BEGIN … END $$ guards).
```

---

### Cross-References: ARCH Requirements Covered by This Story

| Requirement | Description | Status |
|-------------|-------------|--------|
| ARCH3 | Consolidate patches 002–008 into canonical migration; migration-first as non-negotiable rule | Addressed by `009`; this story verifies |
| ARCH4 | `recipes.status` enum (`auto_captured`, `kept`, `removed`) — two-collection model | Addressed by `001` / `002`; this story verifies |
| ARCH5 | `recipes.photo_status` (`confirmed`, `placeholder`, `suppressed`) — photo state machine | Addressed by `010`; this story verifies |
| ARCH6 | 5-table schema with correct column names and `restaurant_visits.visit_type` | Addressed by `001` + `008` + `009`; this story verifies |
| FR42 | All schema changes via versioned, numbered migration files | Enforced by `009` contract comment; this story verifies |

---

### What This Story Does NOT Do

- **Does not** implement any UI components or hooks — schema only
- **Does not** add `use client` components or API routes
- **Does not** modify `src/types/database.ts` unless a genuine schema gap is found in Task 1
- **Does not** back-port or replace `001` through `008` — those migrations are historical record and must not be deleted or modified
- **Does not** require running `supabase db push` or similar — this is a verification story; local Supabase CLI setup is out of scope for v2 MVP

---

### Pattern Established by Story 1.1 (Follow These)

Story 1.1 established the following patterns for this codebase. Follow them if any new files are created:

- **Test co-location:** Tests live next to source files, not in a separate `__tests__/` directory. Exception: `src/lib/__tests__/` was already established by Story 1.1 — if adding schema tests, put them there for consistency.
- **Vitest + jsdom:** `npx vitest run` — not jest. Use `vi.stubEnv()` for env var mocking.
- **TypeScript strict mode:** All type errors must resolve cleanly; no `as unknown` casts.
- **Naming conventions (DB):** `plural_snake_case` tables, `snake_case` columns, `{table_singular}_id` FK names, `snake_case` enum values.

---

### Placeholder Restaurant Record

`001` inserts a sentinel restaurant row for unidentified scans:

```sql
INSERT INTO restaurants (id, name)
VALUES ('00000000-0000-0000-0000-000000000000', 'Unknown Restaurant')
ON CONFLICT (id) DO NOTHING;
```

This row must remain in the schema. Any new migration that touches the `restaurants` table must not delete or conflict with this sentinel.

### Project Structure Notes

Key migration files:
- `/Users/frank.milan/Claude/Personal/nutrition-app/v2/supabase/migrations/001_initial_schema.sql` — base 5-table schema + RLS
- `/Users/frank.milan/Claude/Personal/nutrition-app/v2/supabase/migrations/002_patch_missing_columns.sql` — `recipe_ingredients` nutrition cols + `recipes.status` TEXT CHECK
- `/Users/frank.milan/Claude/Personal/nutrition-app/v2/supabase/migrations/003_unique_ingredient_per_recipe.sql` — unique constraint precursor (superseded by `009` idempotent version)
- `/Users/frank.milan/Claude/Personal/nutrition-app/v2/supabase/migrations/004_ensure_grocery_items.sql` — grocery items table safety
- `/Users/frank.milan/Claude/Personal/nutrition-app/v2/supabase/migrations/005_ratings.sql` — restaurant/dish rating columns
- `/Users/frank.milan/Claude/Personal/nutrition-app/v2/supabase/migrations/006_patch_restaurants.sql` — restaurant columns and `grocery_items.dish_name`
- `/Users/frank.milan/Claude/Personal/nutrition-app/v2/supabase/migrations/007_recipe_ratings.sql` — `dish_rating`, `dish_review_snippet`
- `/Users/frank.milan/Claude/Personal/nutrition-app/v2/supabase/migrations/008_missing_schema.sql` — `restaurant_visits` table + `recipes.visit_id` FK
- `/Users/frank.milan/Claude/Personal/nutrition-app/v2/supabase/migrations/009_canonical_baseline.sql` — canonical consolidation of 002–008; migration contract comment added in Story 1.1
- `/Users/frank.milan/Claude/Personal/nutrition-app/v2/supabase/migrations/010_photo_status.sql` — `recipes.photo_status` column and back-fill

TypeScript contract (source of truth for application-level column names):
- `/Users/frank.milan/Claude/Personal/nutrition-app/v2/src/types/database.ts`

If a gap is found and a new migration is needed:
- New file: `/Users/frank.milan/Claude/Personal/nutrition-app/v2/supabase/migrations/011_<description>.sql`
- Update: `/Users/frank.milan/Claude/Personal/nutrition-app/v2/src/types/database.ts`

### References

- `planning/epics.md` — Epic 1, Story 1.2 acceptance criteria and FR42 definition
- `planning/architecture.md` — ARCH3 (migration-first), ARCH4 (two-collection model via `recipes.status`), ARCH5 (photo state machine via `recipes.photo_status`), ARCH6 (5-table schema), Naming Patterns (DB conventions), Enforcement Guidelines (anti-patterns)
- `planning/1-1-infrastructure-hardening.md` — Task 3 completion notes: migration baseline verified; contract comment added; ARCH6 doc discrepancy for `grocery_items` documented
- `supabase/migrations/009_canonical_baseline.sql` — canonical consolidation migration with contract comment
- `supabase/migrations/010_photo_status.sql` — `photo_status` column definition and back-fill
- `supabase/migrations/001_initial_schema.sql` — base schema; `recipe_status` enum type; `restaurant_visits.visit_type` CHECK
- `src/types/database.ts` — Zod schemas, TypeScript row types, domain mappers; authoritative for column names

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List

**2026-04-12 — Schema verification pass (Story 1.2)**

All 5 ARCH6 tables verified against the migration sequence (`001` → `009` → `010`) and TypeScript types in `src/types/database.ts`. No gaps found. No `011_*.sql` was written.

Detailed findings:

- **`restaurants`** (10 columns): All columns present. Base columns in `001`; `rating` and `user_ratings_total` added idempotently in `009`. Sentinel row `00000000-...` inserted in `001`.
- **`restaurant_visits`** (5 columns + 1 index): Defined in `001` with `visit_type CHECK('scan','search')`. Also covered idempotently in `008` for live-DB patching. Index `restaurant_visits_restaurant_idx` present in `001`.
- **`recipes`** (13 columns + 2 indexes): Base columns including `status` (`recipe_status` ENUM via `001`), `visit_id` FK, and `gemini_confidence` CHECK in `001`. `dish_rating` and `dish_review_snippet` added in `009`. `photo_status` TEXT NOT NULL DEFAULT 'placeholder' CHECK('confirmed','placeholder','suppressed') added in `010`. Indexes `recipes_restaurant_idx` and `recipes_status_idx` in `001`.
- **`recipe_ingredients`** (11 columns + 1 unique constraint + 1 index): All columns in `001`. Unique constraint `recipe_ingredients_recipe_id_name_key` on `(recipe_id, name)` added idempotently in `009`. Index `recipe_ingredients_recipe_idx` in `001`.
- **`grocery_items`** (8 columns): Base columns including `checked` (NOT `is_checked`) and `recipe_ids` (NOT `added_from_recipe_id`) in `001`. `dish_name` added in `009`. ARCH6 doc discrepancy for column names confirmed stale — `001` and `database.ts` are authoritative.

TypeScript alignment confirmed:
- `RecipeStatusEnum`: `["auto_captured", "kept", "removed"]` — matches `001` ENUM definition.
- `PhotoStatusEnum`: `["confirmed", "placeholder", "suppressed"]` — matches `010` CHECK constraint.
- `VisitTypeEnum`: `["scan", "search"]` — matches `001` CHECK constraint.
- All 5 tables have Row schemas and entries in `Database.public.Tables` interface.

Migration sequence contract comment in `009` verified present and correct (lines 9–12). No modification needed.

Story 1.1 audit was thorough; this second-pass found nothing new.

### File List

- `/Users/frank.milan/Claude/Personal/nutrition-app/v2/planning/1-2-database-schema-baseline.md` — updated (tasks marked complete, completion note added)
