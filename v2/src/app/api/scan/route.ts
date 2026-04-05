import 'server-only'
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

const GEMINI_MODEL = "gemini-2.5-flash";

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MAX_IMAGE_BASE64_LENGTH = 10 * 1024 * 1024;

const SCAN_PROMPT = `You are a food identification expert. Analyse this image.

Determine if it shows a MENU (text listing multiple dishes) or a PLATED DISH (a single prepared dish).

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "type": "menu" | "dish",
  "restaurantName": "string or null — restaurant name if visible on the menu, else null",
  "dishes": [
    {
      "name": "string",
      "description": "string",
      "calorieEstimate": number or null,
      "confidence": 0.0-1.0,
      "ingredients": [
        { "name": "string", "quantity": "string or null", "unit": "string or null", "confidenceLevel": "high" | "medium" | "low" }
      ]
    }
  ]
}

Rules:
- For a menu: list every visible dish with name, brief description, calorie estimate. Extract restaurant name from header/logo if visible.
- For a dish: identify the single primary dish with its ingredients
- calorieEstimate: typical serving calories, or null if uncertain
- ingredients: for a dish photo, list what you can see or infer; for a menu item, leave as []
- If not food, return { "type": "dish", "restaurantName": null, "dishes": [] }
- Return valid JSON only — no prose, no markdown fences`;

// ─── Zod validation ───────────────────────────────────────

// Lenient schemas: .catch() on every field so a single bad value
// from Gemini never kills the whole response.

const IngredientSchema = z.object({
  name: z.string().catch(""),
  quantity: z.string().nullable().optional().catch(null),
  unit: z.string().nullable().optional().catch(null),
  confidenceLevel: z.enum(["high", "medium", "low"]).catch("medium"),
});

const DishSchema = z.object({
  name: z.string().catch(""),
  description: z.string().catch("").transform((v) => (v === "null" || v === "undefined" ? "" : v)),
  // calorieEstimate may come back as 0, negative, or a string — coerce then null-ify bad values
  calorieEstimate: z.union([z.number(), z.string(), z.null()]).optional()
    .transform((v) => {
      const n = typeof v === "string" ? parseFloat(v) : v;
      return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    }).catch(null),
  confidence: z.number().catch(0.8).transform((v) => Math.max(0, Math.min(1, v))),
  ingredients: z.array(IngredientSchema).catch([]),
});

const GeminiResponseSchema = z.object({
  type: z.enum(["menu", "dish"]).catch("dish"),
  restaurantName: z.string().nullable().optional().catch(null),
  dishes: z.array(DishSchema).catch([]),
});

// ─── Request schema ───────────────────────────────────────

const RequestSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Scan service not configured", code: "SCAN_SERVICE_UNAVAILABLE" },
        { status: 503 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request body", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "imageBase64 and mimeType are required", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    const { imageBase64, mimeType } = parsed.data;

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: "Unsupported image format", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      return NextResponse.json(
        { error: "Image too large", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    // ─── Call Gemini ───────────────────────────────────────

    let rawText: string;
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

      // SEC-DAT-1.00: image data only exists in memory during this call; never persisted
      const result = await model.generateContent([
        { inlineData: { data: imageBase64, mimeType } },
        { text: SCAN_PROMPT },
      ]);

      rawText = result.response.text();
    } catch (err) {
      console.error("[scan] Gemini error:", err instanceof Error ? err.message : err);
      return NextResponse.json(
        { error: "Scan service temporarily unavailable", code: "SCAN_UNAVAILABLE" },
        { status: 503 }
      );
    }

    // ─── Parse + validate ──────────────────────────────────

    const clean = rawText.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();

    let jsonParsed: unknown;
    try {
      jsonParsed = JSON.parse(clean);
    } catch {
      console.error("[scan] Gemini returned non-JSON:", clean.slice(0, 200));
      return NextResponse.json(
        { error: "Unexpected response from AI", code: "GEMINI_RESPONSE_UNPARSEABLE" },
        { status: 422 }
      );
    }

    const validated = GeminiResponseSchema.safeParse(jsonParsed);
    if (!validated.success) {
      console.error("[scan] Zod validation failed:", validated.error.issues);
      return NextResponse.json(
        { error: "Unexpected response structure", code: "GEMINI_RESPONSE_INVALID" },
        { status: 422 }
      );
    }

    // Drop any dishes that came back with an empty name (Gemini edge case)
    const validDishes = validated.data.dishes.filter((d) => d.name.trim().length > 0);
    if (validDishes.length === 0) {
      return NextResponse.json(
        { error: "No dishes identified", code: "NO_DISHES" },
        { status: 422 }
      );
    }

    // Assign stable IDs for position-independent enrichment merging
    const dishesWithIds = validDishes.map((dish) => ({
      ...dish,
      ingredients: dish.ingredients.filter((i) => i.name.trim().length > 0),
      id: crypto.randomUUID(),
    }));

    return NextResponse.json({
      data: {
        ...validated.data,
        dishes: dishesWithIds,
      },
    });
  } catch (err) {
    console.error("[scan] Unexpected error:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
