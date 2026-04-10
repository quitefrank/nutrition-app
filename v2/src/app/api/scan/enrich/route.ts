import 'server-only'
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { getApiKeys } from "@/lib/api-keys";
import { getRestaurantPhotos } from "@/lib/placesPhotos";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

const GEMINI_MODEL = "gemini-2.5-flash";

// ─── Unit conversion table (to grams) ─────────────────────
const GRAM_CONVERSIONS: Record<string, number> = {
  g: 1, gram: 1, grams: 1,
  kg: 1000,
  oz: 28.3495,
  lb: 453.592,
  cup: 240, cups: 240,
  tbsp: 15, tablespoon: 15, tablespoons: 15,
  tsp: 5, teaspoon: 5, teaspoons: 5,
  ml: 1, l: 1000,
};

/** Returns the gram-based scale factor (portionGrams / 100) for USDA per-100g values,
 *  or null when no usable quantity can be determined. */
function resolveScale(quantity: string | null, unit: string | null, usdaServingSize?: number | null, usdaServingSizeUnit?: string | null): number | null {
  const qNum = quantity ? parseFloat(quantity) : NaN;
  const validQty = Number.isFinite(qNum) && qNum > 0;
  const unitLower = unit?.toLowerCase().trim() ?? "";

  // Tier 1: gram-convertible units (e.g. "150 g", "2 tbsp", "1 cup")
  if (unitLower in GRAM_CONVERSIONS && validQty) {
    return (qNum * GRAM_CONVERSIONS[unitLower]) / 100;
  }

  // Tier 2: count units with a known USDA serving size in grams (e.g. "1 egg")
  if (validQty && usdaServingSize && usdaServingSize > 0) {
    const servingUnitLower = usdaServingSizeUnit?.toLowerCase().trim() ?? "";
    if (["g", "gram", "grams"].includes(servingUnitLower)) {
      return (qNum * usdaServingSize) / 100;
    }
  }

  // Tier 3: no quantity from Gemini — use USDA's own serving size as a single-serving default
  if (usdaServingSize && usdaServingSize > 0) {
    const servingUnitLower = usdaServingSizeUnit?.toLowerCase().trim() ?? "";
    if (["g", "gram", "grams"].includes(servingUnitLower)) {
      return usdaServingSize / 100;
    }
  }

  // No usable quantity — caller should omit macros rather than use 100g
  return null;
}

// ─── USDA macro lookup ─────────────────────────────────────

interface UsdaMacros {
  calories_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
}

async function lookupUsdaMacros(
  ingredientName: string,
  quantity: string | null,
  unit: string | null,
  usdaKey: string
): Promise<UsdaMacros> {
  const nullResult: UsdaMacros = { calories_kcal: null, protein_g: null, fat_g: null, carbs_g: null };
  if (!ingredientName?.trim()) return nullResult;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(ingredientName)}&pageSize=1&dataType=Foundation,SR%20Legacy`,
      { headers: { "X-Api-Key": usdaKey }, signal: controller.signal }
    );
    if (!res.ok) return nullResult;

    const data = await res.json();
    const food = data?.foods?.[0];
    if (!food) return nullResult;

    const nutrients: Array<{ nutrientId: number; value: number }> = Array.isArray(food.foodNutrients)
      ? food.foodNutrients
      : [];

    const find = (id: number): number | null => {
      const n = nutrients.find((n) => n.nutrientId === id);
      return typeof n?.value === "number" ? n.value : null;
    };

    // FDC values are per 100g; scale to actual portion
    const per100 = {
      cal: find(1008),  // Energy kcal
      pro: find(1003),  // Protein g
      fat: find(1004),  // Total lipid g
      carb: find(1005), // Carbohydrate g
    };

    const scale = resolveScale(quantity, unit, food.servingSize ?? null, food.servingSizeUnit ?? null);
    // If no usable quantity could be determined, omit macros rather than return inflated 100g values
    if (scale === null) return nullResult;

    const round = (v: number | null) => v !== null ? Math.round(v * scale * 10) / 10 : null;

    return {
      calories_kcal: round(per100.cal),
      protein_g: round(per100.pro),
      fat_g: round(per100.fat),
      carbs_g: round(per100.carb),
    };
  } catch (err) {
    console.warn("[enrich/usda] lookup failed:", ingredientName, err instanceof Error ? err.message : err);
    return nullResult;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Gemini ingredient inference ──────────────────────────

interface InferredIngredient {
  name: string;
  quantity: string | null;
  unit: string | null;
}

const INFER_PROMPT = (dishName: string, description?: string) =>
  `You are a culinary expert and nutritionist. List the ingredients for a single restaurant serving of: "${dishName}".
${description ? `\nThe menu describes it as: "${description}"\nUse this description to identify the exact ingredients — do not substitute or add ingredients not implied by the description.\n` : ""}
Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "servings": 1,
  "ingredients": [
    { "name": "string", "quantity": "string", "unit": "g" }
  ]
}

Rules:
- servings: always 1 (a single restaurant plate)
- List only the ingredients present in this dish (5–12 max)
- quantity: ALWAYS provide a realistic gram weight for a single serving — never null or zero
  - Base your estimate on how the ingredient functions in the dish:
    - Primary protein (chicken, beef, fish): typically 150–200 g
    - Grains/starches (rice, pasta, quinoa): typically 80–150 g cooked
    - Leafy greens (lettuce, spinach, mixed greens): typically 60–90 g
    - Sauces and dressings: typically 30–50 g (restaurant pour)
    - Cheeses: typically 20–40 g
    - Garnishes, herbs, wedges (lemon, lime, parsley): typically 5–15 g
    - Nuts/seeds: typically 10–20 g
  - Scale proportionately so the total dish weight is plausible (400–800 g for most mains)
- unit: always "g" — convert everything to grams
- If a menu description is provided, use ONLY those ingredients — do not invent extras
- If the dish name is not a recognisable food, return { "servings": 1, "ingredients": [] }
- Return valid JSON only`;

async function inferIngredients(dishName: string, geminiKey: string, description?: string): Promise<{ servings: number; ingredients: InferredIngredient[] }> {
  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(INFER_PROMPT(dishName, description));
    const text = result.response.text();
    const clean = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const parsed = JSON.parse(clean) as { servings?: unknown; ingredients: unknown[] };
    const servings = typeof parsed?.servings === "number" && parsed.servings >= 1
      ? Math.round(parsed.servings)
      : 4;
    if (!Array.isArray(parsed?.ingredients)) return { servings, ingredients: [] };
    const ingredients = parsed.ingredients
      .filter((i): i is Record<string, unknown> => typeof i === "object" && i !== null)
      .map((i) => ({
        name: typeof i.name === "string" && i.name.trim() ? i.name.trim() : null,
        quantity: typeof i.quantity === "string" ? i.quantity : null,
        unit: typeof i.unit === "string" ? i.unit : null,
      }))
      .filter((i): i is InferredIngredient => i.name !== null);
    return { servings, ingredients };
  } catch (err) {
    console.warn("[enrich/gemini] inference failed for:", dishName, err instanceof Error ? err.message : err);
    return { servings: 4, ingredients: [] };
  }
}

// ─── Google Custom Search fallback ────────────────────────

async function getDishPhoto(dishName: string, cseKey: string, cseCx: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const params = new URLSearchParams({
      key: cseKey, cx: cseCx,
      q: `${dishName} food dish recipe`,
      searchType: "image", num: "1", safe: "active", imgType: "photo", imgSize: "medium",
    });
    const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = await res.json() as { items?: Array<{ link?: string }> };
    const link = data?.items?.[0]?.link;
    // SEC-SEC-1.00: only accept https URIs
    return typeof link === "string" && link.startsWith("https://") ? link : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Request / Response schemas ────────────────────────────

const RequestDishSchema = z.object({
  id: z.string().optional().catch(undefined),
  name: z.string().catch(""),
  description: z.string().optional().catch(undefined),
});

const RequestSchema = z.object({
  dishes: z.array(RequestDishSchema).catch([]),
  restaurantName: z.string().nullable().optional().catch(null),
  // Optional map of Gemini dish ID → Supabase recipe UUID.
  // When provided, enriched ingredient macros are written back to Supabase
  // after enrichment completes (fire-and-forget).
  dishToRecipeMap: z.record(z.string(), z.string().uuid()).optional().catch(undefined),
});

// ─── Handler ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { gemini: geminiKey, usda: usdaKey, places: placesKey, cseKey, cseCx } = getApiKeys();

  if (!geminiKey) {
    return NextResponse.json(
      { error: "Enrichment service not configured", code: "ENRICH_SERVICE_UNAVAILABLE" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body", code: "INVALID_REQUEST" }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    console.error("[enrich] request schema failed:", parsed.error.issues);
    return NextResponse.json(
      { error: "Invalid request", code: "INVALID_REQUEST" },
      { status: 400 }
    );
  }

  // Drop dishes with empty names (defensive)
  const dishes = parsed.data.dishes.filter((d) => d.name.trim().length > 0);
  if (dishes.length === 0) {
    // Return empty success rather than an error — enrichment is optional
    return NextResponse.json({ data: { dishes: [] } });
  }
  const { restaurantName, dishToRecipeMap } = parsed.data;

  // Resolve restaurant photos once for all dishes
  let restaurantPhotos: string[] = [];
  if (placesKey && restaurantName) {
    restaurantPhotos = await getRestaurantPhotos({ name: restaurantName }, placesKey);
  }

  // Enrich each dish in parallel
  const enrichedDishes = await Promise.all(
    dishes.map(async (dish, i) => {
      // Step A: Gemini inference — get full ingredient list
      const { servings, ingredients: inferredIngredients } = await inferIngredients(dish.name, geminiKey, dish.description);

      // Step B: USDA macro lookup for each ingredient (parallel)
      let enrichedIngredients: Array<InferredIngredient & UsdaMacros> = [];
      if (usdaKey && inferredIngredients.length > 0) {
        const macroResults = await Promise.allSettled(
          inferredIngredients.map((ing) => lookupUsdaMacros(ing.name, ing.quantity, ing.unit, usdaKey))
        );
        enrichedIngredients = inferredIngredients.map((ing, j) => ({
          ...ing,
          ...(macroResults[j].status === "fulfilled" ? macroResults[j].value : { calories_kcal: null, protein_g: null, fat_g: null, carbs_g: null }),
        }));
      } else {
        enrichedIngredients = inferredIngredients.map((ing) => ({
          ...ing,
          calories_kcal: null,
          protein_g: null,
          fat_g: null,
          carbs_g: null,
        }));
      }

      // Step C: Photo resolution
      let photoUrl: string | null = null;
      if (restaurantPhotos.length > 0) {
        photoUrl = restaurantPhotos[i % restaurantPhotos.length];
      } else if (cseKey && cseCx) {
        photoUrl = await getDishPhoto(dish.name, cseKey, cseCx);
      }

      // Compute totals
      const sumOrNull = (vals: (number | null)[]) => {
        const nums = vals.filter((v): v is number => v !== null);
        return nums.length > 0 ? Math.round(nums.reduce((a, b) => a + b, 0) * 10) / 10 : null;
      };

      return {
        id: dish.id,
        name: dish.name,
        servings,
        ingredients: enrichedIngredients,
        photoUrl,
        totalCalories: sumOrNull(enrichedIngredients.map((i) => i.calories_kcal)),
        totalProtein: sumOrNull(enrichedIngredients.map((i) => i.protein_g)),
        totalFat: sumOrNull(enrichedIngredients.map((i) => i.fat_g)),
        totalCarbs: sumOrNull(enrichedIngredients.map((i) => i.carbs_g)),
      };
    })
  );

  // ─── Persist enriched macros back to Supabase (fire-and-forget) ──────────
  // If the caller provided a dishToRecipeMap, write the USDA-enriched macro
  // values back to each recipe_ingredients row. This runs after the response
  // is ready so it never delays the enrichment result.
  if (dishToRecipeMap && Object.keys(dishToRecipeMap).length > 0) {
    void (async () => {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
        if (!url || !key) return;

        const sb = createClient<Database>(url, key);

        for (const enrichedDish of enrichedDishes) {
          const recipeId = enrichedDish.id ? dishToRecipeMap[enrichedDish.id] : undefined;
          if (!recipeId) continue;

          // Update each ingredient row that has USDA data
          for (const ing of enrichedDish.ingredients as Array<{
            name: string;
            calories_kcal: number | null;
            protein_g: number | null;
            fat_g: number | null;
            carbs_g: number | null;
          }>) {
            if (
              ing.calories_kcal === null &&
              ing.protein_g === null &&
              ing.fat_g === null &&
              ing.carbs_g === null
            ) {
              continue; // Skip ingredients with no USDA data
            }

            const { error } = await sb
              .from("recipe_ingredients")
              .update({
                calories_per_serving: ing.calories_kcal,
                protein_g: ing.protein_g,
                fat_g: ing.fat_g,
                carbs_g: ing.carbs_g,
              })
              .eq("recipe_id", recipeId)
              .eq("name", ing.name);

            if (error) {
              console.warn("[enrich] ingredient update failed:", ing.name, error.message);
              // Continue — best-effort, don't bail out of the loop
            }
          }
        }
      } catch (err) {
        console.warn("[enrich] Supabase write-back error (non-blocking):", err instanceof Error ? err.message : err);
      }
    })();
  }

  return NextResponse.json({ data: { dishes: enrichedDishes } });
}
