---
project_name: 'Plately'
user_name: 'Frank'
date: '2026-03-17'
sections_completed: ['product_vision', 'tech_stack', 'build_order', 'rules', 'reference_codebase']
---

# Project Context for AI Agents

_This file contains the product vision, tech stack, build order, and critical rules for the Lens & Macros project. AI agents must read this entire file before writing any code._

---

## Product Vision

**App name: Plately**

A mobile-first Progressive Web App where a user takes a photo of:

1. **Food / Meal** → get ingredient breakdown + macros
2. **Printed or handwritten recipe** → OCR extract recipe, ingredients, macros
3. **Restaurant menu** → read dish names, fetch Google Places photos/reviews, estimate ingredients + macros

All three modes funnel into a recipe database and grocery list.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| PWA | next-pwa or equivalent |
| Vision / OCR | Gemini 1.5 Flash API |
| Nutrition data | USDA FoodData Central API |
| Restaurant data | Google Places API (New) — dish photos + reviews |
| Database | Supabase (free tier) — recipe DB + grocery list |
| Deployment | Vercel |
| Styling | Tailwind CSS |
| Primary target | Mobile-first, iPhone Safari |

---

## Environment Variables

```
GEMINI_API_KEY=
USDA_API_KEY=           # Already obtained
GOOGLE_PLACES_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## Build Order

Complete each step sequentially. Confirm with Frank after each step before proceeding.

1. Scaffold Next.js 14 project with Tailwind, PWA config, and `.env.local` setup
2. Camera capture component with 3-mode selector (Food / Recipe / Menu)
3. API route: Gemini vision handler — one per mode with different prompts
4. API route: USDA ingredient → macro lookup
5. API route: Google Places — restaurant lookup → dish photos + reviews
6. Results UI — macro card, ingredient list, editable fields
7. Supabase schema + recipe save/retrieve
8. Grocery list view — aggregated ingredients from saved recipes
9. Mobile UX polish pass
10. Vercel deploy config

---

## Rules

- **API keys are server-side only** — all keys must live in Next.js API routes (server), never exposed to the client
- **Mobile-first** — every component must be designed for a phone screen first; iPhone Safari is the primary target
- **Free tier where possible** — Google Places calls must be minimal; only fire when the user confirms a restaurant name, not on every keystroke
- **Pause after each major step** — show Frank what was built before moving to the next step
- **Ask before proceeding** at any decision point or ambiguity

---

## Reference: Existing Codebase (MacroLite)

The current repo contains a working macro tracking app (working title: MacroLite) built with React + Vite + Supabase. This is a **reference point only** — the new Lens & Macros app is built on a different stack (Next.js 14). Do not carry over architecture directly, but the patterns below may inform decisions.

### MacroLite Stack (reference only)

- React 18.3.1 + TypeScript 5.8.3 (strict: false)
- Vite 7.3.1, TanStack React Query v5, shadcn/ui, Tailwind CSS 3.4.17
- Supabase JS 2.96.0, react-router-dom 6.30.1, sonner 1.7.4, date-fns 3.6.0
- Vitest 3.2.4 + @testing-library/react + jsdom

### MacroLite Patterns (reference only)

- **Macro formula**: `(grams * macros_per_100g) / 100` — foods store `calories_per_100g`, `protein_per_100g`, `carbs_per_100g`, `fat_per_100g`
- **Unit conversion**: `convertToGrams(quantity, unit)` — supported: `g`, `ml`, `tbsp`, `tsp`, `cup`, `oz`, `lb`
- **Edge functions**: USDA access goes through Supabase Edge Functions (`fdc-search`, `fdc-ingest`), never directly from client
- **Data flow**: `useQuery` → fetch → `useMutation` → `qc.invalidateQueries()`
- **Dependent queries**: `enabled: !!parentId`
- **Supabase DB types** are auto-generated; never hand-edit `types.ts`
- **Date strings**: `format(date, 'yyyy-MM-dd')` from date-fns for Supabase date columns
- **No auth**: single-user app, no authentication layer
