import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { query } = await req.json();
    if (!query) throw new Error('Missing query');

    const apiKey = Deno.env.get('FDC_API_KEY');
    if (!apiKey) throw new Error('FDC_API_KEY not configured');

    const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        pageSize: 25,
        pageNumber: 1,
        dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)", "Branded"],
      }),
    });

    if (!res.ok) throw new Error('FDC search failed');
    const data = await res.json();

    const results = (data.foods ?? []).map((item: any) => ({
      fdcId: item.fdcId,
      description: item.description,
      brandOwner: item.brandOwner ?? null,
      dataType: item.dataType,
    }));

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
