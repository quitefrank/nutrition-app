---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - 'planning/prd.md'
  - 'planning/ux-design-specification.md'
  - 'planning/implementation-readiness-report-2026-04-11.md'
  - '_context/architecture.md'
  - '_context/project-context.md'
workflowType: 'architecture'
lastStep: 8
status: 'complete'
completedAt: '2026-04-12'
project_name: 'Plately v2'
user_name: 'Frank'
date: '2026-04-12'
---

# Architecture Decision Document — Plately v2

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements (52 total — 47 MVP, 5 Growth):**

| Group | FR Count | Architectural Implication |
|---|---|---|
| Menu Capture (FR1–6) | 6 | Camera + Google Places menu image fetch; Gemini parse; confidence banner |
| Restaurant Discovery (FR7–9) | 3 | Search-triggered enrichment; restaurant caching; same dish-population pipeline as scan |
| Dish Display & Progressive Disclosure (FR10–15) | 6 | Three-tier card system: card (macros+photo) / expanded (ingredient list) / intent-gated ("Make it at home") |
| Dish Photo System (FR16–19) | 4 | Three-state per-dish machine: confirmed / placeholder / suppressed; graceful degradation mandatory |
| Nutritional Data & Ingredient Sourcing (FR20–24) | 5 | USDA as authoritative source; AI-estimated fallback with visual label; portion math client-side |
| Collection Management (FR25–31) | 7 | Two-collection model: Restaurants (auto-captured) + Recipes (user-intentional). Two distinct write paths |
| Graceful Failure & Progressive Recovery (FR32–37) | 6 | Context-aware retry paths (scan vs. search); confidence banner; suppression without layout break |
| System & Data Reliability (FR38–42) | 5 | Zod at every API boundary; migration-first schema; offline read-only; per-API failure isolation |
| Platform, Navigation & Settings (FR43–47) | 5 | PWA install; Places caching; nav shell (Recipes = primary tab, Settings = header control); data reset |

**Non-Functional Requirements:**

| Category | Key Constraints |
|---|---|
| Performance | Scan → dishes ≤10s on LTE; search → dishes ≤5s; FCP ≤3s; photo load ≤2s; macro recalc ≤100ms (client-side); offline read immediate |
| Security | All API keys (Gemini, Places, USDA) server-side only; no PII in logs; images discarded within request lifecycle; Supabase env vars validated at build time |
| Accessibility | WCAG 2.1 AA; 44×44px minimum touch targets; `aria-live="polite"` on async state regions (text mutation only, not `aria-label` mutation); VoiceOver on iOS |
| Integration Reliability | Each external API (Gemini, Places, USDA) fails independently; no cascade; no broken UI on any single-service outage; every failure has a defined degraded visual state |

**Scale & Complexity:**

- **Primary domain:** Full-stack mobile PWA (Next.js App Router + Supabase + Vercel)
- **Complexity level:** Medium — bounded by single-user scope; multi-party API orchestration (Gemini + Places + USDA); brownfield rebuild with v1 patterns as reference
- **Estimated architectural components:** ~9 major (capture pipeline, enrichment pipeline, restaurant collection, recipes collection, photo state system, progressive disclosure renderer, atmospheric background, migration schema, Zod validation layer)

### Technical Constraints & Dependencies

| Constraint | Architectural Impact |
|---|---|
| Gemini 2.5 Flash | Tighter JSON schema enforcement required for Zod compatibility; ingredient extraction is Gemini's only role — USDA is macro authority |
| Google Places API (pay-per-use) | Batch all photo requests per restaurant; cache after first fetch; fire only on confirmed user intent — never on keystrokes |
| USDA FoodData Central | Optional enrichment layer; failures degrade to `~estimated` macro label; never block dish display |
| Supabase (PostgreSQL, anonymous session) | Schema must model dishes as independent entities (not just recipe ingredients); migration-first enforced; env vars guarded at build time |
| iPhone Safari PWA (primary target) | `backdrop-filter` confirmed for glass UI; `env(safe-area-inset-bottom)` throughout; camera via MediaDevices API; no push notifications |
| Next.js App Router | Server Components + API routes as the API key isolation boundary; progressive enrichment via client-side parallel fetch |

### Cross-Cutting Concerns Identified

1. **Zod validation layer** — every API route input + every external API response (Gemini, Places, USDA); project-wide standard established in the foundation epic
2. **Auto-capture write path** — scan/search completion triggers atomic restaurant + dishes creation; failure must not leave partial state in the DB
3. **Progressive enrichment pipeline** — Gemini-first result renders immediately; Places + USDA resolve async and update dish state in-place; identical pattern for scan and search paths
4. **API key isolation** — all external keys server-side only; `getApiKeys()` helper pattern; Supabase env vars guarded at build time with a clear error
5. **Photo state machine** — per-dish state (`confirmed` / `placeholder` / `suppressed`) stored in schema; drives both rendering and layout decisions (suppressed = no card rendered)
6. **Glass token system** — CSS custom properties (`--glass-base`, `--blur-base`, etc.) defined before any component; atmospheric background layer persistent at layout level
7. **Migration-first discipline** — architectural process constraint; all schema changes via numbered migration files; no ad-hoc column additions (fixes v1's 002–008 patch pattern)
8. **TanStack Query offline strategy** — full collection readable offline via stale-while-revalidate; write operations require connectivity

---

## Starter Template Evaluation

### Primary Technology Domain

Full-stack Mobile PWA (Next.js App Router + Supabase + Vercel) — confirmed by existing project structure and `package.json`.

### Starter Options Considered

| Option | Assessment |
|---|---|
| `create-next-app` (official) | Selected — App Router, TypeScript, Tailwind all included; matches confirmed stack exactly |
| T3 Stack | Includes tRPC + Prisma — complexity not needed for single-user app |
| Custom scaffold | No benefit over `create-next-app` for this stack |

### Existing Scaffold: `create-next-app` + Extended Dependencies

The v2 project is already initialised. All packages are present and pinned.

**Initialization Command (reference):**
```bash
npx create-next-app@latest plately --typescript --tailwind --app --eslint --src-dir
```

**Actual Dependencies Installed:**

| Package | Version | Role |
|---|---|---|
| `next` | 16.2.2 | Framework |
| `react` / `react-dom` | 19.2.4 | UI runtime (upgraded from v1's React 18) |
| `tailwindcss` | ^4 | Styling |
| `@supabase/supabase-js` | ^2.101.1 | Database client |
| `@tanstack/react-query` | ^5.96.2 | Server state + offline cache |
| `framer-motion` | ^12.38.0 | Spring animation system |
| `zod` | ^4.3.6 | Validation layer (new in v2) |
| `sonner` | ^2.0.7 | Toast notifications |
| `@google/generative-ai` | ^0.24.1 | Gemini SDK |
| `@fontsource/dm-sans` + `@fontsource/playfair-display` | ^5.2.8 | Typography (from UX spec) |
| `vitest` + `@testing-library/react` | ^4.1.4 / ^16.3.2 | Test infrastructure |

**Architectural Decisions Provided by Scaffold:**

- **Language:** TypeScript strict mode, `src/` directory structure
- **Styling:** Tailwind CSS v4 via `@tailwindcss/postcss`
- **Animation:** Framer Motion v12 (spring physics system)
- **Build:** Turbopack dev server (Next.js 16 default); webpack production build
- **Testing:** Vitest + Testing Library + jsdom
- **Linting:** ESLint 9 with `eslint-config-next`
- **Fonts:** DM Sans (UI) + Playfair Display (display/hero) — already configured

**Key v2 Upgrades from v1:**

| Area | v1 | v2 |
|---|---|---|
| React | 18.3.1 | 19.2.4 |
| Gemini | 1.5 Flash | 2.5 Flash SDK |
| Validation | None | Zod ^4.3.6 |
| Animation | None | Framer Motion 12 |
| Fonts | System only | @fontsource/dm-sans + Playfair Display |

---

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**

1. **Migration-first discipline** — The v1 anti-pattern (ad-hoc patch migrations) has already recurred in v2 (files 002–008). All future schema changes must go through numbered, additive migration files. No ad-hoc `ALTER TABLE` outside of migrations.

2. **Supabase singleton** — Two violations already exist: `scan/route.ts` creates an inline client in its fire-and-forget cache block, and `supabaseAutoSave.ts` creates its own client via a local `getClient()`. Both must import from `@/lib/supabase` to avoid duplicate connection pools.

3. **Env var hard-fail at build time** — `src/lib/supabase.ts` currently `console.warn`s on missing env vars and substitutes placeholder strings, which allows silent runtime failures. NFR10 requires a hard throw at build time instead.

**Important Decisions (Shape Architecture):**

4. **Two-collection model via `recipe.status`** — A single `recipes` table with a `status` enum (`auto_captured` | `kept` | `removed`) models both collections. No separate tables. "Restaurant collection" = all non-removed recipes for a restaurant. "My Recipes" = `status = 'kept'`. Removal is always soft (no row deletion).

5. **Progressive enrichment pipeline** — Gemini result renders immediately; Places + USDA resolve async. This is the canonical pattern for both scan and search paths. No UI blocks waiting for enrichment.

6. **Photo state machine** — Three states per dish: `confirmed` (Places photo resolved), `placeholder` (recognised dish, no photo), `suppressed` (unrecognised, no card rendered). State stored in `recipes.photo_status`; drives both rendering and layout.

7. **Capture inversion** — No save gesture exists anywhere. Scan/search completion IS the capture. Every dish becomes a recipe row immediately. The user removes what they don't want; they never "add" to their collection.

**Deferred Decisions (Post-MVP):**

- Android Chrome PWA support — iPhone Safari is primary; Android deferred to v2.1
- Cooking instructions generation — deferred per UX spec
- Social sharing — Phase 2
- Recipe book OCR — Phase 3
- Push notifications — not possible in Safari PWA; deferred indefinitely

---

### Data Architecture

**Database:** Supabase (PostgreSQL) — typed `Database` generic in `@/lib/supabase.ts`.

**Schema — 5 tables:**

| Table | Purpose |
|---|---|
| `restaurants` | One row per restaurant; `place_id` (nullable) for Places link; `rating`, `user_ratings_total` |
| `restaurant_visits` | Audit trail — one row per scan or search; `visit_type: 'scan' \| 'search'`; `raw_menu_json` |
| `recipes` | One dish = one row; `status` enum (two-collection model); `photo_status` (photo state machine) |
| `recipe_ingredients` | USDA-enriched ingredients; linked to `recipes.id`; unique per `(recipe_id, name)` |
| `grocery_items` | Active grocery list; `added_from_recipe_id` for provenance; `is_checked` for in-store use |

**Two-Collection Model:**

```
recipes.status = 'auto_captured'  →  visible in Restaurant collection
recipes.status = 'kept'           →  visible in both Restaurant and My Recipes
recipes.status = 'removed'        →  hidden from all collections (soft delete)
```

**Validation Strategy:** Zod at every API boundary — two tiers:
- **Lenient schemas** (`.catch()` fallbacks): Gemini response parsing — partial data is better than no data
- **Strict schemas**: API route inputs, USDA response parsing — reject malformed requests immediately

**Migration Approach:** Migration-first, numbered files in `supabase/migrations/`. Migrations must be additive. The v2 patch pattern (002–008) is a known violation and must not recur.

**Caching:** TanStack Query `staleTime: Infinity` for collection queries (revalidate on focus/reconnect). 30-day menu cache in Supabase for repeat restaurant visits. Places API responses cached after first fetch — never re-requested for the same `place_id`.

---

### Authentication & Security

**Authentication:** Anonymous sessions only (Supabase anonymous auth). No user accounts, no email/password, no OAuth. Single-user personal app.

**API Key Isolation:** All external API keys (Gemini, Google Places, USDA) are server-side only. `src/lib/api-keys.ts` uses `import 'server-only'` to enforce this at the module level. Keys are never exposed to the client bundle.

**BYOAK:** Gemini key injection via `X-User-Gemini-Key` request header. Validated server-side (must start with "AI", length ≥ 39). Falls back to the system Gemini key when absent.

**Data Protection:**
- No PII in logs — `console.warn` calls in API routes must not log user-provided text verbatim
- Scan images processed within the request lifecycle and never persisted
- `NEXT_PUBLIC_` vars limited to Supabase URL and anon key

**NFR10 Gap (Must Fix):** `src/lib/supabase.ts` must throw (not warn) when Supabase env vars are absent.

---

### API & Communication Patterns

**API Design:** REST via Next.js App Router API routes (`src/app/api/`). No GraphQL, no tRPC.

**Response Shape:**

```typescript
// Success
{ data: T }

// Error
{ error: { message: string; code?: string } }
```

HTTP status codes follow REST conventions (200, 400, 422, 500).

**Scan Pipeline (Two-Phase):**

```
Phase 1 — Synchronous (blocks UI):
  POST /api/scan → Gemini 2.5 Flash → structured dish list
  └─ Result written to sessionStorage; UI renders immediately
  └─ supabaseAutoSave runs fire-and-forget

Phase 2 — Async (progressive enrichment):
  POST /api/places/nearby  (restaurant photo + metadata)
  POST /api/scan/enrich    (USDA macro enrichment per ingredient)
  └─ Each resolves independently; dish cards update in-place
```

**Error Isolation:** Each external service (Gemini, Places, USDA) fails independently. Degraded states have explicit visual representations (`~estimated` label, placeholder photo state).

**Gemini Fallback:** Primary model: Gemini 2.5 Flash. On 503/429 transient errors, falls back to Gemini 2.0 Flash. Both share the same Zod response schema.

**Zod Schema Architecture:**

```typescript
// Lenient — Gemini response
const DishSchema = z.object({
  name: z.string().catch("Unknown Dish"),
  calories: z.number().nullable().catch(null),
})

// Strict — Route input
const ScanRequestSchema = z.object({
  imageBase64: z.string(),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
})
```

---

### Frontend Architecture

**State Management:** TanStack Query v5 for all server state. No Zustand, no Redux. Ephemeral UI state uses React `useState`/`useReducer`.

**Scan State Transport:** Gemini result written to `sessionStorage` after Phase 1. Recipe detail page reads `sessionStorage` on mount, then picks up the real Supabase UUID via the `plately:supabase-saved` custom event once `supabaseAutoSave` completes.

**Component Architecture:**

```
src/components/
├── screens/        # Full-screen page components
├── scan/           # Camera modal + inference state + restaurant confirmation
├── ui/             # Primitive components
├── layout/         # Shell components (TabBar, AppShell)
└── banners/        # SmartBanner and informational overlays
```

**Glass Token System:**

```css
--glass-base: rgba(255,255,255,0.12)
--glass-elevated: rgba(255,255,255,0.18)
--blur-base: blur(20px)
--blur-strong: blur(32px)
```

Defined at the root layout level; available to all components.

**Atmospheric Background:** Persistent blurred food photo behind every screen (root layout). Falls back to a gradient when no photo is available.

**Navigation:** Bottom tab bar — Restaurants, My Recipes, Grocery, Settings. Scan entry point lives in the Restaurants tab.

**Animation:** Framer Motion v12 spring physics for all transitions. Card expand/collapse, tab transitions, modal entrances all use UX-spec spring presets.

**Offline Strategy:** TanStack Query stale cache — collections readable offline. Write operations require connectivity. No service worker write-through.

---

### Infrastructure & Deployment

**Hosting:** Vercel — auto-deploy on push to `main`. Preview deployments on all pull requests.

**Environment Configuration:**

| Env Var | Scope | Required |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | Yes |
| `GEMINI_API_KEY` | Server only | Yes (unless BYOAK) |
| `GOOGLE_PLACES_API_KEY` | Server only | Yes |
| `USDA_API_KEY` | Server only | Optional (degrades gracefully) |
| `GOOGLE_CSE_KEY` / `GOOGLE_CSE_CX` | Server only | Optional (dish photo fallback) |

**Build:** Turbopack (dev), webpack (production). TypeScript strict mode enforced.

**Testing:** Vitest + React Testing Library + jsdom. Tests co-located with source (`*.test.ts` / `*.test.tsx`).

---

### Decision Impact Analysis

**Implementation Sequence:**

1. Fix NFR10 — `supabase.ts` hard-fail on missing env vars
2. Fix Supabase singleton violations — `scan/route.ts` + `supabaseAutoSave.ts`
3. Schema baseline migration — consolidate 002–008 patches into a clean canonical migration
4. Zod validation layer — add input validation to all existing API routes
5. Two-collection UI — `status`-based collection filtering in `useRecipes`
6. Progressive enrichment hooks — parallel Places + USDA fetch after scan
7. Photo state machine — `photo_status` column + three-state card rendering
8. Glass token system — CSS custom properties at root layout level

**Cross-Component Dependencies:**

| Decision | Depends On | Enables |
|---|---|---|
| Two-collection model | `recipe.status` schema column | Restaurant screen, My Recipes, removal UX |
| Progressive enrichment | Supabase singleton fix | Reliable async save after enrichment |
| Photo state machine | `photo_status` schema column | Dish card layout (no empty broken states) |
| BYOAK Gemini injection | `api-keys.ts` server-only pattern | User key in Settings screen |
| Scan state transport | `sessionStorage` + custom event | Recipe detail page UUID resolution |
| Offline read | TanStack Query stale cache | All collection screens work without connectivity |

---

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:**
6 areas where AI agents could make different choices without explicit rules: naming conventions (DB vs domain vs API), TanStack Query key structure, Zod schema usage (parse vs safeParse), Server vs Client Component boundaries, API response envelope consistency, and sessionStorage/event naming.

---

### Naming Patterns

**Database Naming Conventions:**
- Tables: `plural_snake_case` — `restaurants`, `recipes`, `recipe_ingredients`, `grocery_items`
- Columns: `snake_case` — `place_id`, `dish_image_url`, `estimated_calories`
- Foreign keys: `{table_singular}_id` — `restaurant_id`, `recipe_id`
- Status/enum column values: `snake_case` strings — `"auto_captured"`, `"kept"`, `"removed"`
- Example correct: `restaurant_visits.visit_type = 'scan'`
- Example wrong: `restaurantVisits.visitType = 'Scan'`

**API Naming Conventions:**
- Route segments: `kebab-case` directories — `/api/places/nearby`, `/api/scan/enrich`
- Query parameters: `camelCase` — `?placeId=...`, `?restaurantName=...`
- Request body fields: `camelCase` — `{ imageBase64, mimeType, restaurantName }`
- Response fields: `camelCase` — `{ data: { dishName, calorieEstimate } }`
- Custom request headers: `X-` prefix, Pascal-Kebab — `X-User-Gemini-Key`

**Code Naming Conventions:**
- React components: `PascalCase` files and exports — `DishCard.tsx`, `RestaurantScreen.tsx`
- Hooks: `use` prefix, camelCase — `useRecipes`, `useGrocery`, `useRestaurantEnrichment`
- Utility functions: camelCase — `mapRecipe()`, `resolveScale()`, `getClient()`
- Zod schemas: `PascalCase` + `Schema` suffix — `DishSchema`, `ScanRequestSchema`
- Zod inferred types: `z.infer<typeof XSchema>` — no manual type duplication
- Constants: `SCREAMING_SNAKE_CASE` — `SCAN_SESSION_KEY`, `MENU_CACHE_TTL_DAYS`
- Domain types (camelCase): `RecipeRow`, `RestaurantRow`, `GroceryItem` — from `@/types/database`
- DB row types (snake_case): generated by Supabase, accessed as `Database['public']['Tables']['recipes']['Row']`

---

### Structure Patterns

**Project Organisation:**
```
src/
├── app/
│   ├── api/           # API routes only — no UI components
│   │   ├── scan/
│   │   ├── scan/enrich/
│   │   └── places/nearby/
│   ├── recipe/[id]/   # Recipe detail + edit pages
│   └── page.tsx       # Root shell (renders HomeScreenClient)
├── components/
│   ├── screens/       # Full-page screen components (one per tab)
│   ├── scan/          # Camera + inference + confirmation components
│   ├── layout/        # TabBar, AppShell — rendered once in root layout
│   ├── banners/       # SmartBanner and contextual overlays
│   └── ui/            # Reusable primitive components
├── hooks/             # All custom hooks
├── lib/               # Singletons + utilities
└── types/             # database.ts (Zod schemas + domain types + mappers)
```

**Test Co-location:** Tests live next to source files — not in a separate `__tests__/` directory:
- `src/hooks/useRecipes.test.ts`
- `src/components/scan/DishCard.test.tsx`

**Zod Schema Location:** Database-layer Zod schemas live in `src/types/database.ts`. API-specific Zod schemas (route input/output validation) live inline in the route file they validate.

**Server vs Client Component Boundary:**
- `src/app/api/**` — Server only; `import 'server-only'` where API keys are accessed
- `src/app/page.tsx` — Server Component shell; imports a `*Client.tsx` for interactivity
- `src/components/screens/**` — Client Components (`'use client'`)
- `src/lib/supabase.ts` — Browser-safe (anon key only)
- `src/lib/api-keys.ts` — Server only (`import 'server-only'`)

---

### Format Patterns

**API Response Envelope:**
```typescript
type ApiSuccess<T> = { data: T }
type ApiError      = { error: { message: string; code?: string } }
```

All API routes return this envelope. HTTP status codes follow REST conventions (200, 400, 422, 500).

**Data Exchange Formats:**
- JSON field naming: `camelCase` in all API request/response bodies
- Dates: ISO 8601 strings (`"2026-04-12T14:00:00Z"`) — never Unix timestamps in JSON
- Null vs undefined: use `null` explicitly for absent optional values; never `undefined` in JSON
- Booleans: `true`/`false` — never `1`/`0`

**sessionStorage Key Format:**
```typescript
// Pattern: plately:scan:{uuid}
const SCAN_KEY_PREFIX = "plately:scan:"
const scanKey = `${SCAN_KEY_PREFIX}${crypto.randomUUID()}`
```

**Custom DOM Event Format:**
```typescript
// Pattern: plately:{event-name}
// Payload always a named-field object
window.dispatchEvent(new CustomEvent("plately:supabase-saved", {
  detail: { scanKey: string, recipeId: string }
}))
```

---

### Communication Patterns

**TanStack Query Key Structure:**
```typescript
// Format: [resource, ...identifiers] — all lowercase strings
useQuery({ queryKey: ["recipes"] })                      // all recipes
useQuery({ queryKey: ["recipes", restaurantId] })        // by restaurant
useQuery({ queryKey: ["recipe", recipeId] })             // single recipe
useQuery({ queryKey: ["restaurants"] })
useQuery({ queryKey: ["grocery"] })
useMutation({ mutationKey: ["recipe", "update-status"] })
```

**State Update Patterns:**
- Always use `invalidateQueries` after mutations — never manual cache writes
- Optimistic updates only for low-stakes UX (grocery item check/uncheck)
- Never mutate query data in-place — use `setQueryData` with a new object reference

**Enrichment State Pattern:**
```typescript
// Phase 1: render immediately from scan result
// Phase 2: enrich in parallel, non-blocking
useEffect(() => {
  enrichWithPlaces(scanResult)   // updates dish cards when resolved
  enrichWithUSDA(scanResult)     // updates macro labels when resolved
}, [scanResult])
```

---

### Process Patterns

**Error Handling:**
- API routes: always return `{ error: { message } }` with appropriate HTTP status — never throw unhandled
- Client hooks: TanStack Query `onError` callbacks for toast notifications via Sonner
- Never expose raw error messages to the user — map to user-friendly strings

**Loading State Naming:**
```typescript
// TanStack Query — use built-in flags directly
const { isLoading, isFetching, isPending } = useQuery(...)

// Component-local loading: prefix with 'is'
const [isEnriching, setIsEnriching] = useState(false)
```

**Zod Usage:**
```typescript
// safeParse — when partial data is acceptable (Gemini response)
const result = DishSchema.safeParse(rawData)
if (!result.success) { /* use fallback */ }

// parse (throws) — for API route inputs where bad data must 400
const body = ScanRequestSchema.parse(await req.json())
```

**Retry Behaviour:**
- Gemini: one retry on 503/429, falling back to Gemini 2.0 Flash
- USDA / Places: single attempt only — failures degrade gracefully
- TanStack Query: default retry (3× exponential backoff) for collection queries

---

### Enforcement Guidelines

**All AI Agents MUST:**
- Import Supabase from `@/lib/supabase` — never call `createClient()` inline
- Import API keys via `getApiKeys()` from `@/lib/api-keys` (server-only)
- Wrap all external API responses in a Zod schema before accessing fields
- Return `{ data: T }` or `{ error: { message } }` from every API route
- Co-locate tests next to source files — no separate `__tests__/` directories
- Use `status`-based filtering for all recipe collection queries — never filter by table

**Pattern Enforcement:**
- Violations caught in PR review against this document
- TypeScript strict mode catches most untyped return violations at compile time

**Good Examples:**
```typescript
// ✅ Singleton import
import { supabase } from "@/lib/supabase"

// ✅ Lenient Zod for Gemini
const dish = DishSchema.safeParse(raw).data ?? { name: "Unknown", calories: null }

// ✅ Collection query with status filter
.from("recipes").select("*").eq("restaurant_id", id).neq("status", "removed")
```

**Anti-Patterns:**
```typescript
// ❌ Inline client creation
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, ...)

// ❌ Naked Gemini parse (crashes on bad response)
const dish = DishSchema.parse(raw)

// ❌ Collection query without status filter (includes removed dishes)
.from("recipes").select("*").eq("restaurant_id", id)
```

---

## Project Structure & Boundaries

### Complete Project Directory Structure

```
plately-v2/
├── next.config.ts
├── package.json
├── tsconfig.json
├── postcss.config.mjs           # Tailwind v4 via @tailwindcss/postcss
├── vitest.config.ts
├── .env.local                   # gitignored — real keys
├── .env.example                 # committed — variable names only
├── .gitignore
├── planning/                    # BMAD planning artifacts (read-only after build)
│   ├── prd.md
│   ├── ux-design-specification.md
│   ├── architecture.md
│   └── implementation-readiness-report-2026-04-11.md
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql       # canonical baseline
│       ├── 002–008_*.sql                # ⚠ known patch violations — do not repeat
│       └── 009_*.sql                    # all future migrations start here
├── public/
│   └── icons/                   # PWA icons (192×192, 512×512, maskable)
└── src/
    ├── app/
    │   ├── layout.tsx            # Root layout — AppShell, glass tokens, atmospheric bg
    │   ├── page.tsx              # Server Component shell → renders HomeScreenClient
    │   ├── globals.css           # CSS custom properties (glass tokens), base resets
    │   ├── manifest.ts           # PWA manifest (Next.js generated)
    │   ├── api/
    │   │   ├── scan/
    │   │   │   ├── route.ts              # FR1–6: Gemini scan pipeline
    │   │   │   └── enrich/
    │   │   │       └── route.ts          # FR20–24: USDA macro enrichment
    │   │   └── places/
    │   │       ├── nearby/
    │   │       │   └── route.ts          # FR7–9: nearby restaurant discovery
    │   │       └── search/
    │   │           └── route.ts          # FR7: text-based restaurant search
    │   └── recipe/
    │       └── [id]/
    │           ├── page.tsx              # FR10–15: dish display + progressive disclosure
    │           └── edit/
    │               └── page.tsx          # FR25–31: recipe editing (kept status flow)
    ├── components/
    │   ├── screens/
    │   │   ├── HomeScreenClient.tsx      # Client Component — tab state orchestrator
    │   │   ├── HomeScreen.tsx            # Tab container + atmospheric background
    │   │   ├── RestaurantScreen.tsx      # FR7–15: restaurant collection + dish cards
    │   │   ├── SearchScreen.tsx          # FR7–9: restaurant search UI
    │   │   ├── RecipesScreen.tsx         # FR25–31: My Recipes (kept dishes)
    │   │   ├── ImportScreen.tsx          # FR43+: URL recipe import
    │   │   ├── GroceryScreen.tsx         # Grocery list management
    │   │   └── SettingsScreen.tsx        # FR43–47: settings, data reset, BYOAK UI
    │   ├── scan/
    │   │   ├── CameraModal.tsx           # FR1–3: camera capture + photo upload
    │   │   ├── InferenceState.tsx        # FR4–6: scan progress + confidence display
    │   │   └── RestaurantConfirmation.tsx  # FR7: confirm restaurant before capture
    │   ├── layout/
    │   │   ├── TabBar.tsx                # Bottom tab navigation (4 tabs)
    │   │   └── AppShell.tsx              # Root wrapper (safe areas, PWA chrome)
    │   ├── banners/
    │   │   └── SmartBanner.tsx           # FR32–37: confidence + degraded state banners
    │   └── ui/
    │       ├── GlassCard.tsx             # Glass morphism card primitive
    │       ├── DishCard.tsx              # FR10–15: dish card (confirmed/placeholder/suppressed)
    │       ├── MacroBar.tsx              # FR20–24: macro label row
    │       ├── IngredientList.tsx        # FR20–24: expandable ingredient list
    │       └── PhotoFrame.tsx            # FR16–19: three-state photo display
    ├── hooks/
    │   ├── useRecipes.ts                 # TanStack Query — recipes (status-filtered)
    │   ├── useRestaurants.ts             # TanStack Query — restaurant collection
    │   ├── useGrocery.ts                 # TanStack Query — grocery list mutations
    │   └── useEnrichment.ts              # Progressive enrichment orchestration
    ├── lib/
    │   ├── supabase.ts                   # Supabase singleton (browser-safe anon key)
    │   ├── api-keys.ts                   # Server-only API key access (import 'server-only')
    │   └── supabaseAutoSave.ts           # Fire-and-forget post-scan persistence
    └── types/
        └── database.ts                   # Zod schemas + DB row types + domain types + mappers
```

---

### Architectural Boundaries

**API Boundaries:**

| Boundary | From | To | Auth |
|---|---|---|---|
| Scan | Client → `/api/scan` | → Gemini 2.5 Flash | Optional `X-User-Gemini-Key` |
| Enrichment | Client → `/api/scan/enrich` | → USDA FoodData Central | System `USDA_API_KEY` |
| Restaurant discovery | Client → `/api/places/nearby` | → Google Places API | System `GOOGLE_PLACES_API_KEY` |
| Collection reads | Client → Supabase SDK | → PostgreSQL | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Collection writes | `supabaseAutoSave.ts` → Supabase SDK | → PostgreSQL | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |

**Component Rendering Boundaries:**

| Layer | Location | Rendering | Can access API keys? |
|---|---|---|---|
| Server shells | `app/page.tsx`, `app/recipe/[id]/page.tsx` | Server Component | No |
| API routes | `app/api/**` | Server | Via `getApiKeys()` only |
| Screen components | `components/screens/**` | Client (`'use client'`) | No |
| Scan components | `components/scan/**` | Client (`'use client'`) | No |
| UI primitives | `components/ui/**` | Client or server | No |

**Data Boundaries:**
- **Read path:** Browser → TanStack Query → Supabase anon client → PostgreSQL
- **Write path (scan):** `CameraModal` → `supabaseAutoSave` → Supabase anon client → PostgreSQL
- **Write path (mutations):** Screen components → TanStack Query mutations → Supabase anon client
- **External data:** Always flows through Next.js API routes — never called directly from browser

---

### Requirements to Structure Mapping

**FR Group → Primary Files:**

| FR Group | FR Numbers | Primary Files |
|---|---|---|
| Menu Capture | FR1–6 | `api/scan/route.ts`, `scan/CameraModal.tsx`, `scan/InferenceState.tsx` |
| Restaurant Discovery | FR7–9 | `api/places/nearby/`, `api/places/search/`, `screens/SearchScreen.tsx` |
| Dish Display & Disclosure | FR10–15 | `ui/DishCard.tsx`, `app/recipe/[id]/page.tsx` |
| Dish Photo System | FR16–19 | `ui/PhotoFrame.tsx`, `recipes.photo_status` column |
| Nutritional Data | FR20–24 | `api/scan/enrich/route.ts`, `ui/MacroBar.tsx`, `ui/IngredientList.tsx` |
| Collection Management | FR25–31 | `screens/RecipesScreen.tsx`, `app/recipe/[id]/edit/`, `hooks/useRecipes.ts` |
| Graceful Failure | FR32–37 | `banners/SmartBanner.tsx`, degraded state props in all dish components |
| System Reliability | FR38–42 | `types/database.ts` (Zod), `supabase/migrations/`, `lib/supabase.ts` |
| Platform & Settings | FR43–47 | `layout/TabBar.tsx`, `screens/SettingsScreen.tsx`, `app/manifest.ts` |

**Cross-Cutting Concerns:**

| Concern | Location |
|---|---|
| Zod validation layer | `types/database.ts` (DB schemas) + inline in each `api/**/route.ts` |
| Glass token system | `app/globals.css` (CSS custom properties) |
| Atmospheric background | `app/layout.tsx` (persistent layer) |
| API key isolation | `lib/api-keys.ts` (server-only) |
| Auto-capture write path | `lib/supabaseAutoSave.ts` |
| Supabase singleton | `lib/supabase.ts` |

---

### Integration Points

**Internal Communication:**

| Source | Mechanism | Target |
|---|---|---|
| `CameraModal` → recipe page | `sessionStorage["plately:scan:{id}"]` | `RecipeDetailPage` reads on mount |
| `supabaseAutoSave` → recipe page | `CustomEvent("plately:supabase-saved")` | `RecipeDetailPage` updates UUID |
| Screen components → data | TanStack Query hooks | Supabase DB |
| Phase 1 → Phase 2 enrichment | React `useEffect` after scan resolves | Places + USDA API routes |

**External Integrations:**

| Service | Route | Failure Mode |
|---|---|---|
| Gemini 2.5 Flash | `POST /api/scan` | Falls back to 2.0 Flash, then error banner |
| Google Places | `POST /api/places/nearby` | `placeholder` photo state; no restaurant metadata |
| USDA FoodData Central | `POST /api/scan/enrich` | `~estimated` label on macro display |

**Data Flow — Scan Path:**

```
User scans menu
  → CameraModal captures frame
  → POST /api/scan (Gemini)
  → sessionStorage[scanKey] = structuredDishes
  → UI renders immediately from sessionStorage
  → [async] supabaseAutoSave: restaurant + recipes + ingredients → Supabase
  → [async] POST /api/places/nearby → photo + metadata → Supabase update
  → [async] POST /api/scan/enrich → USDA macros → Supabase update
  → plately:supabase-saved event → UI picks up real UUID
```

---

### File Organisation Patterns

**Configuration Files:**
- `next.config.ts` — root; Turbopack dev + image domain allowlist
- `tsconfig.json` — root; `strict: true`, `baseUrl: "src"`, `paths: { "@/*": ["./*"] }`
- `postcss.config.mjs` — root; `@tailwindcss/postcss` plugin only
- `.env.local` — root, gitignored; all live keys
- `.env.example` — root, committed; key names with placeholder values

**Asset Organisation:**
- `public/icons/` — PWA icons only; no general static assets
- `app/globals.css` — CSS custom properties, Tailwind directives, base resets
- Fonts loaded via `@fontsource/` packages in `app/layout.tsx` — no font files in `public/`

---

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**
All technology versions coexist without conflict. React 19.2.4 + Next.js 16.2.2 + Framer Motion 12 + TanStack Query v5 + Zod v4 are confirmed in `package.json`. No deprecated or incompatible combinations found.

**Pattern Consistency:**
The two-collection model (`recipe.status`) flows coherently from the data schema through query key conventions, component filtering logic, and enforcement anti-patterns. The lenient/strict Zod split correctly maps to Gemini parsing vs. API input validation contexts. Progressive enrichment is specified consistently for both scan and search paths.

**Structure Alignment:**
The Server Component shell → Client Component delegate pattern is applied consistently across all entry points. The `import 'server-only'` guard in `api-keys.ts` is structurally enforced. All API routes are co-located in `src/app/api/` with no direct external calls from client code.

---

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**
All 52 FRs (47 MVP + 5 Growth) are architecturally supported. Every FR group maps to at least one named file or schema element. No FR category is left without a defined home.

**Non-Functional Requirements Coverage:**

| NFR | Architectural Support |
|---|---|
| Scan ≤10s on LTE | Phase 1 synchronous Gemini call; Phase 2 async — UI never waits for enrichment |
| Search → dishes ≤5s | Places API cached after first fetch; no re-request for known `place_id` |
| FCP ≤3s | Server Component shell renders before JS hydration |
| Photo load ≤2s | Places photo URL cached in `recipes.dish_image_url`; no redundant fetches |
| Macro recalc ≤100ms | Client-side portion math; no API call for recalculation |
| API keys server-side only | `import 'server-only'` in `api-keys.ts`; `NEXT_PUBLIC_` vars limited to Supabase anon credentials |
| No PII in logs | Enforcement guideline: API routes must not log user-provided text verbatim |
| Images discarded | Gemini API handles image processing; no server-side storage in scan route |
| Supabase env vars guarded | NFR10 fix is item 1 in implementation sequence |
| Per-API failure isolation | Each of Gemini, Places, USDA fails independently; degraded visual states named for all three |

---

### Implementation Readiness Validation ✅

**Decision Completeness:**
All critical decisions include exact package versions, rationale, and component ownership. Known violations (Supabase singleton, env var guard, migration patches) are documented with fix sequencing so they can be addressed before new feature work begins.

**Structure Completeness:**
Complete directory tree defined with all current and expected files. Files that don't yet exist (e.g., `RecipesScreen.tsx`, `useEnrichment.ts`, UI primitives) are identified as expected brownfield additions — not gaps in the architecture.

**Pattern Completeness:**
All 6 identified conflict points have explicit rules, examples, and anti-patterns. Enforcement guidelines are actionable (PR review + TypeScript strict mode).

---

### Gap Analysis Results

**Important Gaps (address during implementation):**

1. **Framer Motion spring preset registry** — The UX spec references named animation presets. Without canonical values in the architecture, agents could implement different spring physics for the same interaction. Resolution: define a `src/lib/springs.ts` file with named presets (`SPRING_CARD_EXPAND`, `SPRING_TAB_TRANSITION`, etc.) as the first animation implementation step.

**Nice-to-Have Gaps (deferred):**

2. **CI pipeline file** — No `.github/workflows/ci.yml` defined. Vercel handles deployment validation; a lint/test CI step would improve PR confidence. Defer to post-MVP.
3. **`AppShell.tsx` existence** — Referenced in structure; may not yet exist. `app/layout.tsx` currently covers the same purpose. Assess during layout epic implementation.

**No critical gaps found.** All blocking architectural decisions are made.

---

### Architecture Completeness Checklist

**✅ Requirements Analysis**
- [x] Project context thoroughly analyzed (52 FRs, 19 NFRs, 9 component groups)
- [x] Scale and complexity assessed (medium — single-user, multi-party API)
- [x] Technical constraints identified (all 6 major constraints documented)
- [x] Cross-cutting concerns mapped (8 cross-cutting concerns)

**✅ Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified (all packages + exact versions)
- [x] Integration patterns defined (REST, progressive enrichment, two-phase scan)
- [x] Performance considerations addressed (all 5 performance NFRs covered)
- [x] Known violations flagged with prioritised remediation sequence

**✅ Implementation Patterns**
- [x] Naming conventions established (DB, API, code)
- [x] Structure patterns defined (directory org, test co-location, Zod placement)
- [x] Communication patterns specified (TanStack query keys, custom events, sessionStorage keys)
- [x] Process patterns documented (Zod usage, error handling, retry behaviour)
- [x] Enforcement guidelines with good/anti-pattern examples

**✅ Project Structure**
- [x] Complete directory structure defined (all current + expected files named)
- [x] Component rendering boundaries established (server/client table)
- [x] Integration points mapped (internal communication + external API table)
- [x] Requirements to structure mapping complete (all 9 FR groups mapped)
- [x] Data flow diagram (scan path) documented

---

### Architecture Readiness Assessment

**Overall Status: READY FOR IMPLEMENTATION**

**Confidence Level: HIGH**
The v2 scaffold is already bootstrapped and partially implemented. All critical architectural decisions are grounded in existing code, not hypothetical design. Known violations are documented with prioritised fixes that unblock subsequent feature work.

**Key Strengths:**
- Capture inversion is consistently encoded from data schema through component patterns — no ambiguity about when dishes become recipes
- Progressive enrichment is a first-class architectural pattern — the UI is never blocked by optional data
- Three-tier photo state machine eliminates undefined states — every dish card always has a known render mode
- Implementation sequence correctly prioritises infrastructure fixes before feature development

**Areas for Future Enhancement:**
- Framer Motion spring preset registry (`src/lib/springs.ts`)
- CI pipeline for automated lint + test on PRs
- BYOAK settings UI (Growth FR — architecture supports it via existing `api-keys.ts` injection point)

---

### Implementation Handoff

**AI Agent Guidelines:**
- Fix the three infrastructure violations first (NFR10 env guard, Supabase singleton, migration consolidation) — sequenced in the Decision Impact Analysis
- Every new recipe collection query must filter by `status` — the most likely anti-pattern to recur
- All Gemini response parsing must use `safeParse` with fallbacks — never `parse()`
- Every new API route must return `{ data: T }` or `{ error: { message } }` — no naked responses

**First Implementation Step:**
Fix NFR10 in `src/lib/supabase.ts` — throw on missing env vars instead of `console.warn`. The smallest change with the highest confidence value for all subsequent development.
