import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Not authenticated');

    // Get user from token
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Invalid auth');

    const { queryText, nutritionixId } = await req.json();
    if (!queryText) throw new Error('Missing queryText');

    // Check cache first
    if (nutritionixId) {
      const { data: cached } = await supabase
        .from('foods')
        .select('*')
        .eq('user_id', user.id)
        .eq('nutritionix_id', nutritionixId)
        .maybeSingle();
      if (cached) {
        return new Response(JSON.stringify({ food: cached, cached: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    const appId = Deno.env.get('NUTRITIONIX_APP_ID');
    const apiKey = Deno.env.get('NUTRITIONIX_API_KEY');
    if (!appId || !apiKey) throw new Error('Nutritionix credentials not configured');

    const res = await fetch('https://trackapi.nutritionix.com/v2/natural/nutrients', {
      method: 'POST',
      headers: {
        'x-app-id': appId,
        'x-app-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: queryText }),
    });

    if (!res.ok) throw new Error('Nutritionix nutrients lookup failed');
    const data = await res.json();
    const item = data.foods?.[0];
    if (!item) throw new Error('No food found');

    const nxId = item.nix_item_id || `custom-${(item.brand_name || 'generic')}-${item.food_name}-${item.serving_weight_grams || 0}`.replace(/\s+/g, '-').toLowerCase();
    const servingGrams = item.serving_weight_grams || null;
    const calServing = item.nf_calories || 0;
    const protServing = item.nf_protein || 0;
    const carbServing = item.nf_total_carbohydrate || 0;
    const fatServing = item.nf_total_fat || 0;

    let cal100 = calServing, prot100 = protServing, carb100 = carbServing, fat100 = fatServing;
    if (servingGrams && servingGrams > 0) {
      cal100 = (calServing / servingGrams) * 100;
      prot100 = (protServing / servingGrams) * 100;
      carb100 = (carbServing / servingGrams) * 100;
      fat100 = (fatServing / servingGrams) * 100;
    }

    const { data: food, error: upsertError } = await supabase
      .from('foods')
      .upsert({
        user_id: user.id,
        nutritionix_id: nxId,
        name: item.food_name,
        brand: item.brand_name || null,
        serving_grams: servingGrams,
        calories_per_serving: calServing,
        protein_per_serving: protServing,
        carbs_per_serving: carbServing,
        fat_per_serving: fatServing,
        calories_per_100g: cal100,
        protein_per_100g: prot100,
        carbs_per_100g: carb100,
        fat_per_100g: fat100,
        source: 'nutritionix',
      }, { onConflict: 'user_id,nutritionix_id' })
      .select()
      .single();

    if (upsertError) throw upsertError;

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
