# Story 1.1: Project Scaffold & Environment Setup

Status: done

## Story

As a developer,
I want the project initialized with all required dependencies and infrastructure,
so that all subsequent feature stories have a working foundation to build on.

## Acceptance Criteria

1. `npx create-next-app@latest` scaffolds the project; dev server starts at localhost:3000 with no TypeScript or build errors.
2. `@supabase/supabase-js`, `@tanstack/react-query`, `sonner`, `vitest`, `@testing-library/react` install without version conflicts.
3. `src/lib/supabase.ts` exports a singleton Supabase client using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; it is the **only** file in the codebase that instantiates a Supabase client.
4. `src/lib/api-keys.ts` exports `getApiKeys()` that reads `GEMINI_API_KEY`, `GOOGLE_PLACES_API_KEY`, and `USDA_API_KEY` from server-side env only; calling it from a browser context throws or returns undefined.
5. `.env.local` is listed in `.gitignore`; `.env.example` contains all 5 key slots with comments and no values.
6. `src/app/layout.tsx` wraps children with TanStack Query `QueryClientProvider`; any page can use `useQuery`/`useMutation` hooks without additional provider setup.
7. `supabase/schema.sql` defines all 4 tables; Frank runs this in the Supabase SQL editor and all foreign keys and types are correct.
8. `src/types/database.ts` (snake_case row types), `src/types/api.ts` (camelCase shapes), `src/types/domain.ts` (business domain types) all exist; no complex inline types in components or routes.
9. `npm run dev` starts without errors; at least one passing smoke test confirms the Supabase client can be instantiated.

## Tasks / Subtasks

- [ ] Task 1: Bootstrap Next.js project in current repo root (AC: 1)
  - [ ] Delete old `node_modules/` and `bun.lock` (they are from archived MacroLite/Vite — incompatible)
  - [ ] Run scaffold: `bunx create-next-app@latest . --typescript --tailwind --app --eslint --src-dir` (use `.` — project root is the repo)
  - [ ] When prompted about non-empty directory, confirm to proceed
  - [ ] When prompted for package manager, confirm bun (Frank uses bun)
  - [ ] Verify `npm run dev` / `bun dev` starts at localhost:3000 with no errors

- [ ] Task 2: Install post-scaffold dependencies (AC: 2)
  - [ ] Production deps: `bun add @supabase/supabase-js @tanstack/react-query sonner`
  - [ ] Dev deps: `bun add -d vitest @testing-library/react @testing-library/dom @testing-library/user-event @vitejs/plugin-react jsdom`
  - [ ] Create `vitest.config.ts` (see Dev Notes for config)

- [ ] Task 3: Create Supabase client singleton (AC: 3)
  - [ ] Create `src/lib/supabase.ts` — singleton client using `NEXT_PUBLIC_*` env vars
  - [ ] Confirm no other file in the codebase uses `createClient` from `@supabase/supabase-js`

- [ ] Task 4: Create getApiKeys() server-side helper (AC: 4)
  - [ ] Create `src/lib/api-keys.ts` — reads GEMINI, PLACES, USDA keys from `process.env` only
  - [ ] Add `'server-only'` package import or `typeof window !== 'undefined'` guard to prevent client-side usage
  - [ ] Install `server-only` package if using import guard: `bun add server-only`

- [ ] Task 5: Configure environment files (AC: 5)
  - [ ] Create `.env.local` with all 5 slots (fill with placeholder values or real keys if available)
  - [ ] Create `.env.example` with all 5 slots, empty values, and descriptive comments
  - [ ] Verify `.gitignore` lists `.env.local` (Next.js scaffold `.gitignore` should include `*.local`)
  - [ ] Check if old `.env` (MacroLite) needs values migrated — if `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are there, carry them into `.env.local`

- [ ] Task 6: Wrap root layout with QueryClientProvider (AC: 6)
  - [ ] Create `src/components/providers.tsx` as a `'use client'` component wrapping `QueryClientProvider`
  - [ ] Update `src/app/layout.tsx` to import and use `<Providers>` around `{children}`
  - [ ] Create a `QueryClient` with default options (staleTime: 5 minutes for saved content)

- [ ] Task 7: Create Supabase database schema (AC: 7)
  - [ ] Create `supabase/schema.sql` with all 4 tables (see schema in Dev Notes)
  - [ ] **Dev agent does not run this** — output the file; Frank runs it in the Supabase SQL editor

- [ ] Task 8: Create type system files (AC: 8)
  - [ ] Create `src/types/database.ts` — snake_case row types matching schema exactly
  - [ ] Create `src/types/api.ts` — camelCase request/response shapes including `DishResult`, `IngredientResult`, error shape
  - [ ] Create `src/types/domain.ts` — business domain types (Recipe, ScanResult, Ingredient, GroceryItem, Restaurant, ConfidenceMetadata)

- [ ] Task 9: Smoke test (AC: 9)
  - [ ] Create `src/lib/supabase.test.ts` — confirms Supabase client instantiates without throwing
  - [ ] Run `bun test` — verify at least one test passes
  - [ ] Run `bun run build` — verify production build has no errors

## Dev Notes

### Current Repo State — Critical Context

The repo at `/Users/frank.milan/Claude/Personal/nutrition-app` is an **empty slate** after archiving the old MacroLite (React+Vite) app. Current contents:
- `_archive/` — old MacroLite source (do not touch)
- `_bmad-output/` — BMAD planning artifacts (do not touch)
- `references/` — reference materials (do not touch)
- `.claude/` — Claude config (do not touch)
- `node_modules/` — **from old Vite build, delete before scaffold**
- `bun.lock` — **from old Vite build, delete before scaffold**
- `.env` — may contain Supabase keys from MacroLite; check before deleting
- `.gitignore` — old Vite gitignore; will be replaced by create-next-app

Use `.` (not `plately`) as the create-next-app target directory — the git repo is already rooted here.

### Package Manager

Frank uses **bun**. All installs use `bun add` / `bun add -d`. Scaffold command uses `bunx create-next-app@latest`.

### Confirmed Package Versions (March 2026)

| Package | Version | Notes |
|---------|---------|-------|
| next | 16.1.7 (LTS) | Active LTS — target this via `create-next-app@latest` |
| @supabase/supabase-js | 2.99.3 | Near v3 release; no breaking changes in current minor |
| @tanstack/react-query | 5.91.2 | Stable v5 |
| sonner | 2.0.7 | **Major version** from 1.7.4 (used in MacroLite ref) — check API changes |
| vitest | 4.1.0 | Major bump from v3; review breaking changes if encountered |
| @testing-library/react | 16.3.2 | Requires `@testing-library/dom` as **peer dep** — install explicitly |
| tailwindcss | 4.2.2 | Included by create-next-app; major rewrite from v3 |

### vitest.config.ts Template

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

Also create `src/test/setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

### src/lib/supabase.ts

```typescript
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
```

### src/lib/api-keys.ts

```typescript
import 'server-only'

export function getApiKeys() {
  return {
    gemini: process.env.GEMINI_API_KEY,
    places: process.env.GOOGLE_PLACES_API_KEY,
    usda: process.env.USDA_API_KEY,
  }
}
```

`import 'server-only'` causes a build error if this file is imported from a Client Component or browser context. Install: `bun add server-only`.

### src/components/providers.tsx

```typescript
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState } from 'react'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000, // 5 minutes — saved content feels fresh
          },
        },
      })
  )

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

### TanStack Query Key Conventions (establish now, enforce everywhere)

```typescript
['recipes']                         // all recipes
['recipes', recipeId]               // single recipe
['grocery-items']                   // grocery list
['restaurants', restaurantId]       // single restaurant
['scan-result', scanId]             // in-flight scan (short TTL)
['search', 'restaurants', query]    // restaurant search
['search', 'dishes', query]         // dish search
```

Do NOT invent new key shapes in any future story.

### Supabase Schema (supabase/schema.sql)

```sql
-- restaurants: one row per restaurant entity
CREATE TABLE restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  google_places_id TEXT UNIQUE,
  atmospheric_palette_json JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- recipes: one row per saved dish
CREATE TABLE recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL,
  dish_image_url TEXT,          -- external URL only; never stored binary
  confidence_metadata_json JSONB,
  serving_size NUMERIC NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- recipe_ingredients: ingredients for each recipe
CREATE TABLE recipe_ingredients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  confidence_level TEXT NOT NULL CHECK (confidence_level IN ('high', 'medium', 'low'))
);

-- grocery_items: shopping list
CREATE TABLE grocery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
  ingredient_name TEXT NOT NULL,
  quantity TEXT,
  unit TEXT,
  checked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Type Files Outline

**src/types/database.ts** (snake_case — mirrors schema exactly):
```typescript
export type Restaurant = {
  id: string; name: string; google_places_id: string | null;
  atmospheric_palette_json: Record<string, unknown> | null; updated_at: string;
}
export type Recipe = {
  id: string; name: string; restaurant_id: string | null; dish_image_url: string | null;
  confidence_metadata_json: Record<string, unknown> | null; serving_size: number; created_at: string;
}
export type RecipeIngredient = {
  id: string; recipe_id: string; name: string; quantity: string | null;
  unit: string | null; confidence_level: 'high' | 'medium' | 'low';
}
export type GroceryItem = {
  id: string; recipe_id: string | null; ingredient_name: string; quantity: string | null;
  unit: string | null; checked: boolean; created_at: string;
}
// Database helper type for supabase.ts generic param
export type Database = {
  public: {
    Tables: {
      restaurants: { Row: Restaurant; Insert: Omit<Restaurant, 'id' | 'updated_at'>; Update: Partial<Omit<Restaurant, 'id'>>; }
      recipes: { Row: Recipe; Insert: Omit<Recipe, 'id' | 'created_at'>; Update: Partial<Omit<Recipe, 'id' | 'created_at'>>; }
      recipe_ingredients: { Row: RecipeIngredient; Insert: Omit<RecipeIngredient, 'id'>; Update: Partial<Omit<RecipeIngredient, 'id'>>; }
      grocery_items: { Row: GroceryItem; Insert: Omit<GroceryItem, 'id' | 'created_at'>; Update: Partial<Omit<GroceryItem, 'id' | 'created_at'>>; }
    }
  }
}
```

**src/types/api.ts** (camelCase — API request/response shapes):
```typescript
// Scan result contract — NEVER redefine in other stories
export type IngredientResult = {
  name: string; quantity: string | null; unit: string | null;
  confidenceLevel: 'high' | 'medium' | 'low';
}
export type DishResult = {
  name: string; description: string; calorieEstimate: number | null;
  ingredients: IngredientResult[]; imageUrl: string | null;
}
export type ScanResponse = {
  scanId: string; type: 'menu' | 'dish'; dishes: DishResult[];
  confidenceSource: 'gemini-only' | 'multi-source' | 'user-confirmed';
}
// Universal API shapes
export type ApiSuccess<T> = { data: T }
export type ApiError = { error: string; code: string }
export type ApiResponse<T> = ApiSuccess<T> | ApiError
```

**src/types/domain.ts** (camelCase — business domain):
```typescript
export type Recipe = {
  id: string; name: string; restaurantId: string | null; dishImageUrl: string | null;
  confidenceMetadata: Record<string, unknown> | null; servingSize: number; createdAt: string;
  ingredients?: DomainIngredient[];
}
export type DomainIngredient = {
  id: string; recipeId: string; name: string; quantity: string | null;
  unit: string | null; confidenceLevel: 'high' | 'medium' | 'low';
}
export type DomainGroceryItem = {
  id: string; recipeId: string | null; ingredientName: string; quantity: string | null;
  unit: string | null; checked: boolean; createdAt: string;
}
export type DomainRestaurant = {
  id: string; name: string; googlePlacesId: string | null;
  atmosphericPaletteJson: Record<string, unknown> | null; updatedAt: string;
}
```

### Project Structure Notes

**Target structure after this story completes:**
```
nutrition-app/
├── .env.example          ← committed; 5 empty slots with comments
├── .env.local            ← gitignored; 5 actual key slots
├── .gitignore            ← Next.js-generated (covers .env.local, .next/, node_modules/)
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts      ← added post-scaffold
├── package.json
├── supabase/
│   └── schema.sql        ← run by Frank in Supabase SQL editor
├── src/
│   ├── app/
│   │   ├── globals.css
│   │   ├── layout.tsx    ← wraps children with <Providers>
│   │   └── page.tsx      ← placeholder home page
│   ├── components/
│   │   └── providers.tsx ← 'use client' QueryClientProvider wrapper
│   ├── lib/
│   │   ├── supabase.ts   ← singleton Supabase client
│   │   └── api-keys.ts   ← getApiKeys() server-only helper
│   ├── test/
│   │   └── setup.ts      ← @testing-library/jest-dom import
│   └── types/
│       ├── database.ts   ← snake_case DB row types
│       ├── api.ts        ← camelCase API shapes (DishResult, IngredientResult, etc.)
│       └── domain.ts     ← camelCase business types (Recipe, DomainIngredient, etc.)
```

**Directories that must be preserved and never modified by this story:**
- `_archive/`
- `_bmad-output/`
- `references/`
- `.claude/`

### Architectural Enforcement Rules (all future stories also follow these)

| Rule | Pattern |
|------|---------|
| Supabase client | `import { supabase } from '@/lib/supabase'` — never `createClient()` inline |
| External API keys | `getApiKeys()` from `@/lib/api-keys` — never `process.env.GEMINI_API_KEY` directly in a route |
| DB types | snake_case in `database.ts` only; camelCase everywhere else |
| API responses | `{ data: T }` success or `{ error: string, code: string }` error — no other shapes |
| TanStack Query keys | Use defined conventions above — never invent new shapes |
| Complex types | In `src/types/` only — no inline complex types in components or routes |
| Error handling | Three layers: API route → TanStack Query onError → component error state |

### Anti-Patterns to Prevent

```typescript
// ❌ Never instantiate Supabase inline
const sb = createClient(url, key)
// ✅ Always import singleton
import { supabase } from '@/lib/supabase'

// ❌ Never read raw API key env vars in routes
const key = process.env.GEMINI_API_KEY
// ✅ Always use helper
const { gemini } = getApiKeys()

// ❌ Never let snake_case leak into component props
<RecipeCard recipe_id={id} created_at={date} />
// ✅ camelCase in all domain/component types
<RecipeCard recipeId={id} createdAt={date} />
```

### References

- Architecture decision document: [_bmad-output/planning-artifacts/architecture.md](_bmad-output/planning-artifacts/architecture.md)
- Epics & stories: [_bmad-output/planning-artifacts/epics.md](_bmad-output/planning-artifacts/epics.md) — Epic 1, Story 1.1
- Project context: [_bmad-output/project-context.md](_bmad-output/project-context.md)
- MacroLite reference codebase: `_archive/macrolite/` (for pattern reference only — different stack)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
