import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { getApiKeys } from "@/lib/api-keys";

const GEMINI_MODEL = "gemini-2.5-flash";

// ─── Request schema ───────────────────────────────────────────────────────────

const RequestSchema = z.object({
  url: z
    .string()
    .url("Must be a valid URL")
    .refine((u) => u.startsWith("http://") || u.startsWith("https://"), {
      message: "URL must use http or https",
    }),
});

// ─── Response schema ──────────────────────────────────────────────────────────

const IngredientSchema = z.object({
  name: z.string().catch(""),
  quantity: z.string().nullable().catch(null),
  unit: z.string().nullable().catch(null),
  confidenceLevel: z.enum(["high", "medium", "low"]).catch("high"),
});

const RecipeSchema = z.object({
  name: z.string().catch("Untitled Recipe"),
  description: z.string().catch(""),
  calorieEstimate: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      const n = typeof v === "string" ? parseFloat(v) : v;
      return typeof n === "number" && Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    })
    .catch(null),
  servings: z
    .union([z.number(), z.string()])
    .transform((v) => {
      const n = typeof v === "string" ? parseInt(v, 10) : v;
      return Number.isFinite(n) && n > 0 ? n : 1;
    })
    .catch(1),
  ingredients: z.array(IngredientSchema).catch([]),
});

// ─── Gemini prompt ────────────────────────────────────────────────────────────

const IMPORT_PROMPT = `Extract the recipe from this text. Return ONLY valid JSON (no markdown, no explanation):
{
  "name": "dish name",
  "description": "brief description",
  "calorieEstimate": number or null,
  "servings": number,
  "ingredients": [
    { "name": "string", "quantity": "string or null", "unit": "string or null", "confidenceLevel": "high" }
  ]
}

Rules:
- calorieEstimate: per-serving calorie count, or null if not present
- servings: number of servings the recipe makes (default 1 if not specified)
- If no clear recipe is found, return { "name": "", "description": "", "calorieEstimate": null, "servings": 1, "ingredients": [] }
- Return valid JSON only — no prose, no markdown fences`;

// ─── HTML cleaning ────────────────────────────────────────────────────────────

/**
 * Strips script/style/nav/header/footer/aside blocks and HTML tags from raw HTML,
 * returning clean readable text. SEC-INJ-1.00 — no eval, pure regex.
 */
function stripHtml(html: string): string {
  return html
    // Remove entire script blocks
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    // Remove entire style blocks
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    // Remove navigation, header, footer, aside, ads
    .replace(/<(nav|header|footer|aside|noscript|svg|iframe|figure|form)\b[^<]*(?:(?!<\/\1>)<[^<]*)*<\/\1>/gi, " ")
    // Collapse tags to spaces
    .replace(/<[^>]+>/g, " ")
    // Decode common HTML entities
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Error helper ─────────────────────────────────────────────────────────────

function apiError(message: string, code: string, status: 400 | 422 | 500 | 502 | 503) {
  return NextResponse.json({ error: { message, code } }, { status });
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── Resolve API key (BYOAK first, then env) ──────────────────────────────
    // SEC-DAT-1.00: never log the key value itself
    const userKey = req.headers.get("X-User-Gemini-Key") ?? "";
    const envKey = getApiKeys().gemini ?? "";

    let apiKey: string;
    if (userKey && userKey.startsWith("AI") && userKey.length >= 39) {
      console.log("[import] using user-provided API key");
      apiKey = userKey;
    } else if (envKey) {
      apiKey = envKey;
    } else {
      return apiError("Import service not configured", "IMPORT_SERVICE_UNAVAILABLE", 503);
    }

    // ── Parse + validate request ─────────────────────────────────────────────
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("Invalid request body", "INVALID_REQUEST", 400);
    }

    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Invalid request", "VALIDATION_ERROR", 422);
    }

    const { url } = parsed.data;

    // ── Fetch the target page ────────────────────────────────────────────────
    let html: string;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const fetchRes = await fetch(url, {
        signal: controller.signal,
        headers: {
          // Identify as a browser-like client to avoid bot-detection blocks
          "User-Agent":
            "Mozilla/5.0 (compatible; Plately/1.0; +https://plately.app/import-bot)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.5",
        },
      });

      clearTimeout(timeout);

      if (!fetchRes.ok) {
        console.warn("[import] target URL returned", fetchRes.status, url);
        return apiError("Could not fetch that URL — the site may be unavailable.", "URL_UNREACHABLE", 503);
      }

      html = await fetchRes.text();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (err instanceof Error && err.name === "AbortError") {
        return apiError("The recipe page took too long to respond.", "URL_TIMEOUT", 503);
      }
      console.warn("[import] fetch error:", msg);
      return apiError("Could not fetch that URL.", "URL_UNREACHABLE", 503);
    }

    // ── Clean HTML → text, truncate for Gemini ───────────────────────────────
    const cleanText = stripHtml(html).slice(0, 8000);

    if (cleanText.length < 50) {
      return apiError("The page didn't contain enough readable text.", "NO_CONTENT", 422);
    }

    // ── Call Gemini ──────────────────────────────────────────────────────────
    let rawText: string;
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

      const result = await model.generateContent([
        { text: IMPORT_PROMPT },
        { text: `\n\n---\n\n${cleanText}` },
      ]);

      rawText = result.response.text();
    } catch (err) {
      console.error("[import] Gemini error:", err instanceof Error ? err.message : err);
      return apiError("AI extraction temporarily unavailable.", "AI_UNAVAILABLE", 503);
    }

    // ── Parse + validate Gemini response ─────────────────────────────────────
    const clean = rawText.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();

    let jsonParsed: unknown;
    try {
      jsonParsed = JSON.parse(clean);
    } catch {
      console.error("[import] Gemini non-JSON:", clean.slice(0, 200));
      return apiError("Unexpected response from AI.", "AI_RESPONSE_UNPARSEABLE", 422);
    }

    const validated = RecipeSchema.safeParse(jsonParsed);
    if (!validated.success) {
      console.error("[import] Zod validation failed:", validated.error.issues);
      return apiError("Unexpected response structure from AI.", "AI_RESPONSE_INVALID", 422);
    }

    // A blank name means Gemini found no recipe on the page
    if (!validated.data.name.trim()) {
      return apiError("No recipe was found at that URL. Try a different page.", "NO_RECIPE_FOUND", 422);
    }

    // Filter out blank ingredient names
    const recipe = {
      ...validated.data,
      ingredients: validated.data.ingredients.filter((i) => i.name.trim().length > 0),
    };

    return NextResponse.json({ data: { recipe } });
  } catch (err) {
    console.error("[import] Unexpected error:", err instanceof Error ? err.message : err);
    return apiError("Internal server error", "INTERNAL_ERROR", 500);
  }
}
