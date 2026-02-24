import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function convertToGrams(quantity: number, unit: string): number {
  switch (unit.toLowerCase()) {
    case 'g': return quantity;
    case 'ml': return quantity;
    case 'tbsp': return quantity * 15;
    case 'tsp': return quantity * 5;
    case 'cup': return quantity * 240;
    case 'oz': return quantity * 28.3495;
    case 'lb': return quantity * 453.592;
    default: throw new Error(`Unsupported unit: ${unit}`);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { title, servings, ingredients } = await req.json();
    if (!title || !servings || !ingredients?.length) {
      throw new Error('Missing title, servings, or ingredients');
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Look up each food by fdc_id
    const recipeItems: any[] = [];
    for (const ing of ingredients) {
      const { data: food, error } = await supabase
        .from('foods')
        .select('id, calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g')
        .eq('fdc_id', ing.fdcId)
        .single();

      if (error || !food) {
        throw new Error(`Food not found for fdcId: ${ing.fdcId}`);
      }

      const grams = convertToGrams(ing.quantity, ing.unit);
      recipeItems.push({
        food_id: food.id,
        quantity: ing.quantity,
        unit: ing.unit,
        grams_equivalent: grams,
        calories: (grams * food.calories_per_100g) / 100,
        protein: (grams * food.protein_per_100g) / 100,
        carbs: (grams * food.carbs_per_100g) / 100,
        fat: (grams * food.fat_per_100g) / 100,
      });
    }

    // Create recipe
    const { data: recipe, error: recipeError } = await supabase
      .from('recipes')
      .insert({ name: title, servings })
      .select('id')
      .single();

    if (recipeError || !recipe) throw new Error('Failed to create recipe');

    // Insert recipe items
    const itemsToInsert = recipeItems.map(item => ({
      ...item,
      recipe_id: recipe.id,
    }));

    const { error: itemsError } = await supabase
      .from('recipe_items')
      .insert(itemsToInsert);

    if (itemsError) throw new Error('Failed to insert recipe items');

    return new Response(JSON.stringify({ recipeId: recipe.id, itemCount: itemsToInsert.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error("ai-create-recipe error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
