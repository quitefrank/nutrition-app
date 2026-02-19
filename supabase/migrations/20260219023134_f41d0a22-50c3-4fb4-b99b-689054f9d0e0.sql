
-- Drop all RLS policies
DROP POLICY IF EXISTS "Users CRUD own foods" ON public.foods;
DROP POLICY IF EXISTS "Users CRUD own recipes" ON public.recipes;
DROP POLICY IF EXISTS "Users CRUD own recipe_items" ON public.recipe_items;
DROP POLICY IF EXISTS "Users CRUD own daily_logs" ON public.daily_logs;
DROP POLICY IF EXISTS "Users CRUD own daily_log_items" ON public.daily_log_items;
DROP POLICY IF EXISTS "Users CRUD own groceries" ON public.groceries;

-- Disable RLS on all tables
ALTER TABLE public.foods DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_log_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.groceries DISABLE ROW LEVEL SECURITY;

-- Remove user_id columns from all tables
ALTER TABLE public.daily_log_items DROP COLUMN user_id;
ALTER TABLE public.recipe_items DROP COLUMN user_id;
ALTER TABLE public.groceries DROP COLUMN user_id;
ALTER TABLE public.daily_logs DROP COLUMN user_id;
ALTER TABLE public.recipes DROP COLUMN user_id;
ALTER TABLE public.foods DROP COLUMN user_id;

-- Rename nutritionix_id to fdc_id in foods
ALTER TABLE public.foods RENAME COLUMN nutritionix_id TO fdc_id;

-- Change source default
ALTER TABLE public.foods ALTER COLUMN source SET DEFAULT 'usda_fdc';

-- Add unique constraint on fdc_id (global, no user_id)
ALTER TABLE public.foods ADD CONSTRAINT foods_fdc_id_unique UNIQUE (fdc_id);

-- Add unique constraint on daily_logs (log_date) globally
ALTER TABLE public.daily_logs ADD CONSTRAINT daily_logs_log_date_unique UNIQUE (log_date);
