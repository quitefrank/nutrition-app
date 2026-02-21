import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  // Use two rows for efficiency
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1]
        ? prev[j - 1]
        : 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

function scoreResult(query: string, description: string, dataType: string): number {
  const nq = normalize(query);
  const nd = normalize(description);
  let score = 0;

  if (nd === nq) score += 100;
  else if (nd.startsWith(nq)) score += 50;

  const tokens = nq.split(' ').filter(Boolean);
  const matched = tokens.filter(t => nd.includes(t)).length;
  score += matched * 10;

  // Levenshtein on prefix
  const prefix = nd.substring(0, Math.min(nq.length + 5, nd.length));
  const dist = levenshtein(nq, prefix);
  score -= dist * 0.5;

  // Prefer non-branded types
  if (dataType === 'Foundation' || dataType === 'SR Legacy') score += 5;

  return score;
}

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

    const results = (data.foods ?? [])
      .map((item: any) => ({
        fdcId: item.fdcId,
        description: item.description,
        brandOwner: item.brandOwner ?? null,
        dataType: item.dataType,
        _score: scoreResult(query, item.description, item.dataType),
      }))
      .sort((a: any, b: any) => b._score - a._score)
      .map(({ _score, ...rest }: any) => rest);

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
