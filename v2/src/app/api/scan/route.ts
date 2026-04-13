import 'server-only'
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { getCachedMenu, cacheMenu } from "@/lib/menuCache";
import { supabase } from "@/lib/supabase";
import { getApiKeys } from "@/lib/api-keys";

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_FALLBACK_MODEL = "gemini-2.0-flash";

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

// Accepts either:
//   { imageBase64, mimeType, ...}  — direct base64 upload (existing path)
//   { photoUrl, ... }              — server fetches the URL (new path for Places photos)
const RequestSchema = z
  .object({
    imageBase64: z.string().min(1).optional(),
    mimeType: z.string().min(1).optional(),
    // SEC-INJ-1.00: photoUrl validated as HTTPS at parse time and again before fetch
    photoUrl: z.string().url().optional(),
    // Optional restaurant identifiers for menu cache lookup
    restaurantPlaceId: z.string().optional().catch(undefined),
    restaurantName: z.string().optional().catch(undefined),
  })
  .refine(
    (d) => (d.imageBase64 && d.mimeType) || d.photoUrl,
    { message: 'Either imageBase64+mimeType or photoUrl is required' }
  );

// ─── Error response helper ────────────────────────────────
// Enforces the API contract: { error: { message, code } }
type ErrorCode =
  | "VALIDATION_ERROR"
  | "INVALID_REQUEST"
  | "PHOTO_FETCH_FAILED"
  | "SCAN_SERVICE_UNAVAILABLE"
  | "AI_UNAVAILABLE"
  | "GEMINI_RESPONSE_UNPARSEABLE"
  | "GEMINI_RESPONSE_INVALID"
  | "NO_DISHES"
  | "INTERNAL_ERROR";

function apiError(message: string, code: ErrorCode, status: 400 | 422 | 500 | 503) {
  return NextResponse.json({ error: { message, code } }, { status });
}

export async function POST(req: NextRequest) {
  try {
    // ── Resolve API key: user-provided BYOAK takes precedence over env key ──
    // SEC-DAT-1.00: never log the key value; log only that a user key is in use
    const userKeyHeader = req.headers.get("X-User-Gemini-Key") ?? "";
    const envKey = getApiKeys().gemini ?? "";

    let apiKey: string;
    if (userKeyHeader && userKeyHeader.startsWith("AI") && userKeyHeader.length >= 39) {
      console.log("[scan] using user-provided API key");
      apiKey = userKeyHeader;
    } else if (envKey) {
      apiKey = envKey;
    } else {
      return apiError("Scan service not configured", "SCAN_SERVICE_UNAVAILABLE", 503);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid request body", "INVALID_REQUEST", 400);
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid request parameters", "VALIDATION_ERROR", 422);
    }

    const { restaurantPlaceId, restaurantName } = parsed.data;

    // ─── Menu cache lookup (chain restaurant fast-path) ────────────────────
    // If we have a restaurant identifier, check whether we already have a
    // scanned menu for this location that's within the 30-day TTL. If so,
    // return the cached dishes immediately — no Gemini call needed.
    if (restaurantPlaceId || restaurantName) {
      try {
        const cached = await getCachedMenu({
          placeId: restaurantPlaceId,
          name: restaurantName,
        });

        if (cached) {
          const dishesWithIds = cached.dishes
            .filter((d) => d.name.trim().length > 0)
            .map((dish) => ({
              name: dish.name,
              description: dish.description ?? "",
              calorieEstimate: dish.calorieEstimate ?? null,
              confidence: 0.9, // Cache hits are treated as high confidence
              ingredients: [],
              id: crypto.randomUUID(),
            }));

          if (dishesWithIds.length > 0) {
            return NextResponse.json({
              data: {
                type: "menu" as const,
                restaurantName: restaurantName ?? null,
                dishes: dishesWithIds,
                totalDetected: dishesWithIds.length,
              },
              cached: true,
            });
          }
        }
      } catch (err) {
        // Cache lookup failed — fall through to Gemini (non-blocking)
        console.warn("[scan] menu cache lookup failed:", err instanceof Error ? err.message : err);
      }
    }

    // ─── Resolve image: direct base64 or fetch from photoUrl ─────────────
    let imageBase64: string;
    let mimeType: string;

    if (parsed.data.photoUrl) {
      const photoUrl = parsed.data.photoUrl;
      // SEC-INJ-1.00 / SEC-SEC-1.00: reject non-HTTPS URLs
      if (!photoUrl.startsWith('https://')) {
        return apiError('photoUrl must be an HTTPS URL', 'INVALID_REQUEST', 400);
      }
      const fetchController = new AbortController();
      const fetchTimer = setTimeout(() => fetchController.abort(), 8000);
      try {
        const photoRes = await fetch(photoUrl, { signal: fetchController.signal });
        if (!photoRes.ok) {
          return apiError('Failed to fetch photo', 'PHOTO_FETCH_FAILED', 400);
        }
        const contentType = photoRes.headers.get('content-type') ?? 'image/jpeg';
        mimeType = contentType.split(';')[0].trim();
        if (!ALLOWED_MIME_TYPES.has(mimeType)) {
          return apiError('Unsupported image format', 'INVALID_REQUEST', 400);
        }
        const buffer = await photoRes.arrayBuffer();
        if (buffer.byteLength * 1.34 > MAX_IMAGE_BASE64_LENGTH) {
          return apiError('Image too large', 'INVALID_REQUEST', 400);
        }
        imageBase64 = Buffer.from(buffer).toString('base64');
      } catch (err) {
        console.warn('[scan] photoUrl fetch failed:', err instanceof Error ? err.message : err);
        return apiError('Could not retrieve photo', 'PHOTO_FETCH_FAILED', 400);
      } finally {
        clearTimeout(fetchTimer);
      }
    } else {
      imageBase64 = parsed.data.imageBase64!;
      mimeType = parsed.data.mimeType!;

      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return apiError('Unsupported image format', 'INVALID_REQUEST', 400);
      }
      if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
        return apiError('Image too large', 'INVALID_REQUEST', 400);
      }
    }

    // ─── Call Gemini (with 2.0-flash fallback on 503) ─────────

    let rawText: string;
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const parts = [
        { inlineData: { data: imageBase64, mimeType } },
        { text: SCAN_PROMPT },
      ];

      // SEC-DAT-1.00: image data only exists in memory during this call; never persisted
      let result;
      try {
        result = await genAI.getGenerativeModel({ model: GEMINI_MODEL }).generateContent(parts);
      } catch (primaryErr) {
        const msg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        // Fall back on any transient server-side error (503 overload, 429 quota, 500 internal)
        const isTransient = msg.includes("503") || msg.includes("429") || msg.includes("500") || msg.includes("overloaded") || msg.includes("quota");
        if (isTransient) {
          console.warn("[scan] gemini-2.5-flash transient error — retrying with gemini-2.0-flash:", msg);
          result = await genAI.getGenerativeModel({ model: GEMINI_FALLBACK_MODEL }).generateContent(parts);
        } else {
          throw primaryErr;
        }
      }

      rawText = result.response.text();
    } catch (err) {
      console.error("[scan] Gemini error:", err instanceof Error ? err.message : err);
      return apiError("Scan service temporarily unavailable", "AI_UNAVAILABLE", 503);
    }

    // ─── Parse + validate ──────────────────────────────────

    const clean = rawText.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();

    let jsonParsed: unknown;
    try {
      jsonParsed = JSON.parse(clean);
    } catch {
      console.error("[scan] Gemini returned non-JSON:", clean.slice(0, 200));
      return apiError("Unexpected response from AI", "GEMINI_RESPONSE_UNPARSEABLE", 422);
    }

    const validated = GeminiResponseSchema.safeParse(jsonParsed);
    if (!validated.success) {
      console.error("[scan] Zod validation failed:", validated.error.issues);
      return apiError("Unexpected response structure", "GEMINI_RESPONSE_INVALID", 422);
    }

    // Capture raw Gemini dish count BEFORE filtering (empty names = unrecognised dishes)
    const totalDetected = validated.data.dishes.length;

    // Drop any dishes that came back with an empty name (Gemini edge case)
    const validDishes = validated.data.dishes.filter((d) => d.name.trim().length > 0);
    if (validDishes.length === 0) {
      return apiError("No dishes identified", "NO_DISHES", 422);
    }

    // Assign stable IDs for position-independent enrichment merging
    const dishesWithIds = validDishes.map((dish) => ({
      ...dish,
      ingredients: dish.ingredients.filter((i) => i.name.trim().length > 0),
      id: crypto.randomUUID(),
    }));

    // ─── Populate menu cache (fire-and-forget) ────────────────────────────
    // If we have a restaurant name or place ID, attempt to look up or create
    // the restaurant row and persist the dishes JSON for future cache hits.
    if (restaurantName || validated.data.restaurantName) {
      const nameForCache = (restaurantName ?? validated.data.restaurantName) as string;
      void (async () => {
        try {
          const sb = supabase;

          // Find or create the restaurant
          let restaurantId: string | null = null;

          if (restaurantPlaceId) {
            const { data } = await sb
              .from("restaurants")
              .select("id")
              .eq("place_id", restaurantPlaceId)
              .limit(1)
              .single();
            restaurantId = (data as { id: string } | null)?.id ?? null;
          }

          if (!restaurantId) {
            const { data } = await sb
              .from("restaurants")
              .select("id")
              .eq("name", nameForCache)
              .limit(1)
              .single();
            restaurantId = (data as { id: string } | null)?.id ?? null;
          }

          if (restaurantId) {
            const dishesJson = JSON.stringify(
              dishesWithIds.map((d) => ({
                name: d.name,
                description: d.description,
                calorieEstimate: d.calorieEstimate,
              }))
            );
            await cacheMenu(restaurantId, dishesJson);
          }
        } catch (err) {
          console.warn("[scan] cacheMenu fire-and-forget failed:", err instanceof Error ? err.message : err);
        }
      })();
    }

    return NextResponse.json({
      data: {
        ...validated.data,
        dishes: dishesWithIds,
        totalDetected,
      },
    });
  } catch (err) {
    console.error("[scan] Unexpected error:", err instanceof Error ? err.message : err);
    return apiError("Internal server error", "INTERNAL_ERROR", 500);
  }
}
