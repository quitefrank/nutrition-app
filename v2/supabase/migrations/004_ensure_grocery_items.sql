-- 004_ensure_grocery_items.sql
--
-- Creates the grocery_items table if it doesn't exist in the live database.
-- The canonical 001 schema includes this table, but if the live DB was
-- provisioned from an earlier version of 001 that did not yet include it,
-- all grocery operations would fail silently at runtime.
--
-- Safe to re-run: all statements are idempotent.
-- Apply via Supabase SQL Editor if grocery items aren't saving.

create table if not exists grocery_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  quantity    text,
  unit        text,
  checked     boolean not null default false,
  recipe_ids  uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);

alter table grocery_items enable row level security;

-- Create the policy if it doesn't already exist
do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'grocery_items' and policyname = 'Allow all'
  ) then
    execute 'create policy "Allow all" on grocery_items for all using (true) with check (true)';
  end if;
end
$$;
