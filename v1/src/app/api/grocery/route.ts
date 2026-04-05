import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { GroceryAddRequest, GroceryAddResponse, GroceryListItem } from '@/types/api'

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Only matches strictly numeric strings (no unit suffixes, no Infinity)
const STRICT_NUMERIC_RE = /^\s*-?\d+(\.\d+)?\s*$/

function mergeQuantity(
  existingQty: string | null,
  incomingQty: string | null,
  existingUnit: string | null | undefined,
  incomingUnit: string | null | undefined,
): string | null {
  if (!existingQty) return incomingQty
  if (!incomingQty) return existingQty
  // Don't merge numerically if units are both present and differ
  if (existingUnit != null && incomingUnit != null && existingUnit !== incomingUnit) {
    return existingQty
  }
  // Only sum strictly numeric strings (guards against "50 grams", "Infinity", etc.)
  if (STRICT_NUMERIC_RE.test(existingQty) && STRICT_NUMERIC_RE.test(incomingQty)) {
    const a = parseFloat(existingQty)
    const b = parseFloat(incomingQty)
    const sum = a + b
    return Number.isInteger(sum) ? String(sum) : String(Math.round(sum * 100) / 100)
  }
  // Non-numeric quantities (e.g. "to taste", "50 grams"): retain existing
  return existingQty
}

export async function POST(req: NextRequest) {
  let body: GroceryAddRequest
  try {
    body = await req.json() as GroceryAddRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'VALIDATION_ERROR' }, { status: 422 })
  }

  // Guard against JSON null or non-object body
  if (body === null || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid request body', code: 'VALIDATION_ERROR' }, { status: 422 })
  }

  if (!body.recipeId || !UUID_RE.test(body.recipeId)) {
    return NextResponse.json({ error: 'Invalid recipeId', code: 'BAD_REQUEST' }, { status: 400 })
  }

  // Fetch recipe ingredients
  const { data: ingredients, error: ingError } = await supabase
    .from('recipe_ingredients')
    .select('id, name, quantity, unit')
    .eq('recipe_id', body.recipeId)

  if (ingError) {
    return NextResponse.json({ error: 'Failed to fetch recipe ingredients', code: 'DB_ERROR' }, { status: 500 })
  }

  if (!ingredients || ingredients.length === 0) {
    return NextResponse.json({ data: { added: 0, merged: 0 } satisfies GroceryAddResponse })
  }

  // Pre-aggregate within-recipe duplicate names (skip null names)
  const dedupedMap = new Map<string, typeof ingredients[0]>()
  for (const ing of ingredients) {
    if (!ing.name) continue
    const key = ing.name.toLowerCase()
    const prev = dedupedMap.get(key)
    if (prev) {
      dedupedMap.set(key, { ...prev, quantity: mergeQuantity(prev.quantity, ing.quantity, prev.unit, ing.unit) })
    } else {
      dedupedMap.set(key, ing)
    }
  }
  const dedupedIngredients = Array.from(dedupedMap.values())

  if (dedupedIngredients.length === 0) {
    return NextResponse.json({ data: { added: 0, merged: 0 } satisfies GroceryAddResponse })
  }

  // Fetch existing UNCHECKED grocery items to detect duplicates
  // Checked items are "done" — we treat them as not present for merge purposes
  const { data: existingItems, error: fetchError } = await supabase
    .from('grocery_items')
    .select('id, ingredient_name, quantity, unit')
    .eq('checked', false)

  if (fetchError) {
    return NextResponse.json({ error: 'Failed to fetch grocery list', code: 'DB_ERROR' }, { status: 500 })
  }

  // Build lookup map keyed by lowercase ingredient_name (skip rows with null names)
  const existingMap = new Map(
    (existingItems ?? [])
      .filter(item => item.ingredient_name != null)
      .map(item => [item.ingredient_name.toLowerCase(), item])
  )

  let added = 0
  let merged = 0

  for (const ing of dedupedIngredients) {
    const normalizedName = ing.name.toLowerCase()
    const existing = existingMap.get(normalizedName)

    if (existing) {
      // Merge: update quantity only; retain existing recipe_id (for recipe-view grouping)
      const mergedQty = mergeQuantity(existing.quantity, ing.quantity, existing.unit, ing.unit)
      const { error: updateError } = await supabase
        .from('grocery_items')
        .update({ quantity: mergedQty })
        .eq('id', existing.id)

      if (updateError) {
        return NextResponse.json({ error: 'Failed to merge grocery item', code: 'DB_ERROR' }, { status: 500 })
      }
      merged++
    } else {
      // Insert new row
      const { error: insertError } = await supabase
        .from('grocery_items')
        .insert({
          recipe_id: body.recipeId,
          ingredient_name: ing.name,
          quantity: ing.quantity ?? null,
          unit: ing.unit ?? null,
          checked: false,
        })

      if (insertError) {
        return NextResponse.json({ error: 'Failed to add grocery item', code: 'DB_ERROR' }, { status: 500 })
      }
      added++
    }
  }

  return NextResponse.json({ data: { added, merged } satisfies GroceryAddResponse })
}
