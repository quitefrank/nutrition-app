import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { fdcId } = await req.json();
    if (!fdcId) throw new Error('Missing fdcId');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const fdcIdStr = String(fdcId);

    // Dedupe check
    const { data: cached } = await supabase
      .from('foods')
      .select('*')
      .eq('fdc_id', fdcIdStr)
      .maybeSingle();
    if (cached) {
      return new Response(JSON.stringify({ food: cached, cached: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('FDC_API_KEY');
    if (!apiKey) throw new Error('FDC_API_KEY not configured');

    const res = await fetch(`https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${apiKey}`);
    if (!res.ok) throw new Error('FDC food detail fetch failed');
    const data = await res.json();

    let calories = 0, protein = 0, fat = 0, carbs = 0;
    for (const fn of data.foodNutrients ?? []) {
      const num = fn.nutrient?.number ?? fn.number;
      const amount = fn.amount ?? 0;
      if (num === "208" || num === 208) {
        const unitName = (fn.nutrient?.unitName ?? fn.unitName ?? '').toLowerCase();
        calories = unitName === 'kj' ? amount / 4.184 : amount;
      } else if (num === "203" || num === 203) protein = amount;
      else if (num === "204" || num === 204) fat = amount;
      else if (num === "205" || num === 205) carbs = amount;
    }

    // Check for serving size from portions
    let servingGrams: number | null = null;
    if (data.foodPortions && data.foodPortions.length > 0) {
      const portion = data.foodPortions[0];
      if (portion.gramWeight) servingGrams = portion.gramWeight;
    }

    let calServing = null, protServing = null, carbServing = null, fatServing = null;
    if (servingGrams && servingGrams > 0) {
      calServing = (calories / 100) * servingGrams;
      protServing = (protein / 100) * servingGrams;
      carbServing = (carbs / 100) * servingGrams;
      fatServing = (fat / 100) * servingGrams;
    }

    const { data: food, error: insertError } = await supabase
      .from('foods')
      .upsert({
        fdc_id: fdcIdStr,
        name: data.description ?? 'Unknown',
        brand: data.brandOwner ?? data.brandName ?? null,
        serving_grams: servingGrams,
        calories_per_100g: calories,
        protein_per_100g: protein,
        carbs_per_100g: carbs,
        fat_per_100g: fat,
        calories_per_serving: calServing,
        protein_per_serving: protServing,
        carbs_per_serving: carbServing,
        fat_per_serving: fatServing,
        source: 'usda_fdc',
      }, { onConflict: 'fdc_id' })
      .select()
      .single();

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ food, cached: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
