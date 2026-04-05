---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
status: 'complete'
completedAt: '2026-03-19'
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/ux-design-specification.md'
  - '_bmad-output/planning-artifacts/research.md'
  - '_bmad-output/planning-artifacts/prd-validation-report.md'
  - '_bmad-output/project-context.md'
workflowType: 'architecture'
project_name: 'Plately'
user_name: 'Frank'
date: '2026-03-19'
---

# Architecture Decision Document — Plately

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements (41 total):**

| Group | Count | Architectural Implication |
|---|---|---|
| Capture (FR01–05) | 5 | Camera + photo upload as co-equal paths; same pipeline from both |
| AI Identification & Confidence (FR06–13, FR39–40) | 10 | Two-phase pipeline: immediate Gemini result → async cross-reference enrichment |
| Recipe Management (FR14–22) | 9 | Standard CRUD with restaurant entity association; editable pre-save |
| Grocery List (FR23–28) | 6 | Aggregation + deduplication across recipes; dual-view (flat + grouped) |
| Discovery & Search (FR29–32, FR41) | 5 | Manual search producing identical recipe output to camera scan; proactive restaurant recognition |
| App Experience & Recovery (FR33–38) | 6 | PWA install, offline read-only, independent error states per service, no auth |

**Non-Functional Requirements:**

| Category | Key Constraints |
|---|---|
| Performance | Scan → first result ≤10s; confidence enrichment async — result visible ≤500ms post-scan; UI input ≤100ms; saved content loads ≤1s from cache |
| Security | All API keys server-side only; images discarded within request lifecycle; no PII collected or logged; HTTPS only |
| Integration Reliability | Each external service (Gemini, Google Places, USDA) has an independently defined failure path — no cascade failures; silent failures not acceptable |
| Scalability | 500MB DB, 2GB/month bandwidth (free tier) — drives minimal data model and zero media storage; BYOAK key abstraction must be extensible without route rewrites |
| Accessibility | 44×44pt minimum touch targets; confidence communicated via colour + text (never colour alone) |

**Scale & Complexity:**

- **Primary domain:** Full-stack mobile PWA (Next.js 14 App Router + Supabase + Vercel)
- **Complexity level:** Medium-High — multi-modal AI pipeline, async confidence enrichment, PWA camera constraints, novel background result delivery pattern, dynamic atmospheric theming
- **Estimated architectural components:** ~8 major (capture, AI pipeline, confidence enrichment, recipe store, grocery list, search, offline cache, atmospheric theming)

### Technical Constraints & Dependencies

| Constraint | Impact |
|---|---|
| Next.js 14 App Router | Server Components + API Routes as the API key isolation boundary |
| Supabase free tier (500MB / 2GB) | No media storage; scan images discarded within request; minimal schema design |
| Gemini 1.5 Flash | Single model for both text (menu) and visual (dish) identification |
| Google Places API | Optional enrichment — used for reference photos and restaurant data; failure must not block core flow |
| USDA FoodData Central | Optional nutrition layer — failure surfaces "nutrition unavailable" label; never blocks recipe save |
| iPhone Safari PWA | Push notifications unreliable/denied; background processing result delivery via persistent in-app strip (mini-player model) |
| iOS camera API | Variable reliability in PWA context; photo upload is co-equal fallback, not secondary |
| BYOAK (v2 requirement) | Key source must be abstracted from route logic from day one — per-user key injection must be additive, not a rewrite |

### Cross-Cutting Concerns Identified

1. **API Key Security** — affects every external API route; keys must never appear in client code, browser-exposed env vars, or network responses; abstracted config layer required from MVP
2. **Confidence Pipeline** — two-phase async pattern cuts across scan submission, result display, recipe storage (confidence metadata stored), and evidence block rendering on recipe re-open
3. **PWA Service Worker & Offline** — offline cache strategy affects recipe reads, grocery list check-off state (local-first, sync on reconnect), and atmospheric cache (extracted palette per restaurant)
4. **Independent Error Degradation** — each external service has its own failure path; cross-cutting pattern that must be enforced consistently across Gemini, Google Places, and USDA routes
5. **Atmospheric Theming Pipeline** — colour extraction → contrast gate → application runs on every restaurant context change; affects every screen; 3-tier fallback enforced programmatically
6. **Free Tier Storage Discipline** — no image storage anywhere in the system; scan images discarded within request lifecycle; ingredient-level schema minimalism throughout

---

## Starter Template Evaluation

### Primary Technology Domain

Full-stack Mobile PWA (Next.js App Router + Supabase + Vercel), based on project context and requirements analysis.

### Starter Options Considered

| Option | Assessment |
|---|---|
| `create-next-app` (official) | Perfect fit — App Router, TypeScript, Tailwind all included; matches confirmed stack exactly |
| T3 Stack | Includes tRPC + Prisma which add complexity not needed for this project |
| Custom scaffold | No benefit — `create-next-app` already establishes all required conventions |

### Selected Starter: `create-next-app`

**Rationale for Selection:**
The project context confirms Next.js + Tailwind + TypeScript. `create-next-app` is the official scaffold, actively maintained by Vercel, and directly configures the App Router pattern required for server-side API key isolation. No custom boilerplate needed.

**Version Note:** Project context referenced Next.js 14; current stable release is **Next.js 16.1.7 LTS**. Targeting 16 — App Router API is unchanged, and 16 brings Turbopack dev server and stability improvements.

**Initialization Command:**

```bash
npx create-next-app@latest plately --typescript --tailwind --app --eslint --src-dir
```

**Architectural Decisions Provided by Starter:**

**Language & Runtime:**
TypeScript with Next.js default strict configuration; `src/` directory structure separates app code from project config files.

**Styling Solution:**
Tailwind CSS 4.x — configured and ready; PostCSS pipeline included.

**Build Tooling:**
Turbopack for development (default in Next.js 16); production build via webpack. Vercel deployment config works out of the box.

**Testing Framework:**
Not included in starter — Vitest + Testing Library to be added post-scaffold (consistent with the MacroLite reference codebase patterns).

**Code Organization:**
`src/app/` — App Router convention; `src/app/api/` for all server-side API routes (the key isolation boundary for external API keys).

**Development Experience:**
Hot reloading via Turbopack, ESLint with Next.js rules, TypeScript type-checking.

**Post-Scaffold Additions (Story 1):**

| Addition | Rationale |
|---|---|
| `@supabase/supabase-js` | Database client |
| PWA manifest + service worker | Next.js 16 native PWA support — no third-party package required |
| `.env.local` template | GEMINI_API_KEY, USDA_API_KEY, GOOGLE_PLACES_API_KEY, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY |
| Vitest + Testing Library | Test infrastructure consistent with reference codebase |

**Note:** Project initialization using this command is the first implementation story.

---

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Async confidence pipeline mechanism — defines the two-phase scan flow
- Supabase schema shape — all feature stories depend on this
- API route organisation — defines the server boundary structure

**Important Decisions (Shape Architecture):**
- Client state management — affects every data-fetching screen
- PWA service worker caching strategy — defines offline behaviour

**Deferred Decisions (Post-MVP):**
- BYOAK (Bring Your Own API Key) — no user-facing key management in MVP; the `getApiKeys()` abstraction layer is in place but reads only from server env vars; per-user key injection is additive when needed in future

### Data Architecture

**Database:** Supabase (PostgreSQL, free tier) — 500MB storage, 2GB/month bandwidth

**Schema:**

| Table | Key Columns | Notes |
|---|---|---|
| `restaurants` | id, name, google_places_id, atmospheric_palette_json, updated_at | Atmospheric palette cached here — no re-extraction on return visit |
| `recipes` | id, name, restaurant_id, dish_image_url, confidence_metadata_json, serving_size, created_at | Confidence metadata persisted for evidence block rendering on recipe re-open |
| `recipe_ingredients` | id, recipe_id, name, quantity, unit, confidence_level | Per-item confidence stored (FR40); enables ingredient-level evidence display |
| `grocery_items` | id, recipe_id, ingredient_name, quantity, unit, checked, created_at | `recipe_id` enables recipe-view grouping and bulk-remove by recipe |

**No image storage anywhere in the system.** Scan images are discarded within the same request lifecycle as identification. `dish_image_url` references externally hosted images (Google Places) — never stored in Supabase.

**Migration approach:** Supabase SQL editor for MVP. No CLI migration runner required at this scale.

**Caching:** TanStack Query v5 handles client-side cache for recipe and grocery data. Atmospheric palettes cached within the `restaurants` table row — no separate cache layer.

### Authentication & Security

**Authentication:** None. Single-user app, no login, no session management.

**API Key Isolation:** All external API keys are server-side only. Keys are read via a `getApiKeys()` config helper in each API route. The helper reads from environment variables (`.env.local` for development, Vercel env vars for production). No key ever appears in client-side code, browser-exposed `NEXT_PUBLIC_` variables, or network responses visible to the client.

**BYOAK stance:** MVP runs exclusively on Frank's keys. No user-facing key management, no setup screen. The `getApiKeys()` abstraction is the future injection point — calling it is architecturally clean for v2 extension, but there is zero BYOAK UX in MVP.

**Image lifecycle:** Scan images received by API routes are passed directly to Gemini and discarded within the same request. No image data is written to any storage.

### API & Communication Patterns

**Pattern:** REST — Next.js App Router API routes. No GraphQL, no tRPC.

**Async Confidence Pipeline:** Client-side parallel fetch model.
1. Client submits scan → `/api/scan/menu` or `/api/scan/dish` → Gemini processes → returns structured result immediately
2. Client receives result, renders it, and immediately fires a second call to `/api/scan/enrich` with the identified dish name + context
3. Enrichment call runs Google Places visual reference + USDA name cross-reference in parallel server-side, returns updated confidence signal
4. Client updates the evidence block when enrichment returns — no polling, no persistent connection

This means the processing strip dismisses as soon as step 1 completes; the confidence block updates quietly in the background. If the user navigates away before enrichment completes, the evidence block shows the Gemini-only confidence on first open, and the enrichment result is stored on the recipe when saved.

**API Route Structure:**

```
src/app/api/
  scan/
    menu/route.ts         ← Gemini menu scan → dish list + calorie estimates
    dish/route.ts         ← Gemini dish scan → ingredient list
    enrich/route.ts       ← Async confidence enrichment (Google Places + USDA cross-ref)
  search/
    restaurants/route.ts  ← Google Places restaurant search
    dishes/route.ts       ← Dish lookup + recipe generation without camera
  recipes/
    route.ts              ← GET list, POST create
    [id]/route.ts         ← GET detail, PUT update, DELETE
  grocery/
    route.ts              ← GET list, POST add items
    [id]/route.ts         ← PUT (check/uncheck), DELETE item
    bulk/route.ts         ← DELETE bulk-remove by recipe_id
```

**Error handling standard:** Every API route returns a consistent error shape `{ error: string, code: string }`. Each external service failure is caught independently — a Gemini failure returns an error; a Google Places failure in the enrichment route returns the Gemini-only result with a degraded confidence signal (not an error). No silent failures.

**Rate limiting:** Not implemented in MVP. Google Places calls are gated behind user-confirmed restaurant selection, not fired on keystroke (per project context rule).

### Frontend Architecture

**State Management:** TanStack Query v5 — consistent with MacroLite reference patterns. Handles recipe/grocery fetching, caching, stale-while-revalidate for offline reads, and mutation + cache invalidation. Scan results stored in TanStack Query cache during the enrichment window (4-second undo period reads from this cache before permanent save).

**Component Architecture:** Next.js App Router conventions.
- Server Components for static structure and initial data fetching where possible
- Client Components (`'use client'`) for interactive elements: camera modal, processing strip, grocery check-off, bottom sheets
- Shared UI components in `src/components/ui/` — glass card, bottom sheet, processing strip, atmospheric background, confidence indicator

**PWA Service Worker Caching:**

| Content | Strategy |
|---|---|
| Static assets | Cache-first (Next.js build output) |
| Saved recipes | Stale-while-revalidate — readable offline |
| Grocery list | Local-first write → background sync to Supabase on reconnect |
| Atmospheric palettes | Cached in `restaurants` table; TanStack Query serves from cache |
| Scan / search results | Network-only — requires connectivity |

Grocery list check-off is written locally first via TanStack Query optimistic updates, synced to Supabase when connection is available.

**PWA manifest + service worker:** Next.js 16 native PWA support — no third-party package.

### Infrastructure & Deployment

**Hosting:** Vercel — zero-config deployment from the Next.js 16 App Router. Automatic preview deployments on pull requests.

**Environment:**
- Development: `.env.local` — all 5 API key slots
- Production: Vercel environment variables dashboard

**CI/CD:** Vercel automatic deploys on push to `main`. No additional pipeline required for MVP.

**Monitoring:** None in MVP — personal project scale. Vercel analytics available if needed post-launch.

### Decision Impact Analysis

**Implementation Sequence:**
1. Scaffold + env setup (create-next-app + Supabase schema + .env.local)
2. `getApiKeys()` helper + API route skeleton (establishes server boundary)
3. Supabase client singleton + typed table queries
4. TanStack Query provider + base hooks
5. Gemini scan routes (menu + dish)
6. Enrichment route + client-side parallel fetch pattern
7. Recipe CRUD routes + UI
8. Grocery list routes + UI (aggregation + dual-view)
9. Manual search routes (Google Places)
10. PWA manifest + service worker + install prompt
11. Atmospheric theming pipeline
12. Processing strip + background result delivery

**Cross-Component Dependencies:**
- `getApiKeys()` is a dependency of every external API route — must exist before any route is built
- Supabase schema must be finalised before any CRUD route is built
- TanStack Query provider must wrap the app before any data hook is used
- Processing strip depends on scan routes existing and returning a consistent result shape
- Atmospheric theming depends on the `restaurants` table `atmospheric_palette_json` column being present

---

## Project Structure & Boundaries

### Complete Project Directory Structure

```
plately/
├── README.md
├── package.json
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── postcss.config.js
├── vitest.config.ts
├── .env.local                        ← gitignored; all 5 API key slots
├── .env.example                      ← committed; empty key slots + comments
├── .gitignore
│
├── public/
│   ├── manifest.json                 ← PWA manifest (FR33)
│   ├── sw.js                         ← Service worker — offline cache (FR34)
│   └── icons/                        ← PWA icons (192, 512, maskable)
│
├── supabase/
│   └── schema.sql                    ← DB schema (restaurants, recipes,
│                                         recipe_ingredients, grocery_items)
│
└── src/
    ├── app/                          ← Next.js App Router
    │   ├── globals.css
    │   ├── layout.tsx                ← Root layout: QueryProvider, ThemeProvider,
    │   │                                AtmosphericBackground, ProcessingStrip
    │   ├── page.tsx                  ← Home tab (saved recipes, recent restaurants)
    │   │
    │   ├── search/
    │   │   └── page.tsx              ← Search tab
    │   │
    │   ├── grocery/
    │   │   └── page.tsx              ← Grocery tab
    │   │
    │   ├── recipes/
    │   │   └── [id]/
    │   │       └── page.tsx          ← Recipe detail page
    │   │
    │   └── api/                      ← All server-side routes (API key boundary)
    │       ├── scan/
    │       │   ├── menu/
    │       │   │   └── route.ts      ← POST: Gemini menu scan (FR01,FR06,FR08,FR39)
    │       │   ├── dish/
    │       │   │   └── route.ts      ← POST: Gemini dish scan (FR02,FR07,FR08)
    │       │   └── enrich/
    │       │       └── route.ts      ← POST: async confidence enrichment (FR10,FR11)
    │       ├── search/
    │       │   ├── restaurants/
    │       │   │   └── route.ts      ← GET: Google Places restaurant search (FR29)
    │       │   └── dishes/
    │       │       └── route.ts      ← GET: dish lookup + recipe gen (FR30,FR31)
    │       ├── recipes/
    │       │   ├── route.ts          ← GET list, POST create (FR17,FR18)
    │       │   └── [id]/
    │       │       └── route.ts      ← GET, PUT, DELETE (FR19,FR20,FR21)
    │       └── grocery/
    │           ├── route.ts          ← GET list, POST add items (FR23,FR24,FR25)
    │           ├── [id]/
    │           │   └── route.ts      ← PUT check/uncheck, DELETE item (FR26,FR27)
    │           └── bulk/
    │               └── route.ts      ← DELETE bulk-remove by recipe_id (FR28)
    │
    ├── components/
    │   ├── ui/                       ← Shared primitives (never feature-specific)
    │   │   ├── glass-card.tsx
    │   │   ├── bottom-sheet.tsx
    │   │   ├── confidence-indicator.tsx   ← Evidence block (FR08,FR40)
    │   │   ├── empty-state.tsx
    │   │   └── error-state.tsx            ← Reusable error + retry UI (FR35)
    │   │
    │   ├── layout/                   ← Persistent app chrome
    │   │   ├── atmospheric-background.tsx ← 3-tier theming pipeline
    │   │   ├── glass-tab-bar.tsx
    │   │   ├── camera-fab.tsx
    │   │   └── return-visit-banner.tsx    ← Passive recognition (FR41)
    │   │
    │   ├── scan/                     ← Capture flow
    │   │   ├── camera-modal.tsx           ← FR01-03,FR05
    │   │   ├── processing-strip.tsx       ← Background result delivery
    │   │   ├── scan-results.tsx           ← Menu dish list (FR06,FR09,FR12)
    │   │   ├── dish-detail-sheet.tsx      ← Bottom sheet (FR13,FR14,FR39)
    │   │   └── inference-state.tsx        ← Low-confidence comparison (FR12)
    │   │
    │   ├── recipes/
    │   │   ├── recipe-card.tsx            ← FR18
    │   │   ├── recipe-detail.tsx          ← FR14,FR15,FR19
    │   │   └── recipe-edit.tsx            ← FR15,FR16,FR20
    │   │
    │   ├── grocery/
    │   │   ├── grocery-ingredient-view.tsx  ← FR25,FR26,FR27
    │   │   └── grocery-recipe-view.tsx      ← FR24,FR25,FR28
    │   │
    │   └── search/
    │       ├── search-screen.tsx          ← FR29,FR30
    │       ├── search-results.tsx         ← FR30
    │       └── restaurant-profile.tsx     ← FR22,FR32,FR41
    │
    ├── hooks/                        ← TanStack Query hooks (one file per domain)
    │   ├── use-recipes.ts
    │   ├── use-grocery.ts
    │   ├── use-scan.ts               ← Manages scan submission + enrichment fetch
    │   ├── use-search.ts
    │   └── use-atmospheric.ts        ← Palette extraction + contrast check
    │
    ├── lib/                          ← Server and shared utilities
    │   ├── supabase.ts               ← Singleton Supabase client
    │   ├── api-keys.ts               ← getApiKeys() — BYOAK injection point
    │   ├── atmospheric.ts            ← Colour extraction, contrast enforcement
    │   └── utils.ts                  ← General helpers (cn(), formatters, etc.)
    │
    └── types/
        ├── database.ts               ← Supabase row types (snake_case)
        ├── api.ts                    ← API request/response shapes (camelCase)
        └── domain.ts                 ← Business domain: Recipe, ScanResult, etc.
```

### Architectural Boundaries

**Server boundary (API key isolation):**
Everything under `src/app/api/` runs server-side. No external API key ever leaves this boundary. Client code never calls Gemini, Google Places, or USDA directly.

**Client/Server component boundary:**
- Server Components: `app/page.tsx`, `app/search/page.tsx`, `app/grocery/page.tsx`, `app/recipes/[id]/page.tsx` — initial data fetch
- Client Components (`'use client'`): all of `src/components/` — interactive UI, TanStack Query hooks, camera access, processing strip

**Data boundary:**
`src/lib/supabase.ts` is the only file that touches the DB. Hooks call API routes; API routes call Supabase. Components never touch Supabase directly.

**Type boundary:**
`src/types/database.ts` (snake_case) is used only in API routes for DB queries. `src/types/domain.ts` (camelCase) is used in hooks and components. API routes perform the mapping between the two.

### Requirements to Structure Mapping

| FR Group | Primary Files |
|---|---|
| Capture (FR01–05) | `camera-modal.tsx`, `api/scan/menu/`, `api/scan/dish/` |
| AI + Confidence (FR06–13, FR39–40) | `api/scan/menu/`, `api/scan/dish/`, `api/scan/enrich/`, `confidence-indicator.tsx`, `scan-results.tsx`, `inference-state.tsx` |
| Recipe Management (FR14–22) | `api/recipes/`, `recipe-detail.tsx`, `recipe-edit.tsx`, `recipe-card.tsx`, `use-recipes.ts` |
| Grocery List (FR23–28) | `api/grocery/`, `grocery-ingredient-view.tsx`, `grocery-recipe-view.tsx`, `use-grocery.ts` |
| Discovery & Search (FR29–32, FR41) | `api/search/`, `search-screen.tsx`, `restaurant-profile.tsx`, `return-visit-banner.tsx` |
| App Experience (FR33–38) | `public/manifest.json`, `public/sw.js`, `error-state.tsx` (per-service degradation) |

**Cross-cutting concerns:**

| Concern | Location |
|---|---|
| API key isolation | `src/lib/api-keys.ts` → all `api/*/route.ts` files |
| Atmospheric theming | `src/lib/atmospheric.ts` + `src/hooks/use-atmospheric.ts` + `atmospheric-background.tsx` |
| Offline caching | `public/sw.js` + TanStack Query stale config in `use-recipes.ts`, `use-grocery.ts` |
| Error handling | `error-state.tsx` (UI) + `api.ts` error shape (contract) + `onError` in every hook |
| Confidence pipeline | `use-scan.ts` (orchestrates two-phase fetch) + `confidence-indicator.tsx` (renders evidence) |

---

## Implementation Patterns & Consistency Rules

**8 critical conflict areas** where AI agents could make incompatible choices.

### Naming Patterns

**Database (Supabase — always snake_case):**
- Tables: plural snake_case — `recipes`, `recipe_ingredients`, `grocery_items`, `restaurants`
- Columns: snake_case — `recipe_id`, `google_places_id`, `confidence_level`, `created_at`
- Foreign keys: `{table_singular}_id` — `recipe_id`, `restaurant_id`
- ✅ `recipe_ingredients.confidence_level` ❌ `recipeIngredients.confidenceLevel`

**TypeScript (camelCase in code):**
- Variables/functions: camelCase — `recipeId`, `getApiKeys`, `confidenceLevel`
- React components: PascalCase — `GlassCard`, `ProcessingStrip`, `BottomSheet`
- Files: kebab-case — `glass-card.tsx`, `processing-strip.tsx`, `use-scan.ts`
- Types/Interfaces: PascalCase — `Recipe`, `ScanResult`, `ConfidenceMetadata`

**API routes:** plural nouns, kebab-case — `/api/recipes`, `/api/grocery-items`, `/api/scan/menu`

Database types are snake_case (matching Supabase). Domain types used in components are camelCase. A mapping layer in API routes transforms between them — snake_case must never leak into components.

### Structure Patterns

**TypeScript Type Locations:**

All shared types live in `src/types/` — never inline complex types in components or routes:

```
src/types/
  database.ts     ← Supabase row types (snake_case, mirrors DB schema exactly)
  api.ts          ← API request/response shapes (camelCase)
  domain.ts       ← Business domain types: Recipe, ScanResult, Ingredient, etc.
```

**Component Organisation:** Feature-based grouping under `src/components/`:
```
src/components/
  ui/             ← Shared primitives: GlassCard, BottomSheet, ProcessingStrip, etc.
  scan/           ← Camera modal, scan result list, dish detail sheet
  recipes/        ← Recipe card, recipe detail, recipe edit
  grocery/        ← Grocery list (ingredient view + recipe view), grocery item row
  search/         ← Search input, search results, restaurant profile
  layout/         ← Tab bar, atmospheric background, FAB
```

**Test co-location:** `*.test.ts` / `*.test.tsx` files sit next to the file they test. No separate `__tests__/` directory.

### Format Patterns

**API Response Format — every route returns one of two shapes, no exceptions:**

```typescript
// Success
{ data: T }

// Error
{ error: string, code: string }
```

HTTP status codes: `200` success, `400` bad request, `422` validation, `500` server error, `503` external service unavailable.

External service degradation (not an error — just absent data) returns `null` fields, not an error shape. e.g. Google Places unavailable → `imageUrl: null`, not `{ error: ... }`.

**Scan Result Contract — the shape all scan and enrichment routes must agree on:**

```typescript
// POST /api/scan/menu and /api/scan/dish initial response
{
  data: {
    scanId: string                     // uuid — correlates enrichment update
    type: 'menu' | 'dish'
    dishes: DishResult[]
    confidenceSource: 'gemini-only'    // always this on initial return
  }
}

// DishResult
{
  name: string
  description: string
  calorieEstimate: number | null
  ingredients: IngredientResult[]
  imageUrl: string | null
}

// IngredientResult
{
  name: string
  quantity: string | null
  unit: string | null
  confidenceLevel: 'high' | 'medium' | 'low'
}
```

Enrichment update from `POST /api/scan/enrich` returns the same `DishResult[]` with updated `confidenceLevel` values and `confidenceSource: 'multi-source'`.

### Communication Patterns

**TanStack Query Key Conventions — agents must not invent new key shapes:**

```typescript
['recipes']                         // all recipes
['recipes', recipeId]               // single recipe
['grocery-items']                   // grocery list
['restaurants', restaurantId]       // single restaurant
['scan-result', scanId]             // in-flight scan result (short TTL)
['search', 'restaurants', query]    // restaurant search
['search', 'dishes', query]         // dish search
```

### Process Patterns

**Error Handling — three layers, all agents implement all three:**

```
API Route     → catches external service errors → returns { error, code } with correct HTTP status
Client hook   → TanStack Query onError → shows toast via sonner
Component     → renders error state UI when query.isError is true
```

No swallowed errors. No `console.error` only. No silent degradation without a UI signal.

**Loading States:** TanStack Query `isLoading` / `isFetching` states drive UI. Processing strip is the primary loading surface during scan — do not add additional full-screen spinners during scan flows.

### Enforcement Guidelines

**All AI Agents MUST:**

- Use snake_case for all DB columns/tables; camelCase for all TypeScript identifiers
- Return `{ data: T }` or `{ error: string, code: string }` — no other API response shape
- Import `supabase` from `@/lib/supabase` — never instantiate a Supabase client inline
- Call `getApiKeys()` from `@/lib/api-keys` — never access `process.env.GEMINI_API_KEY` or other external API key env vars directly in a route
- Use the defined TanStack Query key array conventions — never invent new key shapes
- Keep all shared types in `src/types/` — no inline complex type definitions in components or routes
- Follow the three-layer error handling pattern: API route → hook → component
- Use the defined `DishResult` / `IngredientResult` scan contract — never invent parallel result shapes

**Anti-Patterns:**

```typescript
// ❌ Supabase client created inline
const sb = createClient(url, key)

// ✅ Always import from singleton
import { supabase } from '@/lib/supabase'

// ❌ Raw env var in route
const key = process.env.GEMINI_API_KEY

// ✅ Always via helper
const { gemini } = getApiKeys()

// ❌ Snake_case leaking into component props
<RecipeCard recipe_id={id} created_at={date} />

// ✅ camelCase in all component/domain types
<RecipeCard recipeId={id} createdAt={date} />
```


---

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
All technology choices are compatible and conflict-free. Next.js 16 App Router + TanStack Query v5 + Tailwind CSS 4 + Supabase JS work together without version conflicts. The client-side parallel fetch pattern for confidence enrichment integrates naturally with TanStack Query's optimistic update model. Next.js 16 native PWA support is compatible with the service worker caching strategy. No contradictory decisions found across any architectural layer.

**Pattern Consistency:**
- Naming conventions (snake_case DB, camelCase TypeScript) are consistent across all areas with an explicit mapping layer in API routes
- `{ data: T }` / `{ error, code }` response shape is uniform across all 10 API routes
- TanStack Query key conventions cover all domain entities with no overlaps
- Three-layer error handling (route → hook → component) is coherent and maps directly to FR35–37 degradation requirements
- `getApiKeys()` + `supabase` singleton enforcement is consistent with project security rules

**Structure Alignment:**
The project structure directly supports all architectural decisions. The `src/app/api/` boundary cleanly isolates all external API key usage. The `src/types/` three-file split (database/api/domain) enforces the snake_case ↔ camelCase mapping boundary. Feature component grouping under `src/components/` aligns with the FR categories. Cross-cutting concerns (atmospheric theming, confidence pipeline, offline cache) each have a dedicated location in `src/lib/`, `src/hooks/`, and `src/components/layout/`.

### Requirements Coverage Validation ✅

**Functional Requirements (41/41 covered):**

| FR Group | Coverage |
|---|---|
| Capture (FR01–05) | `camera-modal.tsx` + `api/scan/menu/` + `api/scan/dish/` |
| AI + Confidence (FR06–13, FR39–40) | Scan routes + `enrich/route.ts` + `confidence-indicator.tsx` + `inference-state.tsx` |
| Recipe Management (FR14–22) | `api/recipes/` routes + `recipe-detail.tsx` + `recipe-edit.tsx` + `use-recipes.ts` |
| Grocery List (FR23–28) | `api/grocery/` routes (including `bulk/`) + dual-view components + `use-grocery.ts` |
| Discovery & Search (FR29–32, FR41) | `api/search/` routes + `search-screen.tsx` + `restaurant-profile.tsx` + `return-visit-banner.tsx` |
| App Experience (FR33–38) | `manifest.json` + `sw.js` + `error-state.tsx` (per-service degradation) |

**Non-Functional Requirements (16/16 covered):**

| NFR | Architectural Coverage |
|---|---|
| NFR01–02 (performance) | Gemini call server-side; result shown immediately; enrichment async via parallel fetch |
| NFR03 (cache load ≤1s) | TanStack Query stale-while-revalidate for all saved content |
| NFR04 (UI ≤100ms) | No architectural blocker; standard React rendering |
| NFR05–08 (security) | `getApiKeys()` boundary; images discarded in request lifecycle; no auth layer; no PII logging |
| NFR09–12 (integration reliability) | Independent per-route error handling; Google Places/USDA failures return `null` fields, never block core flow |
| NFR13 (free tier) | Zero image storage; minimal 4-table schema |
| NFR14 (BYOAK extensible) | `getApiKeys()` is the single injection point — changing it covers all routes |
| NFR15–16 (accessibility) | Design token enforcement (44px targets); `confidence-indicator.tsx` required to use both colour and text |

### Implementation Readiness Validation ✅

**Decision Completeness:** All critical decisions documented with technology names and rationale. Starter command specified. Implementation sequence ordered. All 8 conflict areas addressed with enforcement rules and concrete anti-pattern examples.

**Structure Completeness:** Complete annotated file tree with FR references on every file. All 10 API routes specified. All component boundaries defined. All cross-cutting concerns mapped to specific locations.

**Pattern Completeness:** Naming conventions cover DB, TypeScript, files, components, and API routes. API response contract fully specified. Scan result contract fully specified. TanStack Query key conventions cover all 7 domain queries. Three-layer error handling pattern covers all failure scenarios defined in NFR09–12.

### Gap Analysis Results

| Priority | Gap | Resolution |
|---|---|---|
| Minor | `sonner` toast library not listed as a post-scaffold addition | Add `sonner` to post-scaffold dependencies — consistent with MacroLite reference; used in TanStack Query `onError` callbacks |
| Minor | USDA attribution (domain requirement, FR37) has no named component | Handled as a utility string in `src/lib/utils.ts`, rendered as a text node in `recipe-detail.tsx` — no separate component required |
| Minor | 4-second undo window for recipe save (post-save discard) not explicitly tied to a storage location | Confirmed: TanStack Query optimistic updates in `use-recipes.ts` hold pre-save state; `['scan-result', scanId]` cache entry covers the undo window |

No critical or blocking gaps found.

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed (PRD, UX spec, research, project context)
- [x] Scale and complexity assessed (Medium-High)
- [x] Technical constraints identified (free tier, iOS Safari PWA, Gemini accuracy)
- [x] Cross-cutting concerns mapped (6 identified and located)

**✅ Architectural Decisions**
- [x] Critical decisions documented with versions and rationale
- [x] Technology stack fully specified (Next.js 16, Supabase, Gemini, Google Places, USDA, Vercel)
- [x] Integration patterns defined (client-side parallel fetch for two-phase confidence)
- [x] Performance considerations addressed (NFR01–04 all covered)
- [x] Security decisions documented (API key isolation, image lifecycle, no PII)
- [x] BYOAK clarified — MVP uses Frank's keys via env vars; no user-facing key management

**✅ Implementation Patterns**
- [x] Naming conventions established (DB snake_case, TS camelCase, files kebab-case)
- [x] Structure patterns defined (types/, components/, hooks/, lib/)
- [x] Scan result contract specified (DishResult, IngredientResult shapes)
- [x] API response format standardised ({ data: T } / { error, code })
- [x] TanStack Query key conventions defined
- [x] Process patterns documented (error handling, loading states)
- [x] Enforcement guidelines with anti-pattern examples

**✅ Project Structure**
- [x] Complete annotated directory structure defined
- [x] All API routes specified with FR references
- [x] Component boundaries established (ui/, layout/, scan/, recipes/, grocery/, search/)
- [x] Integration points mapped (server boundary, data boundary, type boundary)
- [x] Requirements to structure mapping complete (all 6 FR groups + cross-cutting concerns)

### Architecture Readiness Assessment

**Overall Status: READY FOR IMPLEMENTATION**

**Confidence Level: High**

**Key Strengths:**
- The two-phase confidence pipeline is cleanly specified — agents know exactly what shape each phase returns and when to fire the second call
- API key isolation is enforced at the framework level (server routes only) with a single abstraction point ready for v2 extension
- All 41 FRs map to specific files — no ambiguity about where a feature lives
- The scan result contract (DishResult / IngredientResult) is explicit — all agents building scan-related features will produce compatible output
- Free tier constraints are architecturally baked in from day one (no image storage, minimal schema)

**Areas for Future Enhancement (post-MVP):**
- BYOAK UX — `getApiKeys()` abstraction is ready; add per-user key storage and settings screen when sharing with friends
- Android Chrome PWA support — same codebase; validate camera permission flows on Android
- AR overlay camera experience (V2) — camera modal component designed to extend; same entry point and result pipeline
- Restaurant caching optimisation — repeat-visit palette re-extraction already eliminated via DB cache; further optimisation post-validation

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented in this file
- Use the implementation patterns and naming conventions consistently across all components — the enforcement guidelines section is mandatory reading before writing any code
- Respect the server/client/data/type boundaries — never access Supabase or external APIs outside their defined locations
- Use the specified TanStack Query key conventions for all data fetching — do not invent new key shapes
- Use the `DishResult` / `IngredientResult` scan contract — never create parallel result type definitions
- Refer to this document for all architectural questions before making implementation decisions

**First Implementation Priority:**
```bash
npx create-next-app@latest plately --typescript --tailwind --app --eslint --src-dir
```
Then: add Supabase JS, sonner, TanStack Query v5, create `src/lib/supabase.ts`, `src/lib/api-keys.ts`, `.env.local`, and run `supabase/schema.sql` in the Supabase dashboard.
