import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getApiKeys } from '@/lib/api-keys'
import type { DishResult, IngredientResult, SearchDishResponse } from '@/types/api'

const GEMINI_MODEL = 'gemini-2.5-flash'
const USDA_TIMEOUT_MS = 2000

function buildDishPrompt(dishName: string): string {
  return `You are a culinary expert. Generate a recipe for the dish "${dishName}".

Return ONLY valid JSON (no markdown, no explanation) in this exact format:
{
  "name": "string — dish name",
  "description": "string — one sentence description",
  "calorieEstimate": number or null,
  "ingredients": [
    {
      "name": "string",
      "quantity": "string or null",
      "unit": "string or null",
      "confidenceLevel": "high" | "medium" | "low"
    }
  ],
  "imageUrl": null
}

Rules:
- imageUrl is ALWAYS null (no image available for search-generated recipes)
- calorieEstimate: best estimate in kcal, or null if unknown
- confidenceLevel for each ingredient: "high" if standard/universal, "medium" if varies by preparation, "low" if uncertain
- Return valid JSON only`
}

function parseGeminiDishResponse(text: string): DishResult | null {
  const clean = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(clean)
  } catch {
    return null
  }

  if (typeof parsed.name !== 'string') return null

  const rawIngredients = Array.isArray(parsed.ingredients) ? parsed.ingredients : []
  const VALID_CONFIDENCE = new Set(['high', 'medium', 'low'])

  const ingredients: IngredientResult[] = rawIngredients
    .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
    .map((i) => ({
      name: typeof i.name === 'string' ? i.name : 'Unknown',
      quantity: typeof i.quantity === 'string' ? i.quantity : null,
      unit: typeof i.unit === 'string' ? i.unit : null,
      confidenceLevel: VALID_CONFIDENCE.has(i.confidenceLevel as string)
        ? (i.confidenceLevel as 'high' | 'medium' | 'low')
        : 'low',
    }))

  return {
    name: parsed.name,
    description: typeof parsed.description === 'string' ? parsed.description : '',
    calorieEstimate:
      Number.isFinite(parsed.calorieEstimate) && (parsed.calorieEstimate as number) >= 0
        ? (parsed.calorieEstimate as number)
        : null,
    ingredients,
    imageUrl: null,
  }
}

async function checkNutritionAvailable(firstIngredient: string, usdaKey: string): Promise<boolean> {
  if (firstIngredient === 'Unknown') return false

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), USDA_TIMEOUT_MS)

  try {
    const response = await fetch(
      `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(firstIngredient)}`,
      {
        headers: { 'X-Api-Key': usdaKey },
        signal: controller.signal,
      }
    )
    if (!response.ok) return false
    const json = await response.json() as { foods?: unknown[]; totalHits?: number }
    return Array.isArray(json.foods) && json.foods.length > 0
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

const MAX_DISH_NAME_LENGTH = 100

export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams
  const restaurantId = params.get('restaurantId')
  const rawName = params.get('name')
  const name = rawName?.trim().slice(0, MAX_DISH_NAME_LENGTH) ?? ''

  if (!restaurantId || !name) {
    return NextResponse.json(
      { error: 'restaurantId and name parameters are required', code: 'INVALID_REQUEST' },
      { status: 400 }
    )
  }

  const { gemini: geminiKey, usda: usdaKey } = getApiKeys()

  if (!geminiKey) {
    return NextResponse.json(
      { error: 'Dish lookup unavailable', code: 'DISH_LOOKUP_UNAVAILABLE' },
      { status: 503 }
    )
  }

  try {
    const genAI = new GoogleGenerativeAI(geminiKey)
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })

    const result = await model.generateContent(buildDishPrompt(name))
    const text = result.response.text()

    const dish = parseGeminiDishResponse(text)
    if (!dish) {
      console.error('[search/dishes] Failed to parse Gemini response as valid DishResult')
      return NextResponse.json(
        { error: 'Dish lookup unavailable', code: 'DISH_LOOKUP_UNAVAILABLE' },
        { status: 503 }
      )
    }

    let nutritionAvailable = false
    if (dish.ingredients.length > 0 && usdaKey) {
      nutritionAvailable = await checkNutritionAvailable(dish.ingredients[0].name, usdaKey)
    }

    const responseData: SearchDishResponse = { dish, nutritionAvailable }
    return NextResponse.json({ data: responseData })
  } catch (err) {
    console.error('[search/dishes] Gemini error:', err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err))
    return NextResponse.json(
      { error: 'Dish lookup unavailable', code: 'DISH_LOOKUP_UNAVAILABLE' },
      { status: 503 }
    )
  }
}
