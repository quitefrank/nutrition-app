import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { Recipe } from '@/types/domain'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_CONFIDENCE = ['high', 'medium', 'low'] as const

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

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

  // recipe_ingredients are deleted automatically via ON DELETE CASCADE
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
      restaurants ( id, name, google_places_id, atmospheric_palette_json, updated_at ),
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

  const restaurant = data.restaurants as { id: string; name: string; google_places_id: string | null; atmospheric_palette_json: Record<string, unknown> | null; updated_at: string } | null

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

export async function PUT() {
  return NextResponse.json({ error: 'Not implemented', code: 'NOT_IMPLEMENTED' }, { status: 501 })
}
