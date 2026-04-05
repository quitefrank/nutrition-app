import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, userContext } = await req.json();
    if (!imageBase64) throw new Error('Missing imageBase64');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    const systemPrompt = `You are a recipe extraction assistant. Analyze the provided image and extract all recipe information.

Rules:
- Extract the recipe title if visible
- Extract the number of servings if visible
- List every ingredient line you can see
- For each ingredient, normalize the name to a plain English food term (e.g. "all-purpose flour" → "flour")
- Prefer metric units (g, ml) when possible
- NEVER invent quantities — if a quantity is unclear or not visible, set it to null
- Set confidence between 0 and 1 for each ingredient based on how clearly you can read it
- If a unit is ambiguous (like "1 onion"), set unit to null and quantity to the number`;

    const userContent: any[] = [
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
      { type: "text", text: userContext || "Extract the recipe from this image." }
    ];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
        ],
        tools: [{
          type: "function",
          function: {
            name: "extract_recipe",
            description: "Extract structured recipe data from the image",
            parameters: {
              type: "object",
              properties: {
                title: { type: "string", nullable: true },
                servings: { type: "number", nullable: true },
                ingredients: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      rawLine: { type: "string" },
                      normalizedName: { type: "string" },
                      quantity: { type: "number", nullable: true },
                      unit: { type: "string", nullable: true },
                      confidence: { type: "number" }
                    },
                    required: ["rawLine", "normalizedName", "confidence"]
                  }
                }
              },
              required: ["ingredients"]
            }
          }
        }],
        tool_choice: { type: "function", function: { name: "extract_recipe" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const text = await response.text();
      console.error("AI gateway error:", response.status, text);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error('No tool call returned from AI');
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error("ai-decompose error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
