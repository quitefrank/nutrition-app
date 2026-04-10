import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'
import { getRestaurantPhotos } from '@/lib/placesPhotos'
import { getCachedMenu } from '@/lib/menuCache'

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_FALLBACK_MODEL = 'gemini-2.0-flash'

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

// ─── Scan prompt + schemas (mirrors /api/scan) ───────────────────────────────

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
- Return valid JSON only — no prose, no markdown fences`

const IngredientSchema = z.object({
  name: z.string().catch(''),
  quantity: z.string().nullable().optional().catch(null),
  unit: z.string().nullable().optional().catch(null),
  confidenceLevel: z.enum(['high', 'medium', 'low']).catch('medium'),
})

const DishSchema = z.object({
  name: z.string().catch(''),
  description: z
    .string()
    .catch('')
    .transform((v) => (v === 'null' || v === 'undefined' ? '' : v)),
  calorieEstimate: z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .transform((v) => {
      const n = typeof v === 'string' ? parseFloat(v) : v
      return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : null
    })
    .catch(null),
  confidence: z
    .number()
    .catch(0.8)
    .transform((v) => Math.max(0, Math.min(1, v))),
  ingredients: z.array(IngredientSchema).catch([]),
})

const GeminiResponseSchema = z.object({
  type: z.enum(['menu', 'dish']).catch('dish'),
  restaurantName: z.string().nullable().optional().catch(null),
  dishes: z.array(DishSchema).catch([]),
})

// ─── Classification schema ────────────────────────────────────────────────────

const ClassifySchema = z.object({
  menuIndices: z.array(z.number().int().min(0)).catch([]),
  dishPhotos: z
    .array(
      z.object({
        index: z.number().int().min(0),
        name: z.string().catch(''),
      })
    )
    .catch([]),
})

// ─── Request schema ───────────────────────────────────────────────────────────

const RequestSchema = z.object({
  placeId: z.string().min(1).max(300),
  restaurantName: z.string().optional(),
})

// ─── Word-overlap photo matcher ───────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function bestMatchUrl(
  menuItem: string,
  indexed: { name: string; url: string }[]
): string | null {
  const words = normalize(menuItem).split(' ').filter(Boolean)
  if (words.length === 0 || indexed.length === 0) return null
  let bestScore = 0
  let bestUrl: string | null = null
  for (const p of indexed) {
    const pWords = normalize(p.name).split(' ').filter(Boolean)
    const overlap = words.filter((w) => pWords.includes(w)).length
    const score = overlap / Math.max(words.length, pWords.length)
    if (score > bestScore && score >= 0.4) {
      bestScore = score
      bestUrl = p.url
    }
  }
  return bestUrl
}

// ─── Helper: call Gemini with 2.0-flash fallback on 503 ──────────────────────

async function generateWithFallback(
  genAI: GoogleGenerativeAI,
  parts: Parameters<ReturnType<GoogleGenerativeAI['getGenerativeModel']>['generateContent']>[0]
) {
  try {
    return await genAI.getGenerativeModel({ model: GEMINI_MODEL }).generateContent(parts)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('503')) {
      console.warn('[auto-scan] gemini-2.5-flash 503 — retrying with gemini-2.0-flash')
      return genAI.getGenerativeModel({ model: GEMINI_FALLBACK_MODEL }).generateContent(parts)
    }
    throw err
  }
}

// ─── Helper: parse Gemini text to JSON ───────────────────────────────────────

function parseGeminiJson(raw: string): unknown | null {
  const clean = raw
    .replace(/^```(?:json)?\n?/m, '')
    .replace(/\n?```$/m, '')
    .trim()
  try {
    return JSON.parse(clean)
  } catch {
    return null
  }
}

// ─── Photo data type ──────────────────────────────────────────────────────────

interface PhotoData {
  url: string
  base64: string
  mimeType: string
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    // ── Resolve API keys ─────────────────────────────────────────────────────
    const placesKey = process.env.GOOGLE_PLACES_API_KEY
    if (!placesKey) {
      return NextResponse.json(
        { error: 'Places service not configured', code: 'PLACES_SERVICE_UNAVAILABLE' },
        { status: 503 }
      )
    }

    // SEC-DAT-1.00: never log the key value
    const userKeyHeader = req.headers.get('X-User-Gemini-Key') ?? ''
    const envKey = process.env.GEMINI_API_KEY ?? ''
    let apiKey: string
    if (userKeyHeader && userKeyHeader.startsWith('AI') && userKeyHeader.length >= 39) {
      apiKey = userKeyHeader
    } else if (envKey) {
      apiKey = envKey
    } else {
      return NextResponse.json(
        { error: 'Scan service not configured', code: 'SCAN_SERVICE_UNAVAILABLE' },
        { status: 503 }
      )
    }

    // ── Parse request ────────────────────────────────────────────────────────
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid request body', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    const parsed = RequestSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'placeId is required', code: 'INVALID_REQUEST' },
        { status: 400 }
      )
    }

    const { placeId, restaurantName } = parsed.data

    // ── Cache check: return cached menu if available (skip Gemini entirely) ──
    const cached = await getCachedMenu({ placeId, name: restaurantName })
    if (cached) {
      const dishesWithPhotos = cached.dishes.map((d) => ({
        id: crypto.randomUUID(),
        name: d.name,
        description: d.description ?? '',
        calorieEstimate: d.calorieEstimate ?? null,
        confidence: 0.9,
        ingredients: [] as unknown[],
        photoUrl: null as string | null,
      }))
      return NextResponse.json({
        data: {
          restaurantName: restaurantName ?? null,
          dishes: dishesWithPhotos,
          menuPhotoUrl: null,
          dishPhotos: [] as Array<{ name: string; url: string }>,
          fromCache: true,
        },
      })
    }

    // ── Step 1: Fetch photo URLs ─────────────────────────────────────────────
    const photoUrls = await getRestaurantPhotos({ placeId }, placesKey, 20)
    if (photoUrls.length < 2) {
      return NextResponse.json(
        { error: 'Not enough photos found for this restaurant', code: 'NO_PHOTOS' },
        { status: 503 }
      )
    }

    // ── Step 2: Fetch + base64-encode photos in parallel (8s timeout each) ──
    const photoDataResults = await Promise.allSettled(
      photoUrls.map(async (url): Promise<PhotoData> => {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 8000)
        try {
          // SEC-SEC-1.00: URLs already validated as HTTPS by getRestaurantPhotos
          const res = await fetch(url, { signal: controller.signal })
          if (!res.ok) throw new Error('fetch failed')
          const contentType = res.headers.get('content-type') ?? 'image/jpeg'
          const mimeType = contentType.split(';')[0].trim()
          if (!ALLOWED_MIME_TYPES.has(mimeType)) throw new Error('unsupported mime type')
          const buf = await res.arrayBuffer()
          return { url, base64: Buffer.from(buf).toString('base64'), mimeType }
        } finally {
          clearTimeout(timer)
        }
      })
    )

    const photos: PhotoData[] = photoDataResults
      .filter((r): r is PromiseFulfilledResult<PhotoData> => r.status === 'fulfilled')
      .map((r) => r.value)

    if (photos.length === 0) {
      return NextResponse.json(
        { error: 'Could not retrieve restaurant photos', code: 'NO_PHOTOS' },
        { status: 503 }
      )
    }

    // ── Step 3: Multi-image Gemini classification ────────────────────────────
    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })

    const labelName = restaurantName ? `"${restaurantName}"` : 'this restaurant'
    const classifyPrompt = `Here are ${photos.length} photos from ${labelName}. For each photo (0-indexed):
- If it shows a printed or digital MENU (a list of dish names, possibly with prices or descriptions), classify it as a menu.
- If it shows a plated food dish, identify the dish name.
Return ONLY valid JSON, no markdown:
{
  "menuIndices": [0-based indices of menu photos],
  "dishPhotos": [{ "index": N, "name": "dish name" }]
}`

    let classifyRaw: string
    try {
      const classifyResult = await generateWithFallback(genAI, [
        ...photos.map((p) => ({ inlineData: { data: p.base64, mimeType: p.mimeType } })),
        { text: classifyPrompt },
      ])
      classifyRaw = classifyResult.response.text()
    } catch (err) {
      console.error('[auto-scan] Gemini classification error:', err instanceof Error ? err.message : err)
      return NextResponse.json(
        { error: 'Photo classification failed', code: 'SCAN_UNAVAILABLE' },
        { status: 503 }
      )
    }

    const classifyJson = parseGeminiJson(classifyRaw)
    if (!classifyJson) {
      console.error('[auto-scan] classification non-JSON:', classifyRaw.slice(0, 200))
    }

    const classifyValidated = ClassifySchema.safeParse(classifyJson ?? {})
    const { menuIndices, dishPhotos } = classifyValidated.success
      ? classifyValidated.data
      : { menuIndices: [], dishPhotos: [] }

    // Build indexed dish photos list (used for matching and fallback)
    const indexedDishPhotos = dishPhotos
      .filter((dp) => dp.index < photos.length && dp.name.trim())
      .map((dp) => ({ name: dp.name, url: photos[dp.index].url }))

    // ── Step 4: No menu found → return fallback ──────────────────────────────
    const validMenuIndices = menuIndices.filter((i) => i < photos.length)

    if (validMenuIndices.length === 0) {
      return NextResponse.json({
        data: {
          restaurantName: restaurantName ?? null,
          dishes: [],
          menuPhotoUrl: null,
          dishPhotos: indexedDishPhotos,
        },
      })
    }

    // ── Step 5: Scan the menu photo(s) ───────────────────────────────────────
    type ScannedDish = z.infer<typeof DishSchema> & {
      id: string
      photoUrl: string | null
    }

    let scannedDishes: ScannedDish[] | null = null
    let menuPhotoUrl: string | null = null

    for (const menuIdx of validMenuIndices) {
      const menuPhoto = photos[menuIdx]

      let scanRaw: string
      try {
        const scanResult = await generateWithFallback(genAI, [
          { inlineData: { data: menuPhoto.base64, mimeType: menuPhoto.mimeType } },
          { text: SCAN_PROMPT },
        ])
        scanRaw = scanResult.response.text()
      } catch (err) {
        console.warn('[auto-scan] scan attempt failed for index', menuIdx, err instanceof Error ? err.message : err)
        continue
      }

      const scanJson = parseGeminiJson(scanRaw)
      if (!scanJson) continue

      const scanValidated = GeminiResponseSchema.safeParse(scanJson)
      if (!scanValidated.success) continue

      const validDishes = scanValidated.data.dishes.filter((d) => d.name.trim())
      if (validDishes.length === 0) continue

      scannedDishes = validDishes.map((d) => ({
        ...d,
        id: crypto.randomUUID(),
        ingredients: d.ingredients.filter((i) => i.name.trim()),
        photoUrl: null, // filled in step 6
      }))
      menuPhotoUrl = menuPhoto.url
      break
    }

    // All menu photos yielded no dishes → return fallback
    if (!scannedDishes) {
      return NextResponse.json({
        data: {
          restaurantName: restaurantName ?? null,
          dishes: [],
          menuPhotoUrl: null,
          dishPhotos: indexedDishPhotos,
        },
      })
    }

    // ── Step 6: Match menu items to dish photos by word overlap ───────────────
    const dishesWithPhotos = scannedDishes.map((dish) => ({
      ...dish,
      photoUrl: bestMatchUrl(dish.name, indexedDishPhotos),
    }))

    return NextResponse.json({
      data: {
        restaurantName: restaurantName ?? null,
        dishes: dishesWithPhotos,
        menuPhotoUrl,
        dishPhotos: indexedDishPhotos,
      },
    })
  } catch (err) {
    console.error('[auto-scan] Unexpected error:', err instanceof Error ? err.message : err)
    return NextResponse.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }
}
