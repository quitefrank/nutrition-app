

# MacroLite — Mobile-First Macro Tracking App

## Overview
A mobile-first macro tracking web app that ingests foods on-demand from Nutritionix, caches them in Supabase, and lets users build recipes, log daily meals, and manage a grocery list.

---

## 1. Authentication
- Supabase Auth with **email/password** and **magic link** sign-in
- Landing page (`/`) is public with sign-in/sign-up CTA
- All other routes require authentication (protected route wrapper)

## 2. Database Setup (Supabase)
Create all tables with RLS policies so users can only access their own data:
- **foods** — cached Nutritionix foods with macros per serving and per 100g
- **recipes** — user recipes with serving count
- **recipe_items** — ingredients linking to foods with computed macros
- **daily_logs** — one row per user per date
- **daily_log_items** — individual meal entries (food or recipe) with computed macros
- **groceries** — food items with need/have/low status

## 3. Edge Functions (Server-Side Logic)
Two Supabase Edge Functions to keep API keys secure:

- **`nutritionix-search`** — Proxies typeahead search to Nutritionix instant endpoint, returns display names and IDs
- **`nutritionix-ingest`** — Fetches full nutrition data, normalizes macros per 100g, upserts into the foods table. Includes unit conversion utility and cache-first logic

## 4. Pages & Navigation

**Bottom tab bar** (Today · Foods · Recipes · Groceries) — always visible on mobile.

### Landing Page (`/`)
- Simple CTA to sign in or create account

### Today (`/today`)
- Date selector to browse days
- List of logged entries for selected date with calories, protein, carbs, fat
- Running daily totals displayed prominently
- Add entry: choose a recipe (with servings) or a single food (with quantity + unit)
- Auto-creates daily_log row if none exists for that date

### Foods (`/foods`)
- Search bar with Nutritionix typeahead results
- Selecting a result ingests & caches the food
- Table/card list of "My Foods" showing macros per 100g
- Tap a food to see detail view (per-serving, per-100g, brand, source)

### Recipes (`/recipes`)
- List of recipes with total and per-serving macros
- Create new recipe: name, servings, add ingredient rows (search from cached foods)
- Recipe detail/edit: modify ingredients and servings, see computed totals and per-serving breakdown

### Groceries (`/groceries`)
- Add foods from cache or via Nutritionix search → ingest
- Toggle status: Need / Have / Low
- Simple list grouped or filterable by status

## 5. Core Logic
- **Unit conversion**: g, ml, tbsp, tsp, cup, oz, lb → grams (with v1 density assumptions)
- **Macro calculation**: All macros computed from per-100g values × grams equivalent
- **Recipe totals**: Sum of ingredient macros, divided by servings for per-serving view
- **Daily totals**: Sum of all daily_log_items for a given date

## 6. UX Details
- Mobile-first, data-dense design (compact cards/tables)
- Empty states for all lists
- Error messages for failed searches, unsupported units, missing serving grams
- Fast and responsive — minimal loading states

## 7. Security
- Edge functions verify Supabase auth session; user_id read from token, never from client
- Nutritionix API keys stored as Supabase secrets only
- RLS on all tables: SELECT/INSERT/UPDATE/DELETE scoped to `user_id = auth.uid()`

