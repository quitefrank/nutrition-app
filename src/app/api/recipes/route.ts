import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { RecipeSaveRequest, RecipeSaveResponse } from '@/types/api'
import type { Recipe } from '@/types/domain'

export async function POST(req: NextRequest) {
  let body: RecipeSaveRequest
  try {
    body = await req.json() as RecipeSaveRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'VALIDATION_ERROR' }, { status: 422 })
  }

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required', code: 'VALIDATION_ERROR' }, { status: 422 })
  }
  if (!Array.isArray(body.ingredients)) {
    return NextResponse.json({ error: 'ingredients must be an array', code: 'VALIDATION_ERROR' }, { status: 422 })
  }

  // Resolve restaurant — non-fatal if lookup/creation fails
  let resolvedRestaurantId: string | null = null

  if (body.restaurantGooglePlacesId || body.restaurantName) {
    let existingId: string | null = null
    let skipRestaurant = false

    if (body.restaurantGooglePlacesId) {
      const { data, error: placesLookupError } = await supabase
        .from('restaurants')
        .select('id')
        .eq('google_places_id', body.restaurantGooglePlacesId)
        .maybeSingle()
      if (placesLookupError) {
        // Lookup failed — skip restaurant association to avoid inserting a junk row
        console.warn('Failed to look up restaurant by google_places_id:', placesLookupError.message)
        skipRestaurant = true
      } else {
        existingId = data?.id ?? null
      }
    }

    if (!skipRestaurant && !existingId && body.restaurantName) {
      const { data } = await supabase
        .from('restaurants')
        .select('id')
        .eq('name', body.restaurantName)
        .maybeSingle()
      existingId = data?.id ?? null
    }

    if (!skipRestaurant) {
      if (existingId) {
        await supabase.from('restaurants').update({ updated_at: new Date().toISOString() }).eq('id', existingId)
        resolvedRestaurantId = existingId
      } else {
        const { data: newRestaurant, error: restaurantError } = await supabase
          .from('restaurants')
          .insert({
            name: body.restaurantName ?? 'Unknown Restaurant',
            google_places_id: body.restaurantGooglePlacesId ?? null,
            atmospheric_palette_json: null,
          })
          .select('id')
          .single()

        if (restaurantError) {
          // Non-fatal: continue save without restaurant association
          console.error('Failed to create restaurant:', restaurantError.message)
        } else {
          resolvedRestaurantId = newRestaurant.id
        }
      }
    }
  }

  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .insert({
      name: body.name.trim(),
      dish_image_url: body.dishImageUrl ?? null,
      confidence_metadata_json: body.confidenceMetadata ?? null,
      serving_size: body.servingSize ?? 1,
      restaurant_id: resolvedRestaurantId,
    })
    .select('id, name, restaurant_id, serving_size, created_at')
    .single()

  if (recipeError || !recipe) {
    return NextResponse.json({ error: 'Failed to save recipe', code: 'DB_ERROR' }, { status: 500 })
  }

  // Insert ingredients — keyed by name (never by index — see Epic 2 Retro Action 3)
  if (body.ingredients.length > 0) {
    const ingredientRows = body.ingredients.map(ing => ({
      recipe_id: recipe.id,
      name: ing.name,
      quantity: ing.quantity ?? null,
      unit: ing.unit ?? null,
      confidence_level: ing.confidenceLevel,
      calories_kcal: null as null,  // Story 3.6 will populate at save time
      protein_g: null as null,
      fat_g: null as null,
      carbs_g: null as null,
    }))

    const { error: ingError } = await supabase
      .from('recipe_ingredients')
      .insert(ingredientRows)

    if (ingError) {
      // Roll back the recipe row — maintain atomicity
      await supabase.from('recipes').delete().eq('id', recipe.id)
      return NextResponse.json({ error: 'Failed to save recipe ingredients', code: 'DB_ERROR' }, { status: 500 })
    }
  }

  const response: RecipeSaveResponse = {
    id: recipe.id,
    name: recipe.name,
    createdAt: recipe.created_at,
    servingSize: recipe.serving_size,
    restaurantId: recipe.restaurant_id,
  }

  return NextResponse.json({ data: response })
}

export async function GET(req: NextRequest) {
  const restaurantId = req.nextUrl.searchParams.get('restaurantId')

  let query = supabase
    .from('recipes')
    .select(`
      id,
      name,
      restaurant_id,
      dish_image_url,
      confidence_metadata_json,
      serving_size,
      created_at,
      restaurants ( id, name, google_places_id, atmospheric_palette_json, updated_at )
    `)
    .order('created_at', { ascending: false })

  if (restaurantId) {
    query = query.eq('restaurant_id', restaurantId)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch recipes', code: 'DB_ERROR' }, { status: 500 })
  }

  const recipes: Recipe[] = (data ?? []).map(row => ({
    id: row.id,
    name: row.name,
    restaurantId: row.restaurant_id,
    dishImageUrl: row.dish_image_url,
    confidenceMetadataJson: row.confidence_metadata_json,
    servingSize: row.serving_size,
    createdAt: row.created_at,
    restaurant: row.restaurants
      ? {
          id: row.restaurants.id,
          name: row.restaurants.name,
          googlePlacesId: row.restaurants.google_places_id,
          atmosphericPaletteJson: row.restaurants.atmospheric_palette_json,
          updatedAt: row.restaurants.updated_at,
        }
      : null,
  }))

  return NextResponse.json({ data: recipes })
}
