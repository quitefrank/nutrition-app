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
  "totalDishesOnMenu": number,
  "emptyReason": null,
  "dishes": [
    {
      "name": "string — dish name as written on menu",
      "description": "string — brief description, or empty string if none shown",
      "calorieEstimate": number or null
    }
  ]
}

Rules:
- totalDishesOnMenu: the total count of dishes you can see on this menu (including those you couldn't fully identify)
- Include every dish you CAN fully identify in the "dishes" array
- calorieEstimate: extract if shown on menu, otherwise null
- description: use text from menu; if none, use an empty string ""
- emptyReason: only set this when dishes is empty — use one of these exact values:
  - "image_quality" — image is too dark, blurry, or obscured to read
  - "not_menu" — image does not appear to be a menu or food photo
  - "no_dishes_found" — image appears to be a menu but no dishes could be extracted
  - null — dishes array is not empty, or reason is unclear
- If the image is not a menu, return { "totalDishesOnMenu": 0, "emptyReason": "not_menu", "dishes": [] }
- Return valid JSON only — no prose, no markdown fences`

const VALID_EMPTY_REASONS = new Set(['image_quality', 'not_menu', 'no_dishes_found'])

function parseGeminiMenuResponse(text: string): { dishes: DishResult[]; totalDishesOnMenu: number | null; emptyReason: 'image_quality' | 'not_menu' | 'no_dishes_found' | null } | null {
  const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  let parsed: { dishes: unknown[]; totalDishesOnMenu?: unknown; emptyReason?: unknown }
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
      ingredients: [] as IngredientResult[],
      imageUrl: null,
    }))

  const totalDishesOnMenu = Number.isFinite(parsed?.totalDishesOnMenu) && (parsed.totalDishesOnMenu as number) > 0
    ? (parsed.totalDishesOnMenu as number)
    : null

  const emptyReason = typeof parsed?.emptyReason === 'string' && VALID_EMPTY_REASONS.has(parsed.emptyReason)
    ? (parsed.emptyReason as 'image_quality' | 'not_menu' | 'no_dishes_found')
    : null

  return { dishes, totalDishesOnMenu, emptyReason }
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

      const result = await model.generateContent([
        { inlineData: { data: imageBase64, mimeType } },
        { text: MENU_SCAN_PROMPT },
      ])

      text = result.response.text()
    } catch (error) {
      console.error('[scan/menu] Gemini error:', error instanceof Error ? `${error.constructor.name}: ${error.message}` : String(error))
      return NextResponse.json(
        { error: 'Gemini service unavailable', code: 'SCAN_SERVICE_UNAVAILABLE' },
        { status: 503 }
      )
    }

    const parsed = parseGeminiMenuResponse(text)

    if (parsed === null) {
      console.error('[scan/menu] Failed to parse Gemini response as JSON')
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
