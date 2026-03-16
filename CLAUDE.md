# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Dev server at localhost:8080
npm run build        # Production build
npm run lint         # ESLint check
npm test             # Run tests once (Vitest)
npm run test:watch   # Watch mode
npx vitest src/path/to/file.test.ts  # Run a single test file
```

## Architecture

**MacroLite** is a single-user (no auth) macro tracking app. Stack: React 18 + TypeScript + Vite, Supabase (PostgreSQL + Edge Functions), TanStack React Query v5, shadcn/ui + Tailwind CSS.

### Data Flow Pattern

All pages follow the same pattern:
1. **`useQuery`** — fetch from Supabase, keyed by `[entity, id/date]`
2. **Dependent queries** — use `enabled: !!parentId` to chain queries
3. **`useMutation`** — write to Supabase, then `qc.invalidateQueries()` to refresh cache
4. **Toasts** — `sonner` for user feedback

### Key Directories

- `src/pages/` — 5 feature pages (Today, Foods, Recipes, Groceries, Scan). Business logic lives here.
- `src/components/ui/` — shadcn/ui primitives (generated, don't hand-edit)
- `src/integrations/supabase/` — Supabase client singleton and auto-generated DB types
- `src/lib/units.ts` — unit conversion (`convertToGrams()`); used wherever macro math happens

### External API

USDA FoodData Central is accessed via Supabase Edge Functions (not directly from the client):
- `supabase.functions.invoke('fdc-search', { body })` — search foods
- `supabase.functions.invoke('fdc-ingest', { body })` — cache a food into the `foods` table

### Path Alias

`@/` maps to `./src` (configured in `vite.config.ts` and `tsconfig.app.json`).

### Database Types

[src/integrations/supabase/types.ts](src/integrations/supabase/types.ts) is auto-generated. Re-generate with the Supabase CLI after schema changes; don't manually edit it.
