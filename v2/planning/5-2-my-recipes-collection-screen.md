# Story 5.2: My Recipes Collection Screen

Status: ready-for-dev
Epic: 5 — My Recipes & Cook-at-Home
Story ID: 5.2
Story Key: 5-2-my-recipes-collection-screen
Created: 2026-04-13

---

## Story

As a user,
I want to browse all the dishes I've saved to My Recipes in one dedicated place,
So that I can easily find and revisit the meals I've chosen to recreate at home.

---

## Acceptance Criteria

**AC1 — Recipes grid with kept dishes**
**Given** the user navigates to the Recipes tab (`/recipes`)
**When** one or more dishes have `status: 'kept'`
**Then** saved recipes are displayed as `RecipeGridCard` components in a 2-column grid: photo area 68px, dish name 12px semibold, calorie count in terracotta 11px; surface uses `--glass-base` + `16px` radius + `--shadow-card`

**AC2 — Empty state**
**Given** the user has no dishes with `status: 'kept'`
**When** the Recipes screen renders
**Then** the `SectionEmptyPlaceholder` is shown: dashed border `1.5px dashed rgba(180,170,158,0.35)`, `18px` radius, centred muted text at 12px; no fill, no shadow, no CTA button; the text reads "Save dishes from restaurants to see them here"

**AC3 — Collection query filters correctly**
**Given** the Recipes collection is queried
**When** the query runs
**Then** only recipes with `status: 'kept'` are returned; `auto_captured` and `removed` recipes never appear in My Recipes; uses the existing `useKeptRecipes()` hook (`['recipes', 'kept']` query key)

**AC4 — Recipe card taps to detail view**
**Given** the user taps a RecipeGridCard
**When** they navigate
**Then** they are taken to `/recipe/[id]` (the existing recipe detail page at `src/app/recipe/[id]/page.tsx`) which shows the full recipe detail

**AC5 — Loading and error states**
**Given** the `useKeptRecipes` query is loading
**When** the screen renders
**Then** skeleton placeholder cards are shown in the 2-column grid (same count as last cached result, or 4 skeletons on first load); no error state is shown for loading

**Given** the `useKeptRecipes` query errors
**When** the screen renders
**Then** a non-crashing error message is shown ("Couldn't load your recipes"); the screen does not unmount

---

## Component Specifications

### New File: `src/components/screens/RecipesScreen.tsx`

**Purpose:** Client component that renders the My Recipes collection tab.

**Props interface:**
```typescript
interface RecipesScreenProps {
  // No props needed — data is fetched internally via useKeptRecipes()
}
```

**Structure (top-to-bottom):**

1. **Screen header** — `16px` semibold "My Recipes" title; fixed top padding respects safe area via `var(--space-safe-top)` or `pt-[calc(var(--space-safe-top)+16px)]`
2. **Grid or empty state** — conditional render based on `useKeptRecipes()` result
3. **Bottom padding** — `calc(var(--tab-bar-height) + var(--space-safe-bottom) + 24px)` to avoid nav bar overlap

**Full component scaffold:**

```typescript
"use client"

import { useRouter } from "next/navigation"
import { useKeptRecipes } from "@/hooks/useRecipes"
import { RecipeGridCard } from "@/components/ui/RecipeGridCard"

export function RecipesScreen() {
  const router = useRouter()
  const { data: recipes, isLoading, isError } = useKeptRecipes()

  return (
    <div
      className="min-h-full flex flex-col"
      style={{ paddingBottom: "calc(var(--tab-bar-height) + var(--space-safe-bottom) + 24px)" }}
    >
      {/* Header */}
      <div
        className="px-4 flex items-center"
        style={{ paddingTop: "calc(var(--space-safe-top) + 16px)", paddingBottom: 12 }}
      >
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--color-text-primary)",
            fontFamily: "var(--font-display), Georgia, serif",
          }}
        >
          My Recipes
        </h1>
      </div>

      {/* Content */}
      <div className="flex-1 px-4">
        {isLoading ? (
          <RecipesGridSkeleton />
        ) : isError ? (
          <RecipesErrorState />
        ) : !recipes || recipes.length === 0 ? (
          <RecipesEmptyState />
        ) : (
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: "1fr 1fr" }}
            role="list"
            aria-label="My Recipes"
          >
            {recipes.map((recipe) => (
              <div key={recipe.id} role="listitem">
                <RecipeGridCard
                  recipe={recipe}
                  onPress={() => router.push(`/recipe/${recipe.id}`)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

**`RecipesEmptyState` sub-component (inline in the same file):**

```typescript
function RecipesEmptyState() {
  return (
    <div
      role="region"
      aria-label="My Recipes empty state"
      style={{
        marginTop: 16,
        borderRadius: 18,
        border: "1.5px dashed rgba(180,170,158,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: 160,
        padding: "24px 16px",
      }}
    >
      <p
        style={{
          fontSize: 12,
          color: "var(--color-text-disabled)",
          textAlign: "center",
          maxWidth: 200,
          lineHeight: 1.5,
        }}
      >
        Save dishes from restaurants to see them here
      </p>
    </div>
  )
}
```

**`RecipesGridSkeleton` sub-component (inline):**

```typescript
function RecipesGridSkeleton() {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }} aria-busy="true" aria-label="Loading recipes">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl overflow-hidden"
          style={{ background: "rgba(180,170,158,0.10)", height: 140 }}
          aria-hidden="true"
        />
      ))}
    </div>
  )
}
```

**`RecipesErrorState` sub-component (inline):**

```typescript
function RecipesErrorState() {
  return (
    <div className="flex items-center justify-center" style={{ minHeight: 120 }}>
      <p style={{ fontSize: 14, color: "var(--color-text-tertiary)" }}>
        Couldn&apos;t load your recipes
      </p>
    </div>
  )
}
```

---

### New File: `src/app/recipes/page.tsx`

**Purpose:** Next.js App Router page for the `/recipes` route. Wraps `RecipesScreen` in `AppShell`.

```typescript
import { AppShell } from "@/components/AppShell"
import { RecipesScreen } from "@/components/screens/RecipesScreen"

export default function RecipesPage() {
  return (
    <AppShell>
      <RecipesScreen />
    </AppShell>
  )
}
```

> **Note:** This page does NOT use `"use client"` — `AppShell` handles the client boundary. `RecipesScreen` itself is `"use client"` because it uses `useKeptRecipes()` and `useRouter()`.

---

## Dev Notes

### `/recipes` route is missing — create it

Looking at `src/app/`, there is no `recipes/` directory or `page.tsx`. The TabBar already links to `/recipes` (hardcoded in `TabBar.tsx`), but navigating there currently 404s. This story creates the missing route.

### `RecipeGridCard` is already built

`src/components/ui/RecipeGridCard.tsx` was created in Story 4.5. It accepts `recipe: DomainRecipe` and `onPress: () => void`. Do NOT recreate it.

### `useKeptRecipes()` is already built

`src/hooks/useRecipes.ts` exports `useKeptRecipes()` which queries Supabase for `status: 'kept'` recipes with query key `['recipes', 'kept']`. Do NOT create a new hook.

### CSS variable availability

`var(--tab-bar-height)` and `var(--space-safe-top)` / `var(--space-safe-bottom)` are defined in `src/app/globals.css`. The tab bar height is `62px`; safe top/bottom are set via `env(safe-area-inset-*)` polyfills.

### Key imports

| Need | Source |
|------|--------|
| `useKeptRecipes` | `@/hooks/useRecipes` |
| `RecipeGridCard` | `@/components/ui/RecipeGridCard` |
| `AppShell` | `@/components/AppShell` |
| `useRouter` | `next/navigation` |
| `DomainRecipe` | `@/types/database` (not needed in RecipesScreen directly — RecipeGridCard handles its own types) |

### No atmospheric background on Recipes tab (initial state)

The home screen has an atmospheric background tied to the latest restaurant. The Recipes tab at this stage has no single atmospheric image — `AppShell` will render the default warm cream gradient fallback. Do NOT wire a dynamic atmospheric URL for this story.

### Accessibility

- The recipe grid uses `role="list"` on the container and `role="listitem"` on each card wrapper — this gives VoiceOver a count announcement
- The empty state uses `role="region"` with `aria-label`
- The skeleton uses `aria-busy="true"` and `aria-label="Loading recipes"` so VoiceOver announces loading state

---

## Testing Requirements

### Framework

Vitest + React Testing Library. New test file: `src/components/screens/RecipesScreen.test.tsx`

**Test structure:**

```
describe('RecipesScreen')
  ├── renders "My Recipes" heading
  ├── renders RecipeGridCard for each kept recipe
  ├── renders empty state when no kept recipes exist
  ├── renders skeleton when loading
  ├── renders error state when query errors
  └── navigates to /recipe/[id] when RecipeGridCard is pressed
```

**Mock `useKeptRecipes`:**
```typescript
vi.mock('@/hooks/useRecipes', () => ({
  useKeptRecipes: vi.fn(),
}))
```

**Test data:**
```typescript
const mockRecipe: DomainRecipe = {
  id: "recipe-1",
  restaurantId: "rest-1",
  visitId: null,
  name: "Pad Thai",
  description: null,
  dishImageUrl: null,
  estimatedCalories: 480,
  status: "kept",
  photoStatus: "placeholder",
  geminiConfidence: null,
  dishRating: null,
  dishReviewSnippet: null,
  totalProteinG: 18,
  totalCarbsG: 52,
  totalFatG: 12,
  totalFibreG: null,
  createdAt: new Date().toISOString(),
}
```

**Mock `useRouter`:**
```typescript
const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))
```

---

## What Does NOT Change in This Story

| File | Reason |
|------|--------|
| `src/components/ui/RecipeGridCard.tsx` | Already built in Story 4.5; no changes needed |
| `src/hooks/useRecipes.ts` | `useKeptRecipes` already implemented |
| `src/components/layout/TabBar.tsx` | Already links to `/recipes` |
| `src/components/AppShell.tsx` | No changes needed |
| `src/app/recipe/[id]/page.tsx` | This is the detail page tapped from Recipes; no changes in this story (Story 5.4 adds the cooking instructions slot) |
| `planning/sprint-status.yaml` | Do NOT update |
| Any migration files | No schema changes needed |

---

## Architecture Guardrails

- **`useKeptRecipes()` only** — do not call `useRecipes()` and filter client-side; use the hook that queries by `status: 'kept'` at the Supabase layer
- **`invalidateQueries` not manual cache writes** — RecipesScreen is read-only; no mutations here
- **No `any` types** — `recipes` from `useKeptRecipes()` is `DomainRecipe[]`; fully typed throughout
- **No PII in logs** — no `console.log` with recipe names or user data
- **`"use client"` required on `RecipesScreen`** — it uses `useKeptRecipes()` (TanStack Query) and `useRouter()` (navigation hook)
- **Page file is NOT `"use client"`** — `AppShell` provides the client context

---

## Definition of Done

- [ ] `src/app/recipes/page.tsx` created — `/recipes` route no longer 404s
- [ ] `src/components/screens/RecipesScreen.tsx` created with correct grid layout, empty state, loading state, error state
- [ ] Grid shows only `status: 'kept'` recipes via `useKeptRecipes()`
- [ ] Tapping a RecipeGridCard navigates to `/recipe/[id]`
- [ ] Empty state shows dashed-border placeholder with muted text (no CTA)
- [ ] Skeleton shows 4 placeholder cards while loading
- [ ] `src/components/screens/RecipesScreen.test.tsx` created; all tests pass
- [ ] TypeScript strict: no new errors (`npx tsc --noEmit`)
- [ ] `planning/sprint-status.yaml` is NOT modified

---

## Dev Agent Record

### Agent Model Used

<!-- to be filled in -->

### Debug Log References

<!-- to be filled in -->

### Completion Notes List

<!-- to be filled in -->

### File List

<!-- to be filled in -->
