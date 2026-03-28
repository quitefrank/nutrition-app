import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getApiKeys } from '@/lib/api-keys'
import type { DishResult } from '@/types/api'

const GEMINI_MODEL = 'gemini-2.5-flash'

function buildDishListPrompt(googlePlacesId: string): string {
  return `You are a culinary expert with knowledge of restaurant menus.
Generate a list of 6–10 typical dishes you would find at a restaurant with Google Places ID "${googlePlacesId}".

If you know this specific restaurant, generate its actual menu items.
If you don't recognise the ID, generate typical dishes for a casual dining restaurant.

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "dishes": [
    {
      "name": "string — dish name",
      "description": "string — one sentence description",
      "calorieEstimate": number or null,
      "ingredients": [],
      "imageUrl": null
    }
  ]
}

Rules:
- ingredients is ALWAYS an empty array [] — ingredient detail is fetched separately per dish
- imageUrl is ALWAYS null
- calorieEstimate: best estimate in kcal, or null if unknown
- Generate 6–10 dishes
- Return valid JSON only`
}

function parseGeminiDishListResponse(text: string): DishResult[] | null {
  const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(clean)
  } catch {
    return null
  }

  if (!Array.isArray(parsed.dishes)) return null

  return parsed.dishes
    .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
    .map((d) => ({
      name: typeof d.name === 'string' ? d.name : 'Unknown',
      description: typeof d.description === 'string' ? d.description : '',
      calorieEstimate:
        Number.isFinite(d.calorieEstimate) && (d.calorieEstimate as number) >= 0
          ? (d.calorieEstimate as number)
          : null,
      ingredients: [],
      imageUrl: null,
    }))
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ googlePlacesId: string }> }
) {
  const { googlePlacesId } = await params

  if (!googlePlacesId || !/^[A-Za-z0-9_-]+$/.test(googlePlacesId)) {
    return NextResponse.json(
      { error: 'googlePlacesId is required', code: 'INVALID_REQUEST' },
      { status: 400 }
    )
  }

  const { gemini: geminiKey } = getApiKeys()

  if (!geminiKey) {
    return NextResponse.json(
      { error: 'Dish list unavailable', code: 'DISH_LIST_UNAVAILABLE' },
      { status: 503 }
    )
  }

  try {
    const genAI = new GoogleGenerativeAI(geminiKey)
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })

    const result = await model.generateContent(buildDishListPrompt(googlePlacesId))
    const text = result.response.text()

    const dishes = parseGeminiDishListResponse(text)
    if (!dishes) {
      console.error('[search/restaurants/dishes] Failed to parse Gemini response as DishResult[]')
      return NextResponse.json(
        { error: 'Dish list unavailable', code: 'DISH_LIST_UNAVAILABLE' },
        { status: 503 }
      )
    }

    return NextResponse.json({ data: dishes })
  } catch (err) {
    console.error(
      '[search/restaurants/dishes] Gemini error:',
      err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err)
    )
    return NextResponse.json(
      { error: 'Dish list unavailable', code: 'DISH_LIST_UNAVAILABLE' },
      { status: 503 }
    )
  }
}
