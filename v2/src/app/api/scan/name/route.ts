import 'server-only'
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { getApiKeys } from "@/lib/api-keys";

/**
 * POST /api/scan/name
 *
 * Lightweight fast-path: extracts only the restaurant name from a menu image.
 * Runs in parallel with the full /api/scan call so the name field pre-fills
 * ~3s before the dish list arrives.
 *
 * Always returns HTTP 200 — this is a best-effort hint, never a blocker.
 */

const GEMINI_MODEL = "gemini-2.5-flash";
const MAX_IMAGE_BASE64_LENGTH = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const NAME_PROMPT = `Look at this menu image. Is there a restaurant name, logo, or header text visible that identifies the restaurant?

Return ONLY valid JSON, no markdown, no explanation:
{"restaurantName": "The exact restaurant name as shown, or null if not clearly visible"}`;

export async function POST(req: NextRequest) {
  try {
    const { gemini: geminiKey } = getApiKeys();
    if (!geminiKey) return NextResponse.json({ restaurantName: null });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ restaurantName: null });
    }

    if (!body || typeof body !== "object") return NextResponse.json({ restaurantName: null });
    const { imageBase64, mimeType } = body as Record<string, unknown>;

    if (typeof imageBase64 !== "string" || imageBase64.length === 0) {
      return NextResponse.json({ restaurantName: null });
    }
    if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      return NextResponse.json({ restaurantName: null });
    }
    if (typeof mimeType !== "string" || !ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json({ restaurantName: null });
    }

    const ai = new GoogleGenAI({ apiKey: geminiKey });
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: imageBase64 } },
            { text: NAME_PROMPT },
          ],
        },
      ],
      config: {
        maxOutputTokens: 64,
        temperature: 0,
      },
    });

    const raw = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const trimmed = raw.trim().replace(/^```(?:json)?|```$/g, "").trim();

    let restaurantName: string | null = null;
    try {
      const parsed = JSON.parse(trimmed) as { restaurantName?: unknown };
      if (typeof parsed.restaurantName === "string" && parsed.restaurantName.length > 0) {
        restaurantName = parsed.restaurantName;
      }
    } catch {
      // Gemini returned non-JSON — treat as no name found
    }

    return NextResponse.json({ restaurantName });
  } catch {
    // Never let this endpoint error — it's a best-effort hint
    return NextResponse.json({ restaurantName: null });
  }
}
