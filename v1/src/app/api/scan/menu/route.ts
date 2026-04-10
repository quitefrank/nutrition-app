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

const MENU_SCAN_PROMPT = `You are a restaurant menu analyser. Analyse this menu image and identify all dishes shown.

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "restaurantName": "string or null",
  "totalDishesOnMenu": number,
  "emptyReason": null,
  "dishes": [
    {
      "name": "string — dish name as written on menu",
      "description": "string — brief description, or empty string if none shown",
      "calorieEstimate": number or null,
      "ingredients": [
        { "name": "string", "quantity": null, "unit": null, "confidenceLevel": "high" }
      ]
    }
  ]
}

Rules:
- restaurantName: the name of the restaurant as printed on the menu (header, logo text, footer). Use null if not visible in this image.
- totalDishesOnMenu: the total count of dishes you can see on this menu (including those you couldn't fully identify)
- Include every dish you CAN fully identify in the "dishes" array
- calorieEstimate: extract if shown on menu, otherwise null
- description: use text from menu; if none, use an empty string ""
- ingredients: extract each ingredient or component listed in the menu text for this dish. Use confidenceLevel "high" for items explicitly listed on the menu. Use [] if no ingredients are listed for a dish.
- emptyReason: only set this when dishes is empty — use one of these exact values:
  - "image_quality" — image is too dark, blurry, or obscured to read
  - "not_menu" — image does not appear to be a menu or food photo
  - "no_dishes_found" — image appears to be a menu but no dishes could be extracted
  - null — dishes array is not empty, or reason is unclear
- If the image is not a menu, return { "restaurantName": null, "totalDishesOnMenu": 0, "emptyReason": "not_menu", "dishes": [] }
- Return valid JSON only — no prose, no markdown fences`

const VALID_EMPTY_REASONS = new Set(['image_quality', 'not_menu', 'no_dishes_found'])
const VALID_CONFIDENCE = new Set(['high', 'medium', 'low'])

function parseIngredients(raw: unknown): IngredientResult[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
    .map((i) => ({
      name: typeof i.name === 'string' ? i.name : 'Unknown',
      quantity: typeof i.quantity === 'string' ? i.quantity : null,
      unit: typeof i.unit === 'string' ? i.unit : null,
      confidenceLevel: VALID_CONFIDENCE.has(i.confidenceLevel as string)
        ? (i.confidenceLevel as 'high' | 'medium' | 'low')
        : 'high',
    }))
}

function parseGeminiMenuResponse(text: string): { dishes: DishResult[]; totalDishesOnMenu: number | null; emptyReason: 'image_quality' | 'not_menu' | 'no_dishes_found' | null; restaurantName: string | null } | null {
  // gemini-2.5-flash may prepend reasoning text before the JSON block even when
  // instructed to return only JSON. Extract the outermost {...} to be robust.
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  const clean = jsonMatch[0]

  let parsed: { dishes: unknown[]; totalDishesOnMenu?: unknown; emptyReason?: unknown; restaurantName?: unknown }
  try {
    parsed = JSON.parse(clean)
  } catch {
    return null
  }

  if (!Array.isArray(parsed?.dishes)) return null

  const dishes = parsed.dishes
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

  const totalDishesOnMenu = Number.isFinite(parsed?.totalDishesOnMenu) && (parsed.totalDishesOnMenu as number) > 0
    ? (parsed.totalDishesOnMenu as number)
    : null

  const emptyReason = typeof parsed?.emptyReason === 'string' && VALID_EMPTY_REASONS.has(parsed.emptyReason)
    ? (parsed.emptyReason as 'image_quality' | 'not_menu' | 'no_dishes_found')
    : null

  const restaurantName = typeof parsed?.restaurantName === 'string' && parsed.restaurantName.trim().length > 0
    ? parsed.restaurantName.trim()
    : null

  return { dishes, totalDishesOnMenu, emptyReason, restaurantName }
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
        { text: MENU_SCAN_PROMPT },
      ])

      text = result.response.text()
    } catch (error) {
      console.error('[scan/menu] Gemini error:', error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error))
      return NextResponse.json(
        { error: 'Scan service is temporarily unavailable', code: 'SCAN_UNAVAILABLE' },
        { status: 503 }
      )
    }

    const parsed = parseGeminiMenuResponse(text)

    if (parsed === null) {
      console.error('[scan/menu] Failed to parse Gemini response as JSON. Raw (first 500):', text?.slice(0, 500))
      return NextResponse.json(
        { error: 'Gemini returned an unparseable response', code: 'GEMINI_RESPONSE_UNPARSEABLE' },
        { status: 422 }
      )
    }

    const scanResult: ScanResult = {
      scanId: crypto.randomUUID(),
      type: 'menu',
      dishes: parsed.dishes,
      confidenceSource: 'gemini-only',
      ...(parsed.restaurantName ? { restaurantName: parsed.restaurantName } : {}),
      ...(parsed.totalDishesOnMenu && parsed.totalDishesOnMenu > parsed.dishes.length
        ? { totalDishCount: parsed.totalDishesOnMenu }
        : {}),
      ...(parsed.dishes.length === 0 && parsed.emptyReason !== null
        ? { emptyReason: parsed.emptyReason }
        : {}),
    }

    return NextResponse.json({ data: scanResult })
  } catch (error) {
    console.error('[scan/menu] Unexpected error:', error instanceof Error ? error.constructor.name : 'Unknown')
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
