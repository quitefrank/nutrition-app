import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getApiKeys } from '@/lib/api-keys'
import type { Recipe } from '@/types/domain'
import type { RecipeUpdateRequest } from '@/types/api'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_CONFIDENCE = ['high', 'medium', 'low'] as const

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid recipe id', code: 'BAD_REQUEST' }, { status: 400 })
  }

  // Step 1: delete grocery_items for this recipe (ON DELETE SET NULL won't remove them)
  // Best-effort — continue regardless of error
  const { error: groceryError } = await supabase.from('grocery_items').delete().eq('recipe_id', id)
  if (groceryError) {
    console.warn('Failed to delete grocery_items for recipe:', id, groceryError.message)
  }

  // Step 2: delete recipe (cascades to recipe_ingredients via ON DELETE CASCADE)
  const { error, count } = await supabase
    .from('recipes')
    .delete({ count: 'exact' })
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete recipe', code: 'DB_ERROR' }, { status: 500 })
  }
  if (count === 0 || count === null) {
    return NextResponse.json({ error: 'Recipe not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  return NextResponse.json({ data: { deleted: true } })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid recipe id', code: 'BAD_REQUEST' }, { status: 400 })
  }

  const { places: placesKey } = getApiKeys()

  const { data, error } = await supabase
    .from('recipes')
    .select(`
      id,
      name,
      restaurant_id,
      dish_image_url,
      confidence_metadata_json,
      serving_size,
      created_at,
      restaurants ( id, name, google_places_id, atmospheric_palette_json, restaurant_image_url, updated_at ),
      recipe_ingredients ( id, recipe_id, name, quantity, unit, confidence_level, calories_kcal, protein_g, fat_g, carbs_g )
    `)
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Recipe not found', code: 'NOT_FOUND' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Failed to fetch recipe', code: 'DB_ERROR' }, { status: 500 })
  }

  const restaurant = data.restaurants as { id: string; name: string; google_places_id: string | null; atmospheric_palette_json: Record<string, unknown> | null; restaurant_image_url: string | null; updated_at: string } | null

  const recipe: Recipe = {
    id: data.id,
    name: data.name,
    restaurantId: data.restaurant_id,
    dishImageUrl: data.dish_image_url,
    confidenceMetadataJson: data.confidence_metadata_json as Record<string, unknown> | null,
    servingSize: data.serving_size,
    createdAt: data.created_at,
    restaurant: restaurant
      ? {
          id: restaurant.id,
          name: restaurant.name,
          googlePlacesId: restaurant.google_places_id,
          atmosphericPaletteJson: restaurant.atmospheric_palette_json,
          restaurantImageUrl: restaurant.restaurant_image_url
            ? (restaurant.restaurant_image_url.startsWith('places/') && placesKey
                ? `https://places.googleapis.com/v1/${restaurant.restaurant_image_url}/media?maxWidthPx=800&key=${placesKey}`
                : restaurant.restaurant_image_url)
            : null,
          updatedAt: restaurant.updated_at,
        }
      : null,
    ingredients: ((data.recipe_ingredients ?? []) as Array<{
      id: string; recipe_id: string; name: string; quantity: string | null; unit: string | null;
      confidence_level: string; calories_kcal: number | null; protein_g: number | null; fat_g: number | null; carbs_g: number | null;
    }>).map(ing => ({
      id: ing.id,
      recipeId: ing.recipe_id,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      confidenceLevel: (VALID_CONFIDENCE.includes(ing.confidence_level as typeof VALID_CONFIDENCE[number])
        ? ing.confidence_level
        : 'low') as 'high' | 'medium' | 'low',
      caloriesKcal: ing.calories_kcal,
      proteinG: ing.protein_g,
      fatG: ing.fat_g,
      carbsG: ing.carbs_g,
    })),
  }

  return NextResponse.json({ data: recipe })
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!id || !UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid recipe id', code: 'BAD_REQUEST' }, { status: 400 })
  }

  const body = await req.json().catch(() => null) as RecipeUpdateRequest | null
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body', code: 'BAD_REQUEST' }, { status: 400 })
  }

  // Validation
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Recipe name is required', code: 'VALIDATION_ERROR' }, { status: 422 })
  }
  if (!Array.isArray(body.ingredients) || body.ingredients.some(i => !i.name?.trim())) {
    return NextResponse.json({ error: 'All ingredient names are required', code: 'VALIDATION_ERROR' }, { status: 422 })
  }

  // Update recipe row
  const { error: recipeError, count: recipeCount } = await supabase
    .from('recipes')
    .update({ name: body.name.trim(), serving_size: body.servingSize }, { count: 'exact' })
    .eq('id', id)

  if (recipeError) {
    return NextResponse.json({ error: 'Failed to update recipe', code: 'DB_ERROR' }, { status: 500 })
  }
  if (recipeCount === 0) {
    return NextResponse.json({ error: 'Recipe not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  // Update each ingredient row individually (preserves macro columns untouched)
  for (const ing of body.ingredients) {
    const { error: ingError, count: ingCount } = await supabase
      .from('recipe_ingredients')
      .update({
        name: ing.name.trim(),
        quantity: ing.quantity,
        unit: ing.unit,
        confidence_level: ing.confidenceLevel,
      }, { count: 'exact' })
      .eq('id', ing.id)
      .eq('recipe_id', id)   // safety: prevent cross-recipe writes

    if (ingError) {
      return NextResponse.json({ error: 'Failed to update ingredients', code: 'DB_ERROR' }, { status: 500 })
    }
    if (ingCount === 0) {
      return NextResponse.json({ error: `Ingredient ${ing.id} not found on this recipe`, code: 'VALIDATION_ERROR' }, { status: 422 })
    }
  }

  // Re-query full recipe to return updated state (reuse GET query logic)
  const { places: placesKeyForPut } = getApiKeys()
  const { data, error } = await supabase
    .from('recipes')
    .select(`
      id, name, restaurant_id, dish_image_url, confidence_metadata_json, serving_size, created_at,
      restaurants ( id, name, google_places_id, atmospheric_palette_json, restaurant_image_url, updated_at ),
      recipe_ingredients ( id, recipe_id, name, quantity, unit, confidence_level, calories_kcal, protein_g, fat_g, carbs_g )
    `)
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch updated recipe', code: 'DB_ERROR' }, { status: 500 })
  }

  // Map to Recipe domain type — identical mapping as GET handler
  const restaurant = data.restaurants as { id: string; name: string; google_places_id: string | null; atmospheric_palette_json: Record<string, unknown> | null; restaurant_image_url: string | null; updated_at: string } | null

  const recipe: Recipe = {
    id: data.id,
    name: data.name,
    restaurantId: data.restaurant_id,
    dishImageUrl: data.dish_image_url,
    confidenceMetadataJson: data.confidence_metadata_json as Record<string, unknown> | null,
    servingSize: data.serving_size,
    createdAt: data.created_at,
    restaurant: restaurant ? {
      id: restaurant.id, name: restaurant.name,
      googlePlacesId: restaurant.google_places_id,
      atmosphericPaletteJson: restaurant.atmospheric_palette_json,
      restaurantImageUrl: restaurant.restaurant_image_url
        ? (restaurant.restaurant_image_url.startsWith('places/') && placesKeyForPut
            ? `https://places.googleapis.com/v1/${restaurant.restaurant_image_url}/media?maxWidthPx=800&key=${placesKeyForPut}`
            : restaurant.restaurant_image_url)
        : null,
      updatedAt: restaurant.updated_at,
    } : null,
    ingredients: ((data.recipe_ingredients ?? []) as Array<{
      id: string; recipe_id: string; name: string; quantity: string | null; unit: string | null;
      confidence_level: string; calories_kcal: number | null; protein_g: number | null; fat_g: number | null; carbs_g: number | null;
    }>).map(ing => ({
      id: ing.id,
      recipeId: ing.recipe_id,
      name: ing.name,
      quantity: ing.quantity,
      unit: ing.unit,
      confidenceLevel: (VALID_CONFIDENCE.includes(ing.confidence_level as typeof VALID_CONFIDENCE[number])
        ? ing.confidence_level
        : 'low') as 'high' | 'medium' | 'low',
      caloriesKcal: ing.calories_kcal,
      proteinG: ing.protein_g,
      fatG: ing.fat_g,
      carbsG: ing.carbs_g,
    })),
  }

  return NextResponse.json({ data: recipe })
}
