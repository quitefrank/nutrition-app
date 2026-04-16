import 'server-only'
import { NextRequest, NextResponse, after } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { getApiKeys } from "@/lib/api-keys";
import { supabase } from "@/lib/supabase";
import type { RecipeUpdate } from "@/types/database";

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
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(ingredientName)}&pageSize=3&dataType=Foundation,SR%20Legacy`,
      { headers: { "X-Api-Key": usdaKey }, signal: controller.signal }
    );
    if (!res.ok) return nullResult;

    const { foods } = UsdaSearchResponseSchema.parse(await res.json());

    // Calorie density guard — reject implausible matches (e.g. "avocado blossoms" → avocado oil).
    // Accept the first candidate whose cal/100g is within the whole-food ceiling.
    // Known high-fat queries (oil, butter, etc.) bypass the guard intentionally.
    const FAT_TERMS = ["oil", "fat", "butter", "lard", "ghee", "shortening", "tallow"];
    const isHighFatQuery = FAT_TERMS.some((t) => ingredientName.toLowerCase().includes(t));
    const CAL_DENSITY_LIMIT = 700; // kcal/100g — only pure fats/oils exceed this

    // Processed-form terms — deprioritize these in favour of raw/whole matches.
    // e.g. USDA often ranks "Tomato paste" above "Tomatoes, raw" for query "tomato".
    const PROCESSED_TERMS = ["paste", "sauce", "concentrate", "canned", "dried", "sun-dried", "powder", "juice", "puree", "extract"];
    const isProcessed = (desc: string) => PROCESSED_TERMS.some((t) => desc.toLowerCase().includes(t));

    // Collect all valid candidates (pass calorie density guard) + track their processed status
    type Candidate = { food: typeof foods[0]; cal100g: number; processed: boolean };
    const validCandidates: Candidate[] = [];
    let noCalFallback = null; // accepted only if every candidate lacks calorie data

    for (const candidate of foods) {
      const cal100g = candidate.foodNutrients.find((n) => n.nutrientId === 1008)?.value ?? null;
      if (cal100g === null) {
        if (!noCalFallback) noCalFallback = candidate;
        continue;
      }
      if (isHighFatQuery || cal100g <= CAL_DENSITY_LIMIT) {
        validCandidates.push({ food: candidate, cal100g, processed: isProcessed(candidate.description ?? "") });
      }
    }

    // Prefer non-processed (raw/whole) over processed forms; fall back to processed if nothing else
    const food =
      validCandidates.find((c) => !c.processed)?.food ??
      validCandidates[0]?.food ??
      noCalFallback;

    if (!food) return nullResult;

    const nutrients = food.foodNutrients;

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
  usda_name: string | null;
  quantity: string | null;
  unit: string | null;
}

const INFER_PROMPT = (dishName: string, description?: string, restaurantName?: string) =>
  `You are a culinary expert and nutritionist. List the ingredients for a single restaurant serving of: "${dishName}".
${restaurantName?.trim() ? `\nThis dish is served at: "${restaurantName}". Use this to calibrate portion sizes and cooking style.\n` : ""}${description ? `\nThe menu describes it as: "${description}"\nUse this description to identify the exact ingredients — do not substitute or add ingredients not implied by the description.\n` : ""}
Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "servings": 1,
  "ingredients": [
    { "name": "string", "usda_name": "string", "quantity": "string", "unit": "g" }
  ]
}

Rules:
- servings: always 1 (a single restaurant plate)
- List only the ingredients present in this dish (5–12 max)
- name: the ingredient as it appears in the dish (display name)
- usda_name: a clean USDA-friendly search term — strip restaurant adjectives, cooking styles, and origin words.
  Rule: identify the core noun + preparation state. Remove brand names, origin words, and aesthetic descriptors.
  Examples: "brasa roasted chicken" → "roasted chicken breast skinless"
            "avocado blossoms" → "avocado raw"
            "toasted Peruvian corn" → "toasted corn kernels"
            "apple cider + lucuma dressing" → "apple cider vinaigrette"
            "wild-caught Atlantic salmon" → "grilled salmon"
  Use a generic name that matches USDA Foundation or SR Legacy data.
- quantity: ALWAYS provide a realistic gram weight for a single serving — never null or zero.
  Use the following 3-step process:

  STEP 1 — Recipe archetype check:
  If the dish name is a recognizable culinary preparation (carbonara, caesar salad, pad thai,
  burrito bowl, risotto, bibimbap, tikka masala, club sandwich, fish and chips, etc.),
  use the canonical recipe's ingredient ratios as your baseline. Adjust for
  restaurant-specific ingredients within ±30% of those ratios.
  If the dish is proprietary or invented (e.g., "Avocado Chicken Crunch", "Dragon Bowl"),
  skip to STEP 2.

  STEP 2 — Identify the dish type (salad, rice bowl, pasta, hot plate, soup):
    - Salad: total dish weight 400–550 g; protein 120–150 g; vegetable toppings 30–50 g each
    - Rice/grain bowl: total dish weight 450–700 g; protein 150–180 g; vegetable sides 60–100 g each
    - Pasta: total dish weight 350–550 g; protein 100–150 g
    - Hot main plate: total dish weight 400–700 g; protein 150–200 g; vegetable sides 80–120 g each

  STEP 3 — Classify each ingredient's role and apply these gram defaults:
    - Primary protein in a main dish (chicken, beef, fish): typically 150–180 g
    - Primary protein in a salad/bowl: typically 120–150 g (do not exceed 150 g)
    - Grains/starches (rice, pasta, quinoa): typically 80–150 g cooked
    - Leafy greens (lettuce, spinach, mixed greens): typically 75–100 g
    - Creamy fruits (avocado, mango, papaya): typically 50 g in a salad, 75–100 g as a primary topping
      (avocado is a substantial ingredient — do NOT group with nuts/seeds)
    - Vegetables as a PRIMARY SIDE (served alone, not in a composed dish): 80–100 g
    - Vegetables as a TOPPING in a salad/bowl: 30–50 g each
      (broccoli florets, shredded carrots, sliced beets — "scoop" portions, not full sides)
    - STARCH-DRIED toppings (cancha, croutons, tortilla strips, pita chips): 25–40 g
      (dehydrated — calorie-dense per gram, treat as a small-scoop topping)
    - Corn and legumes as a topping: 35–50 g
    - Corn and legumes as a primary component (bowl base): 80–100 g
    - Sauces and dressings: typically 30–50 g (restaurant pour ~2 tbsp)
    - Cheeses: typically 20–40 g
    - Garnishes, herbs, wedges (lemon, lime, parsley): typically 5–15 g
    - Nuts and seeds (as a topping): typically 10–25 g
    - Cooking oils (used in preparation, not as dressing): typically 10–20 g
- unit: always "g" — convert everything to grams
- If a menu description is provided, extract ALL ingredients listed in it — the description is your source of truth regardless of whether the dish name is familiar
- If NO description is provided AND the dish name is not a recognisable food, return { "servings": 1, "ingredients": [] }
- Return valid JSON only`;

async function inferIngredients(dishName: string, geminiKey: string, description?: string, restaurantName?: string): Promise<{ servings: number; ingredients: InferredIngredient[] }> {
  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const params = {
      model: GEMINI_MODEL,
      contents: INFER_PROMPT(dishName, description, restaurantName),
      // Structured JSON extraction — no reasoning required; disable thinking to cut latency
      config: { thinkingConfig: { thinkingBudget: 0 } },
    };
    let geminiResult;
    try {
      geminiResult = await ai.models.generateContent(params);
    } catch (primaryErr) {
      const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
      const isTransient =
        msg.includes("503") || msg.includes("UNAVAILABLE") ||
        msg.includes("overloaded") || msg.includes("429") || msg.includes("quota");
      if (isTransient) {
        console.warn("[enrich/gemini] transient error, retrying in 2s:", msg.slice(0, 120));
        await new Promise((r) => setTimeout(r, 2000));
        geminiResult = await ai.models.generateContent(params);
      } else {
        throw primaryErr;
      }
    }
    const text = geminiResult.text ?? "";
    const clean = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();
    const schemaResult = GeminiInferenceSchema.safeParse(JSON.parse(clean));
    if (!schemaResult.success) {
      console.warn("[enrich/gemini] schema validation failed for:", dishName, schemaResult.error.issues);
      return { servings: 1, ingredients: [] };
    }
    const { servings, ingredients: raw } = schemaResult.data;
    const ingredients: InferredIngredient[] = raw
      .filter((i) => i.name.trim().length > 0)
      .map((i) => ({
        name: i.name.trim(),
        usda_name: i.usda_name ?? null,
        quantity: typeof i.quantity === "number"
          ? (Number.isFinite(i.quantity) && i.quantity > 0 ? String(i.quantity) : null)
          : (i.quantity ?? null),
        unit: i.unit ?? null,
      }));
    return { servings, ingredients };
  } catch (err) {
    console.warn("[enrich/gemini] inference failed for:", dishName, err instanceof Error ? err.message : err);
    return { servings: 1, ingredients: [] };
  }
}

// ─── Gemini Search grounding — dish rating ────────────────

interface DishRating {
  dishRating: number | null;
  dishReviewSnippet: string | null;
}

async function getDishRating(
  dishName: string,
  restaurantName: string | null,
  geminiKey: string
): Promise<DishRating> {
  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });

    const context = restaurantName?.trim()
      ? `"${dishName}" dish at "${restaurantName}" restaurant`
      : `"${dishName}" dish`;

    const prompt = `Search for customer reviews and ratings of ${context}. Based on what you find, reply with ONLY a JSON object and nothing else:
{"rating": <number between 1.0 and 5.0, or null if insufficient data>, "snippet": "<one sentence summary of customer sentiment, or null>"}`;

    const result = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], thinkingConfig: { thinkingBudget: 0 } },
    });
    const text = result.text ?? "";

    const jsonMatch = text.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return { dishRating: null, dishReviewSnippet: null };

    const { rating, snippet } = DishRatingSchema.parse(JSON.parse(jsonMatch[0]));
    return { dishRating: rating, dishReviewSnippet: snippet };
  } catch {
    // Non-blocking — rating is best-effort
    return { dishRating: null, dishReviewSnippet: null };
  }
}

// ─── Google Custom Search photo ────────────────────────────

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

// ─── TheMealDB fallback (no API key required) ───────────────
// Covers thousands of common dishes with stable, licensed photos.
// Used when CSE keys are not configured.

// Generic words that rarely match a meaningful meal in TheMealDB
const MEAL_DB_SKIP_WORDS = new Set([
  "spicy", "crispy", "fried", "grilled", "baked", "stuffed", "sauteed", "steamed",
  "roll", "rolls", "bowl", "plate", "wrap", "special", "combo", "platter",
  "with", "and", "the", "for", "in", "of", "a", "an",
]);

async function getDishPhotoFromMealDB(dishName: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    // Build a prioritised query list: full name, then each significant word
    const words = dishName
      .split(/\s+/)
      .map((w) => w.toLowerCase().replace(/[^a-z]/g, ""))
      .filter((w) => w.length >= 3 && !MEAL_DB_SKIP_WORDS.has(w));
    const queries = [dishName, ...words].filter(Boolean);

    for (const q of queries) {
      const res = await fetch(
        `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`,
        { signal: controller.signal }
      );
      if (!res.ok) continue;
      const data = await res.json() as { meals?: Array<{ strMealThumb?: string }> | null };
      const photo = data?.meals?.[0]?.strMealThumb;
      if (typeof photo === "string" && photo.startsWith("https://")) return photo;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── External API response schemas ────────────────────────
// All lenient: .catch() fallbacks so partial data is always usable.

const UsdaSearchResponseSchema = z.object({
  foods: z.array(
    z.object({
      description: z.string().catch(""),
      servingSize: z.number().nullable().catch(null),
      servingSizeUnit: z.string().nullable().catch(null),
      foodNutrients: z.array(
        z.object({ nutrientId: z.number(), value: z.number() })
      ).catch([]),
    })
  ).catch([]),
});

const GeminiInferenceSchema = z.object({
  servings: z.number().positive().catch(1),
  ingredients: z.array(
    z.object({
      name: z.string().catch(""),
      usda_name: z.string().nullable().optional().catch(null),
      quantity: z.union([z.string(), z.number()]).nullable().optional().catch(null),
      unit: z.string().nullable().optional().catch(null),
    })
  ).catch([]),
});

const DishRatingSchema = z.object({
  rating: z.number().min(1).max(5).nullable().catch(null)
    .transform((v) => (v !== null ? Math.round(v * 10) / 10 : null)),
  snippet: z.string().nullable().catch(null)
    .transform((v) => (v?.trim().slice(0, 200) || null)),
});

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

function apiError(message: string, code: string, status: number) {
  return NextResponse.json({ error: { message, code } }, { status });
}

export async function POST(req: NextRequest) {
  const { gemini: geminiKey, usda: usdaKey, places: placesKey, cseKey, cseCx } = getApiKeys();

  if (!geminiKey) {
    return apiError("Enrichment service not configured", "ENRICH_SERVICE_UNAVAILABLE", 503);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid request body", "INVALID_REQUEST", 400);
  }

  // RequestSchema uses .catch() fallbacks throughout — safeParse always succeeds;
  // malformed input coerces to { dishes: [] }, returning a 200 with no dishes.
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ data: { dishes: [] } });
  }

  // Drop dishes with empty names (defensive)
  const dishes = parsed.data.dishes.filter((d) => d.name.trim().length > 0);
  if (dishes.length === 0) {
    // Return empty success rather than an error — enrichment is optional
    return NextResponse.json({ data: { dishes: [] } });
  }
  const { restaurantName, dishToRecipeMap } = parsed.data;


  // Enrich each dish in parallel
  const enrichedDishes = await Promise.all(
    dishes.map(async (dish, i) => {
      // Steps A and C start simultaneously — neither depends on the other.
      // A: Gemini ingredient inference (needed before USDA can start)
      // C: Photo + rating (only needs dish.name — no dependency on A or B)
      const ingredientsPromise = inferIngredients(dish.name, geminiKey, dish.description, restaurantName ?? undefined);
      // Prefer CSE (stable web images) when configured; fall back to TheMealDB
      // (free, no key, covers thousands of common dishes with stable photos).
      const photoPromise: Promise<string | null> = cseKey && cseCx
        ? getDishPhoto(dish.name, cseKey, cseCx)
        : getDishPhotoFromMealDB(dish.name);
      const ratingPromise = getDishRating(dish.name, restaurantName ?? null, geminiKey);

      // Await A — ingredient names are required before USDA (Step B) can start
      const { servings, ingredients: inferredIngredients } = await ingredientsPromise;

      // Step B: USDA macro lookup for each ingredient (parallel).
      // Starts immediately after A resolves while photo/rating (C) are still in-flight.
      let enrichedIngredients: Array<InferredIngredient & UsdaMacros> = [];
      if (usdaKey && inferredIngredients.length > 0) {
        const macroResults = await Promise.allSettled(
          inferredIngredients.map((ing) => lookupUsdaMacros(ing.usda_name ?? ing.name, ing.quantity, ing.unit, usdaKey))
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

      // Await C results — photo and rating are likely already settled while B was running
      const [photoUrl, ratingResult] = await Promise.all([photoPromise, ratingPromise]);
      const { dishRating, dishReviewSnippet } = ratingResult;

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
        dishRating,
        dishReviewSnippet,
        totalCalories: sumOrNull(enrichedIngredients.map((i) => i.calories_kcal)),
        totalProtein: sumOrNull(enrichedIngredients.map((i) => i.protein_g)),
        totalFat: sumOrNull(enrichedIngredients.map((i) => i.fat_g)),
        totalCarbs: sumOrNull(enrichedIngredients.map((i) => i.carbs_g)),
      };
    })
  );

  // ─── Persist enriched macros back to Supabase ────────────────────────────
  // `after()` schedules this block to run after the response is flushed.
  // Unlike `void (async () => {...})()`, the runtime waits for after() callbacks
  // to complete before tearing down the execution context — so writes are
  // guaranteed to finish on Vercel serverless (no more silent truncation).
  if (dishToRecipeMap && Object.keys(dishToRecipeMap).length > 0) {
    after(async () => {
      try {
        const sb = supabase;

        for (const enrichedDish of enrichedDishes) {
          const lookupKey = enrichedDish.id ?? enrichedDish.name;
          const recipeId = lookupKey ? dishToRecipeMap[lookupKey] : undefined;
          if (!recipeId) continue;

          // Write dish photo independently so a missing rating column never
          // blocks dish_image_url from being persisted.
          if (enrichedDish.photoUrl) {
            await sb
              .from("recipes")
              .update({ dish_image_url: enrichedDish.photoUrl, photo_status: "confirmed" })
              .eq("id", recipeId);
          }

          // Rating + review — best-effort; skip when both are null
          const ratingUpdates: RecipeUpdate = {};
          if (enrichedDish.dishRating !== null) ratingUpdates.dish_rating = enrichedDish.dishRating;
          if (enrichedDish.dishReviewSnippet !== null) ratingUpdates.dish_review_snippet = enrichedDish.dishReviewSnippet;
          if (Object.keys(ratingUpdates).length > 0) {
            const { error: ratingErr } = await sb.from("recipes").update(ratingUpdates).eq("id", recipeId);
            if (ratingErr) console.warn("[enrich] rating update failed:", ratingErr.message);
          }

          const ings = enrichedDish.ingredients as Array<{
            name: string;
            usda_name: string | null;
            quantity: string | null;
            unit: string | null;
            calories_kcal: number | null;
            protein_g: number | null;
            fat_g: number | null;
            carbs_g: number | null;
          }>;

          // Ingredient upsert — only when Gemini inferred at least one ingredient
          if (ings.length > 0) {
            // Upsert all ingredients in one call.
            // The unique constraint on (recipe_id, name) ensures concurrent write-backs
            // from parallel enrichment runs don't produce duplicate rows.
            const rows = ings.map((ing) => ({
              recipe_id: recipeId,
              name: ing.name,
              quantity: ing.quantity ?? null,
              unit: ing.unit ?? null,
              confidence: "medium" as const,
              calories_per_serving: ing.calories_kcal,
              protein_g: ing.protein_g,
              fat_g: ing.fat_g,
              carbs_g: ing.carbs_g,
            }));

            const { error } = await sb
              .from("recipe_ingredients")
              .upsert(rows, { onConflict: "recipe_id,name" });

            if (error) console.warn("[enrich] ingredient upsert failed:", recipeId, error.message);
          }

          // Sync recipe-level macro totals so the home page card (which reads
          // recipes.estimated_calories) stays consistent with the ingredient sum.
          // Runs regardless of ingredient count — a dish with no Gemini-inferred
          // ingredients may still have USDA totals from Phase 1.
          // Only write estimated_calories when USDA returned a value — preserves
          // the Phase 1 Gemini estimate when USDA lookup failed entirely.
          const recipeUpdates: Record<string, unknown> = {
            total_protein_g: enrichedDish.totalProtein,
            total_carbs_g: enrichedDish.totalCarbs,
            total_fat_g: enrichedDish.totalFat,
            total_fibre_g: null,
          };
          if (enrichedDish.totalCalories != null) {
            recipeUpdates.estimated_calories = enrichedDish.totalCalories;
          }
          const { error: recipeErr } = await sb.from("recipes").update(recipeUpdates).eq("id", recipeId);
          if (recipeErr) console.warn("[enrich] recipe macro update failed:", recipeId, recipeErr.message);
        }
      } catch (err) {
        console.warn("[enrich] Supabase write-back error (non-blocking):", err instanceof Error ? err.message : err);
      }
    });
  }

  return NextResponse.json({ data: { dishes: enrichedDishes } });
}
