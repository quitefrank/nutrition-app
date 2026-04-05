# Plately v1

**Status: Complete.** This is the finished v1 codebase. Do not make changes here — new work goes in `../v2/`.

## Commands

```bash
npm run dev          # Dev server at localhost:3000
npm run build        # Production build
npm run lint         # ESLint check
npm test             # Run tests (Vitest)
npm run test:watch   # Watch mode
```

> First-time setup: `cd v1 && npm install` (node_modules lives at the repo root and is not included here).

## What This Is

**Plately** — a mobile-first PWA for scanning restaurant menus and capturing recipes. _"Take home the food you love."_

**Stack:** Next.js 16 + React 19 + TypeScript, Tailwind CSS v4, Supabase (PostgreSQL), Gemini 2.5 Flash, Google Places API, USDA FoodData Central, TanStack React Query v5, Vitest, Vercel.

## Architecture

### Data Flow

1. `useQuery` — fetch from Supabase, keyed by `[entity, id]`
2. `useMutation` — write to Supabase, then `qc.invalidateQueries()` to refresh cache
3. `sonner` for toasts

### Key Directories

- `src/app/` — Next.js App Router (pages + API routes)
- `src/components/` — Feature components (scan, recipes, grocery, search)
- `src/hooks/` — Custom React hooks (useScan, useGrocery, useRecipes, etc.)
- `src/integrations/supabase/` — Supabase client + auto-generated DB types
- `src/types/` — TypeScript types (api.ts, domain.ts, database.ts)
- `supabase/schema.sql` — Database schema
- `_bmad-output/` — All v1 planning artifacts (PRD, epics, stories, architecture)
- `references/` — iOS design reference screenshots

### Path Alias

`@/` → `./src`

### Database Types

`src/integrations/supabase/types.ts` is auto-generated. Re-generate with the Supabase CLI after schema changes.

## Completed Epics

1. Foundation — design tokens, glass components, atmospheric backgrounds, app shell
2. Capture & Scan — Gemini vision, camera modal, menu results, async enrichment, error states
3. Recipes — save/edit/delete, collection view, restaurant association, USDA nutrition
4. Grocery List — add recipe, check-off, bulk clear, offline sync
5. Search & Discovery — restaurant search, dish browse, nearby restaurants, return-visit banners
6. Quality & Resilience — accessibility, PWA install, error states, NFR validation
