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

    const { query } = await req.json();
    if (!query) throw new Error('Missing query');

    const appId = Deno.env.get('NUTRITIONIX_APP_ID');
    const apiKey = Deno.env.get('NUTRITIONIX_API_KEY');
    if (!appId || !apiKey) throw new Error('Nutritionix credentials not configured');

    const res = await fetch(`https://trackapi.nutritionix.com/v2/search/instant?query=${encodeURIComponent(query)}`, {
      headers: {
        'x-app-id': appId,
        'x-app-key': apiKey,
      },
    });

    if (!res.ok) throw new Error('Nutritionix search failed');
    const data = await res.json();

    const results = [
      ...(data.common ?? []).map((item: any) => ({
        displayName: item.food_name,
        nutritionixId: null,
        brandName: null,
        isBranded: false,
      })),
      ...(data.branded ?? []).map((item: any) => ({
        displayName: item.food_name,
        nutritionixId: item.nix_item_id,
        brandName: item.brand_name,
        isBranded: true,
      })),
    ].slice(0, 20);

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
