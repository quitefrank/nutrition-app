import 'server-only'
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { getApiKeys } from "@/lib/api-keys";

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

function resolveScale(quantity: string | null, unit: string | null, usdaServingSize?: number | null, usdaServingSizeUnit?: string | null): number {
  const qNum = quantity ? parseFloat(quantity) : NaN;
  const validQty = Number.isFinite(qNum) && qNum > 0;
  const unitLower = unit?.toLowerCase().trim() ?? "";

  // Tier 1: gram-convertible units
  if (unitLower in GRAM_CONVERSIONS && validQty) {
    return (qNum * GRAM_CONVERSIONS[unitLower]) / 100;
  }

  // Tier 2: count units — use USDA serving size if available
  if (validQty && usdaServingSize && usdaServingSize > 0) {
    const servingUnitLower = usdaServingSizeUnit?.toLowerCase().trim() ?? "";
    if (["g", "gram", "grams"].includes(servingUnitLower)) {
      return (qNum * usdaServingSize) / 100;
    }
  }

  // Tier 3: fallback — use per-100g reference value
  return 1;
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

const INFER_PROMPT = (dishName: string) =>
  `You are a culinary expert. List the typical ingredients for the dish: "${dishName}".

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "servings": 4,
  "ingredients": [
    { "name": "string", "quantity": "string or null", "unit": "string or null" }
  ]
}

Rules:
- servings: the number of people the quantities below serve (integer 1–12)
- List 5–12 ingredients for a standard recipe preparation (quantities for all servings combined)
- quantity: numeric string for the full recipe amount (e.g. "400"), or null if uncertain
- unit: unit of measure (e.g. "g", "ml", "tbsp", "clove") or null if count/unknown
- Include spices, aromatics, sauces, and condiments — be specific
- If the dish name is not a recognisable food, return { "servings": 1, "ingredients": [] }
- Return valid JSON only`;

async function inferIngredients(dishName: string, geminiKey: string): Promise<{ servings: number; ingredients: InferredIngredient[] }> {
  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
    const result = await model.generateContent(INFER_PROMPT(dishName));
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

// ─── Google Places photo resolution ───────────────────────

async function getRestaurantPhotos(restaurantName: string, placesKey: string, maxPhotos = 10): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    // Step 1: Text Search → placeId
    const searchRes = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": placesKey,
        "X-Goog-FieldMask": "places.id",
      },
      body: JSON.stringify({ textQuery: restaurantName, pageSize: 1 }),
      signal: controller.signal,
    });
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json() as { places?: Array<{ id?: string }> };
    const placeId = searchData?.places?.[0]?.id;
    if (!placeId) return [];

    // Step 2: Fetch photo references
    const detailsRes = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: { "X-Goog-Api-Key": placesKey, "X-Goog-FieldMask": "photos" },
      signal: controller.signal,
    });
    if (!detailsRes.ok) return [];
    const details = await detailsRes.json() as { photos?: Array<{ name: string }> };
    const photoRefs = (details?.photos ?? []).slice(0, maxPhotos);
    if (photoRefs.length === 0) return [];

    // Step 3: Resolve photo references → CDN URLs in parallel
    const photoUrls = await Promise.all(
      photoRefs.map(async ({ name }) => {
        try {
          const photoRes = await fetch(
            `https://places.googleapis.com/v1/${name}/media?maxWidthPx=800&skipHttpRedirect=true`,
            { headers: { "X-Goog-Api-Key": placesKey }, signal: controller.signal }
          );
          if (!photoRes.ok) return null;
          const photoJson = await photoRes.json() as { photoUri?: string };
          const uri = photoJson?.photoUri;
          // SEC-SEC-1.00: validate scheme before returning
          return typeof uri === "string" && uri.startsWith("https://") ? uri : null;
        } catch {
          return null;
        }
      })
    );
    return photoUrls.filter((u): u is string => u !== null);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

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
  const { restaurantName } = parsed.data;

  // Resolve restaurant photos once for all dishes
  let restaurantPhotos: string[] = [];
  if (placesKey && restaurantName) {
    restaurantPhotos = await getRestaurantPhotos(restaurantName, placesKey);
  }

  // Enrich each dish in parallel
  const enrichedDishes = await Promise.all(
    dishes.map(async (dish, i) => {
      // Step A: Gemini inference — get full ingredient list
      const { servings, ingredients: inferredIngredients } = await inferIngredients(dish.name, geminiKey);

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

  return NextResponse.json({ data: { dishes: enrichedDishes } });
}
