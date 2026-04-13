# Story 5.2: My Recipes Collection Screen

Status: review
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
**Then** the `RecipesEmptyState` sub-component is shown: dashed border `1.5px dashed rgba(180,170,158,0.35)`, `18px` radius, centred muted text at 12px; no fill, no shadow, no CTA button; the text reads "Dishes you've kept from your restaurant visits will appear here"

**AC3 — Collection query filters correctly**
**Given** the Recipes collection is queried
**When** the query runs
**Then** only recipes with `status: 'kept'` are returned; `auto_captured` and `removed` recipes never appear in My Recipes; uses the existing `useKeptRecipes()` hook (`['recipes', 'kept']` query key)

**AC4 — Recipe card taps to detail view**
**Given** the user taps a RecipeGridCard
**When** they navigate
**Then** they are taken to `/recipe/[id]` (the existing recipe detail page at `src/app/recipe/[id]/page.tsx`) which shows the full recipe detail

**AC5 — Loading and error states**
**Given** the `useKeptRecipes` query is loading (no cached data)
**When** the screen renders
**Then** 4 skeleton placeholder cards are shown in the 2-column grid; no error state is shown for loading

**Given** the `useKeptRecipes` query errors and no cached data exists
**When** the screen renders
**Then** a `role="alert"` error state is shown with "Couldn't load your recipes" and a "Try again" button that calls `refetch()`; the screen does not unmount

**Given** the `useKeptRecipes` query errors but stale cached recipes exist
**When** the screen renders
**Then** the cached recipe grid is shown with a `role="alert"` error banner reading "Couldn't refresh. Showing last saved recipes." and a "Retry" button that calls `refetch()`

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

1. **Screen header** — `22px` bold "My Recipes" title (`fontFamily: var(--font-display), Georgia, serif`); fixed top padding respects safe area via `calc(var(--space-safe-top, 0px) + 16px)`
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
        ) : !recipes || recipes.length === 0 ? (
          isError ? (
            <RecipesErrorState onRetry={refetch} />
          ) : (
            <RecipesEmptyState />
          )
        ) : (
          <>
            {isError && <RecipesErrorBanner onRetry={refetch} />}
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
          </>
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
        Dishes you&apos;ve kept from your restaurant visits will appear here
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

**`RecipesErrorState` sub-component (inline) — full error, no cached data:**

```typescript
function RecipesErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3"
      style={{ minHeight: 120 }}
    >
      <p style={{ fontSize: 14, color: "var(--color-text-secondary)" }}>
        Couldn&apos;t load your recipes
      </p>
      <button
        onClick={onRetry}
        style={{
          fontSize: 13,
          color: "var(--color-text-tertiary)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          textDecoration: "underline",
        }}
      >
        Try again
      </button>
    </div>
  )
}
```

**`RecipesErrorBanner` sub-component (inline) — background refetch failed, stale data visible:**

```typescript
function RecipesErrorBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between"
      style={{
        marginBottom: 12,
        padding: "8px 12px",
        borderRadius: 10,
        background: "rgba(196,98,45,0.08)",
        border: "1px solid rgba(196,98,45,0.15)",
      }}
    >
      <p style={{ fontSize: 12, color: "var(--color-text-secondary)", margin: 0 }}>
        Couldn&apos;t refresh. Showing last saved recipes.
      </p>
      <button
        onClick={onRetry}
        style={{
          fontSize: 12,
          color: "var(--color-accent)",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "0 0 0 8px",
          flexShrink: 0,
        }}
      >
        Retry
      </button>
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

- [x] `src/app/recipes/page.tsx` created — `/recipes` route no longer 404s
- [x] `src/components/screens/RecipesScreen.tsx` created with correct grid layout, empty state, loading state, error state
- [x] Grid shows only `status: 'kept'` recipes via `useKeptRecipes()`
- [x] Tapping a RecipeGridCard navigates to `/recipe/[id]`
- [x] Empty state shows dashed-border placeholder with muted text (no CTA)
- [x] Skeleton shows 4 placeholder cards while loading
- [x] `src/components/screens/RecipesScreen.test.tsx` created; all tests pass
- [x] TypeScript strict: no new errors (`npx tsc --noEmit`)
- [x] `planning/sprint-status.yaml` is NOT modified

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — implementation followed story spec exactly with no debugging required.

### Completion Notes List

- Created `RecipesScreen.tsx` with `"use client"` directive; renders header, grid, empty state, loading skeleton, and error state
- `useKeptRecipes()` supplies data — only `status: 'kept'` recipes are shown (filtered at the Supabase layer)
- `RecipeGridCard` imported from `@/components/ui/RecipeGridCard` (pre-built in Story 4.5); no re-creation
- Navigation via `useRouter().push('/recipe/${recipe.id}')` on card press
- Empty state: dashed border `1.5px dashed rgba(180,170,158,0.35)`, 18px radius, 12px muted text, no CTA
- Loading skeleton: 4 `animate-pulse` placeholder divs, `aria-busy="true"`, `aria-label="Loading recipes"`
- Error state: non-crashing message "Couldn't load your recipes"
- Accessibility: `role="list"` + `aria-label="My Recipes"` on grid; `role="listitem"` on each card wrapper; `role="region"` + `aria-label` on empty state
- Created `src/app/recipes/page.tsx` — Next.js App Router page wrapping `RecipesScreen` in `AppShell` (no `"use client"`)
- 10 new tests in `RecipesScreen.test.tsx` — all pass; full regression suite (579 tests across 46 files) passes
- `npx tsc --noEmit` — zero new errors in modified/created files; all pre-existing errors confirmed pre-existing

### File List

- `src/components/screens/RecipesScreen.tsx` — new: My Recipes collection screen component
- `src/app/recipes/page.tsx` — new: Next.js App Router page for `/recipes` route
- `src/components/screens/RecipesScreen.test.tsx` — new: 10 tests for RecipesScreen

## Change Log

- 2026-04-13: Story 5.2 implemented — My Recipes collection screen, `/recipes` route, and tests
