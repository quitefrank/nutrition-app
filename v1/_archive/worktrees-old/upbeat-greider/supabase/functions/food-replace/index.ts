import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { oldFoodId, newFoodId } = await req.json();
    if (!oldFoodId || !newFoodId) throw new Error('Missing oldFoodId or newFoodId');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch new food macros
    const { data: newFood, error: foodErr } = await supabase
      .from('foods')
      .select('calories_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g')
      .eq('id', newFoodId)
      .single();
    if (foodErr || !newFood) throw new Error('New food not found');

    const cal100 = Number(newFood.calories_per_100g);
    const pro100 = Number(newFood.protein_per_100g);
    const carb100 = Number(newFood.carbs_per_100g);
    const fat100 = Number(newFood.fat_per_100g);

    // Update recipe_items
    const { data: recipeItems } = await supabase
      .from('recipe_items')
      .select('id, grams_equivalent')
      .eq('food_id', oldFoodId);

    let recipeCount = 0;
    if (recipeItems && recipeItems.length > 0) {
      for (const ri of recipeItems) {
        const g = Number(ri.grams_equivalent);
        await supabase.from('recipe_items').update({
          food_id: newFoodId,
          calories: (g * cal100) / 100,
          protein: (g * pro100) / 100,
          carbs: (g * carb100) / 100,
          fat: (g * fat100) / 100,
        }).eq('id', ri.id);
      }
      recipeCount = recipeItems.length;
    }

    // Update daily_log_items
    const { data: logItems } = await supabase
      .from('daily_log_items')
      .select('id, grams_equivalent')
      .eq('food_id', oldFoodId);

    let logCount = 0;
    if (logItems && logItems.length > 0) {
      for (const li of logItems) {
        const g = Number(li.grams_equivalent ?? 0);
        await supabase.from('daily_log_items').update({
          food_id: newFoodId,
          calories: g > 0 ? (g * cal100) / 100 : 0,
          protein: g > 0 ? (g * pro100) / 100 : 0,
          carbs: g > 0 ? (g * carb100) / 100 : 0,
          fat: g > 0 ? (g * fat100) / 100 : 0,
        }).eq('id', li.id);
      }
      logCount = logItems.length;
    }

    // Update groceries
    const { data: groceryRows } = await supabase
      .from('groceries')
      .select('id')
      .eq('food_id', oldFoodId);

    let groceryCount = 0;
    if (groceryRows && groceryRows.length > 0) {
      await supabase.from('groceries').update({ food_id: newFoodId }).eq('food_id', oldFoodId);
      groceryCount = groceryRows.length;
    }

    return new Response(JSON.stringify({
      recipeItems: recipeCount,
      logItems: logCount,
      groceryItems: groceryCount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
