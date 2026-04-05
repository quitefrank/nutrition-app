import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64 } = await req.json();
    if (!imageBase64) throw new Error("Missing imageBase64");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a food/recipe scanner. Analyze the image and call the scan_food_or_recipe function.

Rules:
- Classify as "recipe" if the image shows an ingredient list, cooking steps, or multiple ingredient lines. Otherwise classify as "food".
- For each item, always try to return quantity and unit (e.g. 2, "cup").
- Only use these units: g, ml, tbsp, tsp, cup, oz, lb. If the original uses other units (like "medium", "large", "piece", "clove", "slice", "whole"), do NOT return that as the unit. Instead set unit to null and provide grams_estimate.
- If quantity or unit cannot be determined, you MUST provide grams_estimate (your best estimate of the weight in grams).
- For piece-based items (1 egg, 2 cloves garlic, 1 slice bread), always provide grams_estimate even if you also provide quantity.
- Never ask questions. Never output text. Only call the function.
- For a single food item (plate, meal, snack), return one item representing the whole portion with a grams_estimate.`;

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
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
              { type: "text", text: "Scan this image." },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "scan_food_or_recipe",
              description: "Return structured food or recipe data from the image",
              parameters: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["food", "recipe"] },
                  title: { type: "string" },
                  servings: { type: "number" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        quantity: { type: "number" },
                        unit: { type: "string" },
                        grams_estimate: { type: "number" },
                      },
                      required: ["name"],
                    },
                  },
                },
                required: ["type", "items"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "scan_food_or_recipe" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const txt = await response.text();
      console.error("AI gateway error:", response.status, txt);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI did not return a tool call");

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-scan error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
