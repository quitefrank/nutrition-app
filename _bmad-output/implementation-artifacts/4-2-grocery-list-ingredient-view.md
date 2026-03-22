# Story 4.2: Grocery List Ingredient View

**Status:** ready-for-dev
**Story ID:** 4.2
**Epic:** 4 — Grocery List

---

## Story

As a user shopping in-store,
I want to see my grocery list and check off items as I shop,
So that I can track what I've already picked up without losing my list.

---

## Acceptance Criteria

**Given** the grocery list has items
**When** the user opens the Groceries tab
**Then** a flat ingredient-view list renders; rows are 56pt minimum height; unchecked items appear before checked items (ordered by `created_at` within each group)

**Given** an unchecked grocery row is visible
**When** the user taps the check circle (24pt, left side)
**Then** the row immediately shows strikethrough text + 40% opacity via optimistic update; `PUT /api/grocery/[id]` persists `checked: true`; the `['grocery-items']` cache reflects the change

**Given** a checked grocery row is visible
**When** the user taps the check circle again
**Then** the row immediately reverts to normal (no strikethrough); `PUT /api/grocery/[id]` persists `checked: false`

**Given** a grocery row is visible
**When** the user swipes left
**Then** a red delete affordance appears with a trash icon; confirming deletes the item via `DELETE /api/grocery/[id]`; the row is removed from the list

**Given** the grocery list has at least one checked item
**When** the user taps "Clear checked"
**Then** all checked items are deleted via `DELETE /api/grocery/bulk?checked=true`; unchecked items remain

**Given** the grocery list is empty (no items)
**When** the user views the Groceries tab
**Then** empty state shows "Add a saved recipe to start your list →" with a CTA that navigates to the recipe collection

**Given** `GET /api/grocery` is called
**When** called
**Then** it returns items ordered by `created_at`, unchecked items before checked items; response shape `{ data: GroceryListItem[] }`

---

## Tasks / Subtasks

- [ ] Task 1: Add grocery API types to `src/types/api.ts`
  - [ ] Add `GroceryListItem` interface (see Dev Notes)
  - [ ] Add `GroceryCheckRequest` interface (see Dev Notes)
  - [ ] Add `GroceryCheckResponse` interface (see Dev Notes)
  - [ ] Add alongside existing `GroceryAddRequest` / `GroceryAddResponse` — do NOT modify other types

- [ ] Task 2: Add `GET` handler to `src/app/api/grocery/route.ts`
  - [ ] ADD `GET` export to the existing file — do NOT replace or remove the `POST` handler
  - [ ] Query `grocery_items` ordered by `checked` ascending, then `created_at` ascending
  - [ ] Map snake_case DB columns to camelCase `GroceryListItem`
  - [ ] Return `{ data: GroceryListItem[] }`
  - [ ] See Dev Notes for full implementation spec

- [ ] Task 3: Create `src/app/api/grocery/[id]/route.ts` — NEW
  - [ ] UUID validation on `id` param using `UUID_RE`
  - [ ] `PUT`: receives `{ checked: boolean }`, updates `grocery_items.checked`, returns `{ data: { id, checked } }`
  - [ ] `DELETE`: deletes `grocery_items` row by id, returns `{ data: { deleted: true } }`
  - [ ] Next.js 15 dynamic route: `const { id } = await params`
  - [ ] See Dev Notes for full implementation spec

- [ ] Task 4: Create `src/app/api/grocery/bulk/route.ts` — NEW
  - [ ] `DELETE` handler supporting two modes: `?checked=true` and `?recipeId=<uuid>`
  - [ ] `?checked=true` → delete all rows where `checked = true`
  - [ ] `?recipeId=<uuid>` → delete all rows where `recipe_id = <uuid>` (for Story 4.3 — create now to avoid future modification)
  - [ ] UUID validation on `recipeId` param if provided
  - [ ] Returns `{ data: { deleted: number } }`
  - [ ] If neither valid param: 400 BAD_REQUEST
  - [ ] See Dev Notes for full implementation spec

- [ ] Task 5: Extend `src/hooks/use-grocery.ts` with new hooks
  - [ ] ADD `useGroceryItems()` alongside existing `useAddToGrocery` — do NOT replace it
  - [ ] ADD `useCheckGroceryItem()` — optimistic update pattern (see Dev Notes)
  - [ ] ADD `useDeleteGroceryItem()` — optimistic update pattern (see Dev Notes)
  - [ ] ADD `useClearChecked()` — invalidate `['grocery-items']` on success

- [ ] Task 6: Create `src/app/groceries/page.tsx` — NEW (check if it exists first)
  - [ ] Client component (`'use client'`)
  - [ ] Renders `<GroceryIngredientView />` component
  - [ ] Placeholder comment for Story 4.3's toggle pill
  - [ ] Handle loading and error states (same pattern as `src/app/recipes/[id]/page.tsx`)

- [ ] Task 7: Create `src/components/grocery/grocery-ingredient-view.tsx` — NEW
  - [ ] Client component (`'use client'`)
  - [ ] Uses all four new hooks from Task 5
  - [ ] "Clear checked" button — visible only when at least one checked item exists
  - [ ] Flat list of rows (56pt min height)
  - [ ] Each row: check circle (24pt, left) | ingredient name (`text-base`) | quantity+unit (`text-sm`, right-aligned)
  - [ ] Checked rows: strikethrough + 40% opacity
  - [ ] Swipe-left delete (see Dev Notes for approach)
  - [ ] Empty state with CTA to recipe collection
  - [ ] All tappable elements ≥ 44×44px touch target

- [ ] Task 8: Write tests
  - [ ] `src/app/api/grocery/route.test.ts` — MODIFY: add GET handler tests
  - [ ] `src/app/api/grocery/[id]/route.test.ts` — NEW (see Dev Notes)
  - [ ] `src/app/api/grocery/bulk/route.test.ts` — NEW (see Dev Notes)
  - [ ] `src/hooks/use-grocery.test.ts` — MODIFY: add tests for new hooks
  - [ ] `src/components/grocery/grocery-ingredient-view.test.tsx` — NEW (see Dev Notes)

---

## Dev Notes

### Architecture Compliance

| Rule | This story |
|------|-----------|
| `{ data: T }` / `{ error, code }` shapes | All routes return `{ data: T }` (200) or `{ error, code }` (400/500) |
| `supabase` from `@/lib/supabase` | Import singleton — never inline |
| TanStack Query keys | All mutations invalidate `['grocery-items']`; query uses same key |
| `'use client'` | Hook file + page + component are all client |
| UUID validation | Define `UUID_RE` locally in each new route file (same pattern as existing routes) |
| camelCase TS / snake_case DB | Map in each route: `ingredient_name` → `ingredientName`, `recipe_id` → `recipeId`, `created_at` → `createdAt` |
| Optimistic updates | `useCheckGroceryItem` and `useDeleteGroceryItem` use full optimistic pattern with rollback |
| NFR15 | All interactive elements ≥ 44pt; rows ≥ 56pt height |
| `void queryClient.invalidateQueries(...)` | Not awaited — same pattern as all existing hooks |

---

### Existing Code NOT to Modify

- **`src/types/domain.ts`** — `DomainGroceryItem` already exists; do NOT redefine
- **`src/app/api/grocery/route.ts`** — POST handler already exists; only ADD GET
- **`src/hooks/use-grocery.ts`** — `useAddToGrocery` already exists; only ADD new hooks
- **`src/integrations/supabase/`** — auto-generated; do NOT edit
- **`src/app/page.tsx`** and recipe routes — Story 3.5 is in review; avoid touching those files

### Current Test State Warning

Story 3.5 is in "review" status and has modified `src/app/api/recipes/route.test.ts`, `src/app/api/recipes/route.ts`, `src/app/page.test.tsx`, and `src/app/page.tsx`. There may be failing tests from that work-in-progress. Only fix failures introduced by your changes.

---

### Task 1: API Types

Add to **`src/types/api.ts`** (after `GroceryAddResponse`):

```typescript
// ─── Grocery List / Check / Delete ────────────────────────────────────────────

export interface GroceryListItem {
  id: string
  recipeId: string | null
  ingredientName: string
  quantity: string | null
  unit: string | null
  checked: boolean
  createdAt: string
}

export interface GroceryCheckRequest {
  checked: boolean
}

export interface GroceryCheckResponse {
  id: string
  checked: boolean
}
```

---

### Task 2: GET Handler for `src/app/api/grocery/route.ts`

ADD the following export to the existing file — place it before `POST`. Do NOT remove or modify the existing `POST` handler.

```typescript
import type { GroceryListItem } from '@/types/api'

export async function GET() {
  const { data, error } = await supabase
    .from('grocery_items')
    .select('id, recipe_id, ingredient_name, quantity, unit, checked, created_at')
    .order('checked', { ascending: true })      // false before true
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch grocery list', code: 'DB_ERROR' }, { status: 500 })
  }

  const mapped: GroceryListItem[] = (data ?? []).map(row => ({
    id: row.id,
    recipeId: row.recipe_id,
    ingredientName: row.ingredient_name,
    quantity: row.quantity,
    unit: row.unit,
    checked: row.checked,
    createdAt: row.created_at,
  }))

  return NextResponse.json({ data: mapped })
}
```

The `UUID_RE` constant and `supabase` import already exist in the file from Story 4.1. Add only the `GroceryListItem` import and the `GET` export.

---

### Task 3: `src/app/api/grocery/[id]/route.ts` — NEW

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { GroceryCheckRequest, GroceryCheckResponse } from '@/types/api'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id', code: 'BAD_REQUEST' }, { status: 400 })
  }

  let body: GroceryCheckRequest
  try {
    body = await req.json() as GroceryCheckRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'VALIDATION_ERROR' }, { status: 422 })
  }

  if (typeof body.checked !== 'boolean') {
    return NextResponse.json({ error: 'checked must be a boolean', code: 'VALIDATION_ERROR' }, { status: 422 })
  }

  const { error } = await supabase
    .from('grocery_items')
    .update({ checked: body.checked })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Failed to update item', code: 'DB_ERROR' }, { status: 500 })
  }

  const responseData: GroceryCheckResponse = { id, checked: body.checked }
  return NextResponse.json({ data: responseData })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id', code: 'BAD_REQUEST' }, { status: 400 })
  }

  const { error } = await supabase
    .from('grocery_items')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete item', code: 'DB_ERROR' }, { status: 500 })
  }

  return NextResponse.json({ data: { deleted: true } })
}
```

---

### Task 4: `src/app/api/grocery/bulk/route.ts` — NEW

This file is created in full now so Story 4.3 does not need to modify it. Both delete modes must be present.

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const checkedParam = searchParams.get('checked')
  const recipeIdParam = searchParams.get('recipeId')

  // Mode 1: ?checked=true — delete all checked items (this story)
  if (checkedParam === 'true') {
    const { data, error } = await supabase
      .from('grocery_items')
      .delete()
      .eq('checked', true)
      .select('id')

    if (error) {
      return NextResponse.json({ error: 'Failed to clear checked items', code: 'DB_ERROR' }, { status: 500 })
    }

    return NextResponse.json({ data: { deleted: (data ?? []).length } })
  }

  // Mode 2: ?recipeId=<uuid> — delete all items for a recipe (Story 4.3)
  if (recipeIdParam !== null) {
    if (!UUID_RE.test(recipeIdParam)) {
      return NextResponse.json({ error: 'Invalid recipeId', code: 'BAD_REQUEST' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('grocery_items')
      .delete()
      .eq('recipe_id', recipeIdParam)
      .select('id')

    if (error) {
      return NextResponse.json({ error: 'Failed to delete recipe items', code: 'DB_ERROR' }, { status: 500 })
    }

    return NextResponse.json({ data: { deleted: (data ?? []).length } })
  }

  // Neither valid param supplied
  return NextResponse.json(
    { error: 'Provide checked=true or recipeId=<uuid>', code: 'BAD_REQUEST' },
    { status: 400 }
  )
}
```

**Design note:** Supabase's `.delete()` does not return row count by default. Chaining `.select('id')` causes it to return the deleted rows so we can derive the count. This is consistent with the Supabase JS client v2 pattern.

---

### Task 5: Extending `src/hooks/use-grocery.ts`

ADD the following hooks to the existing file. Do NOT replace `useAddToGrocery`.

**Additions to imports at top of file:**

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  GroceryListItem,
  GroceryCheckRequest,
  GroceryCheckResponse,
  ApiSuccess,
} from '@/types/api'
```

(The file already imports `useMutation`, `useQueryClient`, `toast`, and some API types from Story 4.1. Only add what is missing — do not duplicate imports.)

**New hooks:**

```typescript
export function useGroceryItems() {
  return useQuery({
    queryKey: ['grocery-items'],
    queryFn: async (): Promise<GroceryListItem[]> => {
      const res = await fetch('/api/grocery')
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Failed to fetch grocery list')
      }
      const json = await res.json()
      return (json as ApiSuccess<GroceryListItem[]>).data
    },
  })
}

export function useCheckGroceryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }): Promise<GroceryCheckResponse> => {
      const res = await fetch(`/api/grocery/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checked } satisfies GroceryCheckRequest),
      })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Failed to update item')
      }
      const json = await res.json()
      return (json as ApiSuccess<GroceryCheckResponse>).data
    },
    onMutate: async ({ id, checked }) => {
      await queryClient.cancelQueries({ queryKey: ['grocery-items'] })
      const previous = queryClient.getQueryData<GroceryListItem[]>(['grocery-items'])
      queryClient.setQueryData<GroceryListItem[]>(['grocery-items'], old =>
        old?.map(item => item.id === id ? { ...item, checked } : item) ?? []
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['grocery-items'], ctx?.previous)
      toast.error('Failed to update item')
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['grocery-items'] })
    },
  })
}

export function useDeleteGroceryItem() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await fetch(`/api/grocery/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Failed to delete item')
      }
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['grocery-items'] })
      const previous = queryClient.getQueryData<GroceryListItem[]>(['grocery-items'])
      queryClient.setQueryData<GroceryListItem[]>(['grocery-items'], old =>
        old?.filter(item => item.id !== id) ?? []
      )
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      queryClient.setQueryData(['grocery-items'], ctx?.previous)
      toast.error('Failed to delete item')
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['grocery-items'] })
    },
  })
}

export function useClearChecked() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const res = await fetch('/api/grocery/bulk?checked=true', { method: 'DELETE' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error((json as { error?: string }).error ?? 'Failed to clear checked items')
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['grocery-items'] })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}
```

---

### Task 6: `src/app/groceries/page.tsx` — NEW

Check whether this file already exists before creating it. If it does, adapt accordingly rather than overwriting.

```typescript
'use client'

import { GroceryIngredientView } from '@/components/grocery/grocery-ingredient-view'

export default function GroceriesPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        background: 'var(--bg-primary)',
        padding: '0 0 env(safe-area-inset-bottom)',
      }}
    >
      {/* Story 4.3 will add a toggle pill here (ingredient-view / recipe-view) */}
      <GroceryIngredientView />
    </main>
  )
}
```

---

### Task 7: `src/components/grocery/grocery-ingredient-view.tsx` — NEW

#### Swipe-to-Delete Approach

Full CSS swipe gestures (touch events + translateX) are non-trivial in a Next.js/React environment without a gesture library. Use a **tap-to-reveal** pattern instead:

- Each row has a delete button hidden to the right.
- Tapping a "···" overflow icon (or swiping via `onTouchStart`/`onTouchEnd` tracking horizontal delta ≥ 40px) reveals a red trash button that fills the right side of the row.
- The state tracking is row-local (`revealedId: string | null`).
- Tapping the trash button calls `deleteItem(row.id)` and clears `revealedId`.
- Tapping anywhere else clears `revealedId`.

This approach works reliably across iOS Safari (PWA) and desktop without a third-party library.

#### Implementation Spec

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import {
  useGroceryItems,
  useCheckGroceryItem,
  useDeleteGroceryItem,
  useClearChecked,
} from '@/hooks/use-grocery'
import type { GroceryListItem } from '@/types/api'

export function GroceryIngredientView() {
  const { data: items, isLoading, isError } = useGroceryItems()
  const { mutate: checkItem } = useCheckGroceryItem()
  const { mutate: deleteItem } = useDeleteGroceryItem()
  const { mutate: clearChecked, isPending: isClearing } = useClearChecked()
  const [revealedId, setRevealedId] = useState<string | null>(null)
  const router = useRouter()

  // Touch tracking for swipe-left detection
  const [touchStartX, setTouchStartX] = useState<number | null>(null)

  const handleTouchStart = (e: React.TouchEvent, id: string) => {
    // Hide previously revealed row if touching a different row
    if (revealedId !== null && revealedId !== id) setRevealedId(null)
    setTouchStartX(e.touches[0].clientX)
  }

  const handleTouchEnd = (e: React.TouchEvent, id: string) => {
    if (touchStartX === null) return
    const delta = touchStartX - e.changedTouches[0].clientX
    if (delta >= 40) {
      // Swipe left — reveal delete button
      setRevealedId(id)
    } else if (delta <= -20) {
      // Swipe right — hide delete button
      if (revealedId === id) setRevealedId(null)
    }
    setTouchStartX(null)
  }

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          paddingTop: '48px',
          color: 'var(--text-tertiary)',
        }}
        aria-label="Loading grocery list"
      >
        Loading…
      </div>
    )
  }

  if (isError) {
    return (
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          paddingTop: '48px',
          color: 'var(--text-error, #ef4444)',
        }}
      >
        Failed to load grocery list
      </div>
    )
  }

  if (!items || items.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
          paddingTop: '80px',
          padding: '80px 24px 0',
          textAlign: 'center',
        }}
      >
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-base)' }}>
          Your grocery list is empty.
        </p>
        <button
          onClick={() => router.push('/recipes')}
          style={{
            minHeight: '44px',
            padding: '0 24px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(255,255,255,0.12)',
            color: 'var(--text-primary)',
            fontWeight: 600,
            fontSize: 'var(--text-base)',
            border: 'none',
            cursor: 'pointer',
          }}
          aria-label="Go to recipe collection"
        >
          Add a saved recipe to start your list →
        </button>
      </div>
    )
  }

  const hasChecked = items.some(item => item.checked)

  return (
    <div
      style={{ padding: '16px 0' }}
      // Dismiss revealed delete button on outside tap
      onClick={() => { if (revealedId !== null) setRevealedId(null) }}
    >
      {/* Header row with Clear checked */}
      {hasChecked && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '0 16px 8px',
          }}
          // Stop propagation so clicking this area doesn't dismiss revealed rows prematurely
          onClick={e => e.stopPropagation()}
        >
          <button
            onClick={() => clearChecked()}
            disabled={isClearing}
            style={{
              minHeight: '44px',
              padding: '0 16px',
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              color: 'var(--text-tertiary)',
              fontSize: 'var(--text-sm)',
              fontWeight: 500,
              border: '1px solid rgba(255,255,255,0.12)',
              cursor: isClearing ? 'not-allowed' : 'pointer',
            }}
            aria-label="Clear all checked items"
          >
            {isClearing ? 'Clearing…' : 'Clear checked'}
          </button>
        </div>
      )}

      {/* Grocery rows */}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="Grocery list">
        {items.map(item => (
          <GroceryRow
            key={item.id}
            item={item}
            isRevealed={revealedId === item.id}
            onCheck={() => checkItem({ id: item.id, checked: !item.checked })}
            onDelete={() => {
              deleteItem(item.id)
              setRevealedId(null)
            }}
            onTouchStart={e => handleTouchStart(e, item.id)}
            onTouchEnd={e => handleTouchEnd(e, item.id)}
            onRowClick={e => {
              e.stopPropagation()
              if (revealedId !== null && revealedId !== item.id) setRevealedId(null)
            }}
          />
        ))}
      </ul>
    </div>
  )
}

// ─── Sub-component ─────────────────────────────────────────────────────────────

interface GroceryRowProps {
  item: GroceryListItem
  isRevealed: boolean
  onCheck: () => void
  onDelete: () => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
  onRowClick: (e: React.MouseEvent) => void
}

function GroceryRow({
  item,
  isRevealed,
  onCheck,
  onDelete,
  onTouchStart,
  onTouchEnd,
  onRowClick,
}: GroceryRowProps) {
  const quantityLabel = [item.quantity, item.unit].filter(Boolean).join(' ')

  return (
    <li
      style={{
        position: 'relative',
        overflow: 'hidden',
        minHeight: '56px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onClick={onRowClick}
    >
      {/* Main row content */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '0 16px',
          minHeight: '56px',
          opacity: item.checked ? 0.4 : 1,
          transform: isRevealed ? 'translateX(-72px)' : 'translateX(0)',
          transition: 'transform 0.2s ease, opacity 0.15s ease',
        }}
      >
        {/* Check circle */}
        <button
          onClick={e => {
            e.stopPropagation()
            onCheck()
          }}
          style={{
            flexShrink: 0,
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
          }}
          aria-label={item.checked ? `Uncheck ${item.ingredientName}` : `Check ${item.ingredientName}`}
        >
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              border: `2px solid ${item.checked ? 'var(--text-tertiary)' : 'var(--text-secondary)'}`,
              background: item.checked ? 'var(--text-tertiary)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-hidden="true"
          >
            {item.checked && (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="var(--bg-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </button>

        {/* Ingredient name */}
        <span
          style={{
            flex: 1,
            fontSize: 'var(--text-base)',
            color: 'var(--text-primary)',
            textDecoration: item.checked ? 'line-through' : 'none',
          }}
        >
          {item.ingredientName}
        </span>

        {/* Quantity + unit */}
        {quantityLabel && (
          <span
            style={{
              flexShrink: 0,
              fontSize: 'var(--text-sm)',
              color: 'var(--text-tertiary)',
              textAlign: 'right',
            }}
          >
            {quantityLabel}
          </span>
        )}
      </div>

      {/* Revealed delete button (swipe-left affordance) */}
      {isRevealed && (
        <button
          onClick={e => {
            e.stopPropagation()
            onDelete()
          }}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            width: '72px',
            height: '100%',
            background: '#ef4444',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          aria-label={`Delete ${item.ingredientName}`}
        >
          <Trash2 size={20} color="#fff" aria-hidden="true" />
        </button>
      )}
    </li>
  )
}
```

**Design decisions:**
- The `translateX(-72px)` slide on the row content + absolute-positioned delete button gives a native-feeling swipe affordance without any third-party gesture library.
- A single `revealedId` state in the parent means only one row's delete can be visible at a time.
- Tapping anywhere outside the list (the outer `onClick` on the container) dismisses the revealed row.
- `Trash2` is from `lucide-react`, which is already a dependency (used in existing recipe components).

---

### Task 8: Test Guidance

#### `src/app/api/grocery/route.test.ts` — MODIFY (add GET tests)

Add the following `describe` block to the existing file:

```typescript
import { GET } from './route'

// ... existing POST describe block ...

describe('GET /api/grocery', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns items mapped to camelCase ordered by checked then created_at', async () => {
    const fakeRows = [
      { id: 'g1', recipe_id: null, ingredient_name: 'Eggs', quantity: '2', unit: null, checked: false, created_at: '2026-01-01T00:00:00Z' },
      { id: 'g2', recipe_id: 'r1', ingredient_name: 'Butter', quantity: '100', unit: 'g', checked: true, created_at: '2026-01-01T00:01:00Z' },
    ]
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      // second .order() call resolves
      // Note: chain .order().order() — mock returnThis for first, resolve for second
    })
    // Because vitest mocks return `this` for chained calls, you may need to structure
    // the mock as a single object with all methods returning `this` except the terminal
    // call. Adjust to match actual chain in the implementation.

    // Expected response:
    // { data: [{ id: 'g1', recipeId: null, ingredientName: 'Eggs', ... }] }
  })

  it('DB error → 500 DB_ERROR', async () => {
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      // terminal order resolves with error
    })
    // expect status 500, body.code === 'DB_ERROR'
  })
})
```

> **Mocking note for chained `.order().order()`**: Set up the mock chain so `.select()` returns an object with `.order()`, and the second `.order()` returns a Promise resolving to `{ data, error }`. Example:
> ```typescript
> mockFrom.mockReturnValueOnce({
>   select: vi.fn().mockReturnValue({
>     order: vi.fn().mockReturnValue({
>       order: vi.fn().mockResolvedValue({ data: fakeRows, error: null }),
>     }),
>   }),
> })
> ```

#### `src/app/api/grocery/[id]/route.test.ts` — NEW

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PUT, DELETE } from './route'

vi.mock('server-only', () => ({}))

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

const ITEM_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

function makePutRequest(body: object) {
  return new Request(`http://localhost/api/grocery/${ITEM_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as import('next/server').NextRequest
}

function makeDeleteRequest() {
  return new Request(`http://localhost/api/grocery/${ITEM_ID}`, {
    method: 'DELETE',
  }) as import('next/server').NextRequest
}

describe('PUT /api/grocery/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invalid UUID → 400 BAD_REQUEST', async () => {
    const res = await PUT(makePutRequest({ checked: true }), makeParams('not-a-uuid'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('BAD_REQUEST')
  })

  it('checked not boolean → 422 VALIDATION_ERROR', async () => {
    const res = await PUT(makePutRequest({ checked: 'yes' }), makeParams(ITEM_ID))
    expect(res.status).toBe(422)
  })

  it('updates checked=true → 200 with { id, checked: true }', async () => {
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    const res = await PUT(makePutRequest({ checked: true }), makeParams(ITEM_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ id: ITEM_ID, checked: true })
  })

  it('DB error → 500 DB_ERROR', async () => {
    mockFrom.mockReturnValueOnce({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: new Error('DB') }),
    })
    const res = await PUT(makePutRequest({ checked: false }), makeParams(ITEM_ID))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.code).toBe('DB_ERROR')
  })
})

describe('DELETE /api/grocery/[id]', () => {
  beforeEach(() => vi.clearAllMocks())

  it('invalid UUID → 400 BAD_REQUEST', async () => {
    const res = await DELETE(makeDeleteRequest(), makeParams('not-a-uuid'))
    expect(res.status).toBe(400)
  })

  it('deletes row → 200 with { deleted: true }', async () => {
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    const res = await DELETE(makeDeleteRequest(), makeParams(ITEM_ID))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual({ deleted: true })
  })

  it('DB error → 500 DB_ERROR', async () => {
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: new Error('DB') }),
    })
    const res = await DELETE(makeDeleteRequest(), makeParams(ITEM_ID))
    expect(res.status).toBe(500)
  })
})
```

#### `src/app/api/grocery/bulk/route.test.ts` — NEW

Key test cases:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DELETE } from './route'

vi.mock('server-only', () => ({}))

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

const RECIPE_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

function makeRequest(queryString: string) {
  return new Request(`http://localhost/api/grocery/bulk${queryString}`, {
    method: 'DELETE',
  }) as import('next/server').NextRequest
}

describe('DELETE /api/grocery/bulk', () => {
  beforeEach(() => vi.clearAllMocks())

  it('no valid param → 400 BAD_REQUEST', async () => {
    const res = await DELETE(makeRequest(''))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.code).toBe('BAD_REQUEST')
  })

  it('?checked=true → deletes checked items, returns count', async () => {
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: 'g1' }, { id: 'g2' }], error: null }),
    })
    const res = await DELETE(makeRequest('?checked=true'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.deleted).toBe(2)
  })

  it('?recipeId=<valid-uuid> → deletes recipe items, returns count', async () => {
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: [{ id: 'g3' }], error: null }),
    })
    const res = await DELETE(makeRequest(`?recipeId=${RECIPE_ID}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.deleted).toBe(1)
  })

  it('?recipeId=invalid → 400 BAD_REQUEST', async () => {
    const res = await DELETE(makeRequest('?recipeId=not-a-uuid'))
    expect(res.status).toBe(400)
  })

  it('DB error on checked=true → 500 DB_ERROR', async () => {
    mockFrom.mockReturnValueOnce({
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockResolvedValue({ data: null, error: new Error('DB') }),
    })
    const res = await DELETE(makeRequest('?checked=true'))
    expect(res.status).toBe(500)
  })
})
```

> **Mocking note for `.delete().eq().select()`**: The terminal call is `.select()` (not `.eq()`). Use `mockReturnThis()` for `.delete()` and `.eq()`, and `mockResolvedValue(...)` for `.select()`.

#### `src/hooks/use-grocery.test.ts` — MODIFY (add tests for new hooks)

Follow the existing hook test pattern. Key test cases to add for new hooks:

```typescript
// useGroceryItems
// - queryFn calls GET /api/grocery
// - returns mapped GroceryListItem[]
// - throws on non-ok response

// useCheckGroceryItem
// - mutationFn calls PUT /api/grocery/:id with { checked }
// - onMutate: applies optimistic update to ['grocery-items'] cache
// - onError: rolls back previous cache state, calls toast.error
// - onSettled: invalidates ['grocery-items']

// useDeleteGroceryItem
// - mutationFn calls DELETE /api/grocery/:id
// - onMutate: removes item from ['grocery-items'] cache optimistically
// - onError: rolls back previous cache state, calls toast.error
// - onSettled: invalidates ['grocery-items']

// useClearChecked
// - mutationFn calls DELETE /api/grocery/bulk?checked=true
// - onSuccess: invalidates ['grocery-items']
// - onError: calls toast.error
```

#### `src/components/grocery/grocery-ingredient-view.test.tsx` — NEW

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GroceryIngredientView } from './grocery-ingredient-view'
import type { GroceryListItem } from '@/types/api'

// Mock hooks
vi.mock('@/hooks/use-grocery', () => ({
  useGroceryItems: vi.fn(),
  useCheckGroceryItem: vi.fn(),
  useDeleteGroceryItem: vi.fn(),
  useClearChecked: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

import {
  useGroceryItems,
  useCheckGroceryItem,
  useDeleteGroceryItem,
  useClearChecked,
} from '@/hooks/use-grocery'

const mockItem: GroceryListItem = {
  id: 'g1',
  recipeId: null,
  ingredientName: 'Eggs',
  quantity: '2',
  unit: null,
  checked: false,
  createdAt: '2026-01-01T00:00:00Z',
}

const checkedItem: GroceryListItem = { ...mockItem, id: 'g2', ingredientName: 'Butter', checked: true }

function setupMocks({
  items = [mockItem],
  isLoading = false,
  isError = false,
}: {
  items?: GroceryListItem[]
  isLoading?: boolean
  isError?: boolean
} = {}) {
  const mockCheck = vi.fn()
  const mockDelete = vi.fn()
  const mockClear = vi.fn()

  vi.mocked(useGroceryItems).mockReturnValue({ data: items, isLoading, isError } as ReturnType<typeof useGroceryItems>)
  vi.mocked(useCheckGroceryItem).mockReturnValue({ mutate: mockCheck } as ReturnType<typeof useCheckGroceryItem>)
  vi.mocked(useDeleteGroceryItem).mockReturnValue({ mutate: mockDelete } as ReturnType<typeof useDeleteGroceryItem>)
  vi.mocked(useClearChecked).mockReturnValue({ mutate: mockClear, isPending: false } as ReturnType<typeof useClearChecked>)

  return { mockCheck, mockDelete, mockClear }
}

describe('GroceryIngredientView', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows loading state', () => {
    setupMocks({ isLoading: true, items: [] })
    render(<GroceryIngredientView />)
    expect(screen.getByLabelText('Loading grocery list')).toBeDefined()
  })

  it('shows error state', () => {
    setupMocks({ isError: true, items: [] })
    render(<GroceryIngredientView />)
    expect(screen.getByText(/Failed to load grocery list/i)).toBeDefined()
  })

  it('shows empty state with CTA when no items', () => {
    setupMocks({ items: [] })
    render(<GroceryIngredientView />)
    expect(screen.getByRole('button', { name: /Go to recipe collection/i })).toBeDefined()
  })

  it('renders grocery row with ingredient name and quantity', () => {
    setupMocks()
    render(<GroceryIngredientView />)
    expect(screen.getByText('Eggs')).toBeDefined()
    expect(screen.getByText('2')).toBeDefined()
  })

  it('tapping check circle calls checkItem with toggled checked value', () => {
    const { mockCheck } = setupMocks()
    render(<GroceryIngredientView />)
    const checkBtn = screen.getByRole('button', { name: /Check Eggs/i })
    fireEvent.click(checkBtn)
    expect(mockCheck).toHaveBeenCalledWith({ id: 'g1', checked: true })
  })

  it('checked item shows strikethrough', () => {
    setupMocks({ items: [checkedItem] })
    render(<GroceryIngredientView />)
    const nameEl = screen.getByText('Butter')
    expect(nameEl.style.textDecoration).toBe('line-through')
  })

  it('"Clear checked" button visible only when at least one checked item', () => {
    setupMocks({ items: [mockItem, checkedItem] })
    render(<GroceryIngredientView />)
    expect(screen.getByRole('button', { name: /Clear all checked items/i })).toBeDefined()
  })

  it('"Clear checked" button not visible when no checked items', () => {
    setupMocks({ items: [mockItem] })
    render(<GroceryIngredientView />)
    expect(screen.queryByRole('button', { name: /Clear all checked items/i })).toBeNull()
  })
})
```

---

### Cross-Story Context

- **Story 4.1** (done): Created `src/app/api/grocery/route.ts` (POST only) and `src/hooks/use-grocery.ts` (`useAddToGrocery` only). This story EXTENDS both files.
- **Story 4.3** (coming): Will add recipe-view toggle UI using the same `['grocery-items']` cache. Will use `DELETE /api/grocery/bulk?recipeId=xxx` — created in `bulk/route.ts` now so 4.3 does not need to touch it.
- **Story 4.4** (coming): PWA offline support; builds on TanStack Query caching established here.
- **Story 3.5** (in review): Modified `src/app/page.tsx` and recipe routes — avoid touching those files.

---

## Dev Agent Record

### Agent Model Used

_To be filled by dev agent_

### Debug Log References

_None_

### Completion Notes List

_To be filled by dev agent_

### File List

- `src/types/api.ts` — MODIFY: add `GroceryListItem`, `GroceryCheckRequest`, `GroceryCheckResponse` (Task 1)
- `src/app/api/grocery/route.ts` — MODIFY: add `GET` handler alongside existing `POST` (Task 2)
- `src/app/api/grocery/[id]/route.ts` — NEW: `PUT` and `DELETE` handlers (Task 3)
- `src/app/api/grocery/bulk/route.ts` — NEW: `DELETE` handler for `?checked=true` and `?recipeId=<uuid>` (Task 4)
- `src/hooks/use-grocery.ts` — MODIFY: add `useGroceryItems`, `useCheckGroceryItem`, `useDeleteGroceryItem`, `useClearChecked` (Task 5)
- `src/app/groceries/page.tsx` — NEW (Task 6)
- `src/components/grocery/grocery-ingredient-view.tsx` — NEW (Task 7)
- `src/app/api/grocery/route.test.ts` — MODIFY: add GET tests (Task 8)
- `src/app/api/grocery/[id]/route.test.ts` — NEW (Task 8)
- `src/app/api/grocery/bulk/route.test.ts` — NEW (Task 8)
- `src/hooks/use-grocery.test.ts` — MODIFY: add tests for new hooks (Task 8)
- `src/components/grocery/grocery-ingredient-view.test.tsx` — NEW (Task 8)

---

## Change Log

- 2026-03-22: Story 4.2 created — grocery list ingredient view
