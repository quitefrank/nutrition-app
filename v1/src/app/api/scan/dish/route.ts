import 'server-only'
import { NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getApiKeys } from '@/lib/api-keys'
import type { ScanRequest, ScanResult, DishResult, IngredientResult } from '@/types/api'

const GEMINI_MODEL = 'gemini-2.5-flash'

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

// ~10 MB encoded base64 ≈ ~7.5 MB binary — within Gemini inline-data limit
const MAX_IMAGE_BASE64_LENGTH = 10 * 1024 * 1024

const DISH_SCAN_PROMPT = `You are a food identification expert. Analyse this photo of a dish.

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "dishes": [
    {
      "name": "string — dish name",
      "description": "string — brief description of the dish",
      "calorieEstimate": number or null,
      "ingredients": [
        {
          "name": "string",
          "quantity": "string or null",
          "unit": "string or null",
          "confidenceLevel": "high" | "medium" | "low"
        }
      ]
    }
  ]
}

Rules:
- Identify the single primary dish in the photo
- calorieEstimate: estimate calories for a typical serving, or null if uncertain
- ingredients: list the visible or strongly implied ingredients
- confidenceLevel per ingredient: "high" = clearly visible, "medium" = strongly implied, "low" = possible but uncertain
- If the image is not food, return { "dishes": [] }
- Return valid JSON only — no prose, no markdown fences`

function parseIngredients(raw: unknown): IngredientResult[] {
  if (!Array.isArray(raw)) return []
  const VALID_CONFIDENCE = new Set(['high', 'medium', 'low'])
  return raw
    .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
    .map((i) => ({
      name: typeof i.name === 'string' ? i.name : 'Unknown',
      quantity: typeof i.quantity === 'string' ? i.quantity : null,
      unit: typeof i.unit === 'string' ? i.unit : null,
      confidenceLevel: VALID_CONFIDENCE.has(i.confidenceLevel as string)
        ? (i.confidenceLevel as 'high' | 'medium' | 'low')
        : 'low',
    }))
}

function parseGeminiDishResponse(text: string): DishResult[] | null {
  const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  let parsed: { dishes: unknown[] }
  try {
    parsed = JSON.parse(clean)
  } catch {
    return null
  }

  if (!Array.isArray(parsed?.dishes)) return null

  return parsed.dishes
    .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
    .map((d) => ({
      name: typeof d.name === 'string' ? d.name : 'Unknown dish',
      description: typeof d.description === 'string' ? d.description : '',
      calorieEstimate:
        Number.isFinite(d.calorieEstimate) && (d.calorieEstimate as number) >= 0
          ? (d.calorieEstimate as number)
          : null,
      ingredients: parseIngredients(d.ingredients),
      imageUrl: null,
    }))
}

/** Returns true if >60% of ingredients across all dishes are 'low' confidence. */
function requiresInference(dishes: DishResult[]): boolean {
  const allIngredients = dishes.flatMap((d) => d.ingredients)
  if (allIngredients.length === 0) return false
  const lowCount = allIngredients.filter((i) => i.confidenceLevel === 'low').length
  return lowCount / allIngredients.length > 0.6
}

export async function POST(request: Request) {
  try {
    const { gemini: apiKey } = getApiKeys()

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Scan service not configured', code: 'SCAN_SERVICE_UNAVAILABLE' },
        { status: 503 }
      )
    }

    let body: Partial<ScanRequest>
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    const { imageBase64, mimeType } = body
    if (!imageBase64 || !mimeType) {
      return NextResponse.json(
        { error: 'imageBase64 and mimeType are required', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      return NextResponse.json(
        { error: 'mimeType must be a supported image format', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    if (imageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      return NextResponse.json(
        { error: 'Image payload too large', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    let text: string
    try {
      const genAI = new GoogleGenerativeAI(apiKey)
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })

      // SEC-DAT-1.00: imageBase64 is passed to Gemini in-memory and discarded after this call.
      // No image data is written to storage, filesystem, or database. (NFR07)
      const result = await model.generateContent([
        { inlineData: { data: imageBase64, mimeType } },
        { text: DISH_SCAN_PROMPT },
      ])

      text = result.response.text()
    } catch (error) {
      console.error('[scan/dish] Gemini error:', error instanceof Error ? error.constructor.name : 'Unknown')
      return NextResponse.json(
        { error: 'Scan service is temporarily unavailable', code: 'SCAN_UNAVAILABLE' },
        { status: 503 }
      )
    }

    const dishes = parseGeminiDishResponse(text)

    if (dishes === null) {
      console.error('[scan/dish] Failed to parse Gemini response as JSON')
      return NextResponse.json(
        { error: 'Gemini returned an unparseable response', code: 'GEMINI_RESPONSE_UNPARSEABLE' },
        { status: 422 }
      )
    }

    const scanResult: ScanResult = {
      scanId: crypto.randomUUID(),
      type: 'dish',
      dishes,
      confidenceSource: requiresInference(dishes) ? 'inference' : 'gemini-only',
    }

    return NextResponse.json({ data: scanResult })
  } catch (error) {
    console.error('[scan/dish] Unexpected error:', error instanceof Error ? error.constructor.name : 'Unknown')
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
