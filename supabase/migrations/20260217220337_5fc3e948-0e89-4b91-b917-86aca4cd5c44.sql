
-- Enable pgcrypto
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- TABLE: foods
CREATE TABLE public.foods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nutritionix_id text NOT NULL,
  name text NOT NULL,
  brand text,
  serving_grams numeric,
  calories_per_serving numeric,
  protein_per_serving numeric,
  carbs_per_serving numeric,
  fat_per_serving numeric,
  calories_per_100g numeric NOT NULL,
  protein_per_100g numeric NOT NULL,
  carbs_per_100g numeric NOT NULL,
  fat_per_100g numeric NOT NULL,
  source text NOT NULL DEFAULT 'nutritionix',
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, nutritionix_id)
);

ALTER TABLE public.foods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own foods" ON public.foods FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- TABLE: recipes
CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  servings numeric NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own recipes" ON public.recipes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- TABLE: recipe_items
CREATE TABLE public.recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  food_id uuid NOT NULL REFERENCES public.foods(id),
  quantity numeric NOT NULL,
  unit text NOT NULL,
  grams_equivalent numeric NOT NULL,
  calories numeric NOT NULL,
  protein numeric NOT NULL,
  carbs numeric NOT NULL,
  fat numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.recipe_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own recipe_items" ON public.recipe_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- TABLE: daily_logs
CREATE TABLE public.daily_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  log_date date NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, log_date)
);

ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own daily_logs" ON public.daily_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- TABLE: daily_log_items
CREATE TABLE public.daily_log_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_log_id uuid NOT NULL REFERENCES public.daily_logs(id) ON DELETE CASCADE,
  recipe_id uuid REFERENCES public.recipes(id),
  food_id uuid REFERENCES public.foods(id),
  servings numeric DEFAULT 1,
  quantity numeric,
  unit text,
  grams_equivalent numeric,
  calories numeric NOT NULL,
  protein numeric NOT NULL,
  carbs numeric NOT NULL,
  fat numeric NOT NULL,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT food_or_recipe CHECK (recipe_id IS NOT NULL OR food_id IS NOT NULL)
);

ALTER TABLE public.daily_log_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own daily_log_items" ON public.daily_log_items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- TABLE: groceries
CREATE TABLE public.groceries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  food_id uuid NOT NULL REFERENCES public.foods(id),
  status text NOT NULL DEFAULT 'need',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.groceries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users CRUD own groceries" ON public.groceries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
