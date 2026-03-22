import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { GroceryRecipeSummary } from '@/types/api'

export async function GET() {
  // Step 1: fetch all grocery items to count by recipe_id.
  // Limit to 5,000 rows — well above any realistic single-user grocery list,
  // and safely above Supabase/PostgREST's default 1,000-row truncation.
  const { data: items, error: itemsError } = await supabase
    .from('grocery_items')
    .select('recipe_id')
    .order('created_at', { ascending: true })
    .limit(5000)

  if (itemsError) {
    return NextResponse.json({ error: 'Failed to fetch grocery items', code: 'DB_ERROR' }, { status: 500 })
  }

  if (!items || items.length === 0) {
    return NextResponse.json({ data: [] })
  }

  // Step 2: group by recipe_id to get item counts
  const countMap = new Map<string | null, number>()
  for (const item of items) {
    const key = item.recipe_id ?? null
    countMap.set(key, (countMap.get(key) ?? 0) + 1)
  }

  // Step 3: fetch recipe metadata (name, image, restaurant) for non-null recipe_ids
  const recipeIds = [...countMap.keys()].filter(Boolean) as string[]

  type RecipeRow = { id: string; name: string; dish_image_url: string | null; restaurants: { name: string } | null }
  const recipeMap = new Map<string, RecipeRow>()

  if (recipeIds.length > 0) {
    const { data: recipes, error: recipeError } = await supabase
      .from('recipes')
      .select('id, name, dish_image_url, restaurants ( name )')
      .in('id', recipeIds)

    if (recipeError) {
      return NextResponse.json({ error: 'Failed to fetch recipe data', code: 'DB_ERROR' }, { status: 500 })
    }

    for (const recipe of recipes ?? []) {
      recipeMap.set(recipe.id, recipe as RecipeRow)
    }
  }

  // Step 4: build GroceryRecipeSummary[] — named recipes first, null group last
  const summaries: GroceryRecipeSummary[] = []

  for (const [recipeId, itemCount] of countMap) {
    if (recipeId !== null) {
      const recipe = recipeMap.get(recipeId)
      summaries.push({
        recipeId,
        recipeName: recipe?.name ?? 'Unknown recipe',
        dishImageUrl: recipe?.dish_image_url ?? null,
        restaurantName: recipe?.restaurants?.name ?? null,
        itemCount,
      })
    }
  }

  // Append "Other items" group last if any items have recipe_id = null
  const nullCount = countMap.get(null)
  if (nullCount !== undefined) {
    summaries.push({
      recipeId: null,
      recipeName: 'Other items',
      dishImageUrl: null,
      restaurantName: null,
      itemCount: nullCount,
    })
  }

  return NextResponse.json({ data: summaries })
}
