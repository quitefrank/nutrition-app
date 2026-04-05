-- Plately v2 — Initial Schema
-- Run this in your Supabase SQL Editor to set up the database

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ─── Restaurants ───────────────────────────────────────────────────

create table if not exists restaurants (
  id                      uuid primary key default gen_random_uuid(),
  place_id                text unique,          -- Google Places ID (dedup key)
  name                    text not null,
  address                 text,
  cuisine_type            text,
  reference_image_url     text,
  atmospheric_palette_json text,               -- JSON: { primary, secondary, accent }
  created_at              timestamptz not null default now()
);

-- Placeholder restaurant for scans before restaurant association is built
insert into restaurants (id, name)
values ('00000000-0000-0000-0000-000000000000', 'Unknown Restaurant')
on conflict (id) do nothing;

-- ─── Restaurant Visits ─────────────────────────────────────────────

create table if not exists restaurant_visits (
  id              uuid primary key default gen_random_uuid(),
  restaurant_id   uuid not null references restaurants(id) on delete cascade,
  visit_type      text not null check (visit_type in ('scan', 'search')),
  raw_menu_json   text,                        -- Cached Gemini scan output
  visited_at      timestamptz not null default now()
);

create index if not exists restaurant_visits_restaurant_idx on restaurant_visits(restaurant_id);

-- ─── Recipes ───────────────────────────────────────────────────────

create type if not exists recipe_status as enum ('auto_captured', 'kept', 'removed');

create table if not exists recipes (
  id                  uuid primary key default gen_random_uuid(),
  restaurant_id       uuid not null references restaurants(id) on delete cascade,
  visit_id            uuid references restaurant_visits(id) on delete set null,
  name                text not null,
  description         text,
  dish_image_url      text,
  estimated_calories  integer,
  status              recipe_status not null default 'auto_captured',
  gemini_confidence   real check (gemini_confidence >= 0 and gemini_confidence <= 1),
  created_at          timestamptz not null default now()
);

create index if not exists recipes_restaurant_idx on recipes(restaurant_id);
create index if not exists recipes_status_idx on recipes(status);

-- ─── Recipe Ingredients ────────────────────────────────────────────

create table if not exists recipe_ingredients (
  id                   uuid primary key default gen_random_uuid(),
  recipe_id            uuid not null references recipes(id) on delete cascade,
  name                 text not null,
  quantity             text,
  unit                 text,
  usda_fdc_id          integer,
  calories_per_serving real,
  protein_g            real,
  fat_g                real,
  carbs_g              real,
  confidence           text not null default 'medium' check (confidence in ('high', 'medium', 'low'))
);

create index if not exists recipe_ingredients_recipe_idx on recipe_ingredients(recipe_id);

-- ─── Grocery Items ─────────────────────────────────────────────────

create table if not exists grocery_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  quantity    text,
  unit        text,
  checked     boolean not null default false,
  recipe_ids  uuid[] not null default '{}',    -- Source recipes for "By Recipe" view
  created_at  timestamptz not null default now()
);

-- ─── Row Level Security ────────────────────────────────────────────
-- Plately v2 has no auth — public read/write (single user, personal app)

alter table restaurants enable row level security;
alter table restaurant_visits enable row level security;
alter table recipes enable row level security;
alter table recipe_ingredients enable row level security;
alter table grocery_items enable row level security;

create policy "Allow all" on restaurants for all using (true) with check (true);
create policy "Allow all" on restaurant_visits for all using (true) with check (true);
create policy "Allow all" on recipes for all using (true) with check (true);
create policy "Allow all" on recipe_ingredients for all using (true) with check (true);
create policy "Allow all" on grocery_items for all using (true) with check (true);
