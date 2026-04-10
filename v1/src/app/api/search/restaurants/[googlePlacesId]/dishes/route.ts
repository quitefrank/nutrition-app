import 'server-only'
import { NextRequest } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { getApiKeys } from '@/lib/api-keys'
import type { DishResult } from '@/types/api'

const GEMINI_MODEL = 'gemini-2.5-flash'
const BATCH_SIZE = 5
const MAX_PHOTOS = 10
const PHOTO_MAX_WIDTH_PX = 1600
const WEBSITE_FETCH_TIMEOUT_MS = 8_000

// ─── SSE helpers ───────────────────────────────────────────────────────────────

function sseEvent(type: string, data: unknown): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
}

function makeStream(): { readable: ReadableStream; send: (chunk: string) => void; close: () => void } {
  let controller: ReadableStreamDefaultController<Uint8Array>
  const readable = new ReadableStream<Uint8Array>({
    start(c) { controller = c },
  })
  const enc = new TextEncoder()
  return {
    readable,
    send: (chunk: string) => controller.enqueue(enc.encode(chunk)),
    close: () => controller.close(),
  }
}

// ─── Places API ────────────────────────────────────────────────────────────────

interface PlacePhoto { name: string }
interface PlaceDetails { photos?: PlacePhoto[]; websiteUri?: string }

async function fetchPlaceDetails(googlePlacesId: string, apiKey: string): Promise<PlaceDetails> {
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${googlePlacesId}`, {
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'photos,websiteUri',
      },
    })
    if (!res.ok) return {}
    return res.json() as Promise<PlaceDetails>
  } catch {
    return {}
  }
}

interface PhotoData { base64: string; mimeType: string; uri: string }

async function fetchPhotoAsBase64(photoName: string, apiKey: string): Promise<PhotoData | null> {
  try {
    const mediaRes = await fetch(
      `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${PHOTO_MAX_WIDTH_PX}&key=${apiKey}&skipHttpRedirect=true`
    )
    if (!mediaRes.ok) return null
    const mediaJson = await mediaRes.json() as { photoUri?: string }
    const uri = mediaJson.photoUri
    if (!uri?.startsWith('https://')) return null

    const imgRes = await fetch(uri)
    if (!imgRes.ok) return null
    const mimeType = (imgRes.headers.get('content-type') ?? 'image/jpeg').split(';')[0]
    const base64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64')
    return { base64, mimeType, uri }
  } catch {
    return null
  }
}

// ─── Website fetch ─────────────────────────────────────────────────────────────

async function fetchWebsiteText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Plately/1.0)' },
    })
    clearTimeout(timer)
    if (!res.ok) return null

    const html = await res.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 15_000)
    return text || null
  } catch {
    return null
  }
}

// ─── Gemini helpers ────────────────────────────────────────────────────────────

// Schema used when scanning photos — hasMenuText lets us distinguish
// "found real menu text" from "Gemini generated from food photos"
const PHOTO_SCAN_SCHEMA = `{
  "hasMenuText": true,
  "dishes": [
    {
      "name": "dish name",
      "description": "one sentence description",
      "calorieEstimate": number or null,
      "ingredients": [],
      "imageUrl": null
    }
  ]
}`

const PHOTO_SCAN_RULES = `Rules:
- Set hasMenuText to TRUE only if you found and read actual menu text, a menu board, or a printed dish list in one of the photos
- Set hasMenuText to FALSE if the photos only show food/decor/people with no readable menu text — set dishes to [] in that case
- ingredients is ALWAYS []
- imageUrl is ALWAYS null
- calorieEstimate: best estimate in kcal, or null if unknown
- Return 6–15 dishes when hasMenuText is true
- Return valid JSON only, no markdown`

const TEXT_EXTRACT_SCHEMA = `{
  "dishes": [
    {
      "name": "dish name",
      "description": "one sentence description",
      "calorieEstimate": number or null,
      "ingredients": [],
      "imageUrl": null
    }
  ]
}`

const TEXT_EXTRACT_RULES = `Rules:
- ingredients is ALWAYS []
- imageUrl is ALWAYS null
- calorieEstimate: best estimate in kcal, or null if unknown
- Return 6–15 dishes
- Return valid JSON only, no markdown`

async function fetchDishImages(
  dishes: DishResult[],
  restaurantName: string,
  cseKey: string | undefined,
  cseCx: string | undefined,
): Promise<DishResult[]> {
  // If CSE is not configured, return dishes with no images rather than wrong round-robin photos
  if (!cseKey || !cseCx) {
    console.log('[search/restaurants/dishes] CSE not configured — skipping image lookup')
    return dishes.map(d => ({ ...d, imageUrl: null }))
  }

  return Promise.all(
    dishes.map(async (dish) => {
      try {
        const params = new URLSearchParams({
          key: cseKey,
          cx: cseCx,
          q: `${restaurantName} ${dish.name} food`,
          searchType: 'image',
          num: '1',
          safe: 'active',
          imgType: 'photo',
          imgSize: 'medium',
        })
        const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`)
        if (res.ok) {
          const data = await res.json() as { items?: Array<{ link?: string }> }
          const link = data?.items?.[0]?.link
          if (typeof link === 'string' && link.startsWith('https://')) {
            return { ...dish, imageUrl: link }
          }
        }
        console.log(`[search/restaurants/dishes] CSE: no image for "${dish.name}"`)
      } catch (e) {
        console.log(`[search/restaurants/dishes] CSE error for "${dish.name}":`, e)
      }
      return { ...dish, imageUrl: null }
    })
  )
}

function parseDishList(text: string): DishResult[] | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(match[0]) } catch { return null }
  if (!Array.isArray(parsed.dishes)) return null
  return (parsed.dishes as unknown[])
    .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
    .map(d => ({
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

async function extractDishesFromPhotos(
  photos: PhotoData[],
  restaurantName: string,
  geminiKey: string,
): Promise<DishResult[] | null> {
  const genAI = new GoogleGenerativeAI(geminiKey)
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })

  const result = await model.generateContent([
    {
      text: `These are ${photos.length} photos from "${restaurantName}" sourced from Google Maps.

CRITICAL TASK — follow these steps in order:
1. Look through EVERY photo carefully for any image that contains readable text listing dishes — a printed menu, menu board, chalkboard menu, tablet menu screen, or any menu-style list of dish names with prices or descriptions.
2. If you find such an image: set hasMenuText to TRUE and extract every dish name you can read.
3. If NO photo contains readable menu text (all photos are food close-ups, ambiance shots, exterior photos, or people): set hasMenuText to FALSE and return an empty dishes array. DO NOT invent dish names.

Return ONLY valid JSON:\n${PHOTO_SCAN_SCHEMA}\n${PHOTO_SCAN_RULES}`,
    },
    ...photos.map(p => ({ inlineData: { mimeType: p.mimeType, data: p.base64 } })),
  ])

  const raw = result.response.text()

  // Parse the full response including hasMenuText
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return null
  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(match[0]) } catch { return null }

  // If Gemini explicitly says no menu text found, treat as no result
  if (parsed.hasMenuText === false) {
    console.log('[search/restaurants/dishes] photo scan: Gemini confirmed no menu text in this batch')
    return null
  }

  return parseDishList(raw)
}

async function extractDishesFromWebsite(
  websiteText: string,
  restaurantName: string,
  geminiKey: string,
): Promise<DishResult[] | null> {
  const genAI = new GoogleGenerativeAI(geminiKey)
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })

  const result = await model.generateContent(
    `The following text was extracted from the website of "${restaurantName}".
Extract any menu items present. If no menu items exist, return {"dishes":[]}.

Website text:
${websiteText}

Return ONLY valid JSON:\n${TEXT_EXTRACT_SCHEMA}\n${TEXT_EXTRACT_RULES}`
  )

  const dishes = parseDishList(result.response.text())
  return dishes && dishes.length > 0 ? dishes : null
}

async function generateDishesFromName(
  restaurantName: string,
  geminiKey: string,
): Promise<DishResult[] | null> {
  const genAI = new GoogleGenerativeAI(geminiKey)
  const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })

  const result = await model.generateContent(
    `You are a culinary expert. Generate 6–10 typical dishes for "${restaurantName}" based on its cuisine style.
Return ONLY valid JSON:\n${TEXT_EXTRACT_SCHEMA}\n${TEXT_EXTRACT_RULES}`
  )

  return parseDishList(result.response.text())
}

// ─── Route handler (SSE) ───────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ googlePlacesId: string }> },
) {
  const { googlePlacesId } = await params
  const restaurantName = req.nextUrl.searchParams.get('restaurantName')?.trim() || null

  if (!googlePlacesId || !/^[A-Za-z0-9_-]+$/.test(googlePlacesId)) {
    return new Response(
      JSON.stringify({ error: 'googlePlacesId is required', code: 'INVALID_REQUEST' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  if (!restaurantName) {
    return new Response(
      JSON.stringify({ error: 'restaurantName is required', code: 'INVALID_REQUEST' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const { gemini: geminiKey, places: placesKey, cseKey, cseCx } = getApiKeys()

  if (!geminiKey) {
    return new Response(
      JSON.stringify({ error: 'Dish list unavailable', code: 'DISH_LIST_UNAVAILABLE' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const { readable, send, close } = makeStream()

  // Run the pipeline asynchronously and stream events back
  void (async () => {
    try {
      // ── 1. Place details (photos + website) ─────────────────────────────────
      const placeDetails = placesKey
        ? await fetchPlaceDetails(googlePlacesId, placesKey)
        : {}

      const photoRefs = (placeDetails.photos ?? []).slice(0, MAX_PHOTOS)
      const totalPhotos = photoRefs.length

      // ── 2. Batch photo scan ──────────────────────────────────────────────────
      if (totalPhotos > 0 && placesKey) {
        const batches: PlacePhoto[][] = []
        for (let i = 0; i < totalPhotos; i += BATCH_SIZE) {
          batches.push(photoRefs.slice(i, i + BATCH_SIZE))
        }

        for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
          const batch = batches[batchIdx]
          const start = batchIdx * BATCH_SIZE + 1
          const end = start + batch.length - 1

          send(sseEvent('status', {
            message: `Scanning photos ${start}–${end} of ${totalPhotos}…`,
            batch: batchIdx + 1,
            totalBatches: batches.length,
          }))

          const photoData = (
            await Promise.all(batch.map(p => fetchPhotoAsBase64(p.name, placesKey!)))
          ).filter((p): p is PhotoData => p !== null)

          if (photoData.length === 0) continue

          const dishes = await extractDishesFromPhotos(photoData, restaurantName, geminiKey)

          if (dishes && dishes.length > 0) {
            send(sseEvent('status', { message: 'Menu found! Adding images…' }))
            console.log(`[search/restaurants/dishes] batch ${batchIdx + 1} → ${dishes.length} dishes`)
            const withImages = await fetchDishImages(dishes, restaurantName, cseKey, cseCx)
            send(sseEvent('dishes', { dishes: withImages }))
            close()
            return
          }

          console.log(`[search/restaurants/dishes] batch ${batchIdx + 1}: no menu found`)
        }
      }

      // ── 3. Website → Gemini text ─────────────────────────────────────────────
      if (placeDetails.websiteUri) {
        send(sseEvent('status', { message: 'Checking restaurant website…' }))
        const text = await fetchWebsiteText(placeDetails.websiteUri)
        if (text) {
          const dishes = await extractDishesFromWebsite(text, restaurantName, geminiKey)
          if (dishes && dishes.length > 0) {
            send(sseEvent('status', { message: 'Menu found! Adding images…' }))
            console.log(`[search/restaurants/dishes] website → ${dishes.length} dishes`)
            const withImages = await fetchDishImages(dishes, restaurantName, cseKey, cseCx)
            send(sseEvent('dishes', { dishes: withImages }))
            close()
            return
          }
        }
      }

      // ── 4. Name-based generation (final fallback) ────────────────────────────
      send(sseEvent('status', { message: `Generating menu for ${restaurantName}…` }))
      console.log('[search/restaurants/dishes] falling back to name-based generation')
      const dishes = await generateDishesFromName(restaurantName, geminiKey)

      if (!dishes) {
        send(sseEvent('error', { error: 'Dish list unavailable', code: 'DISH_LIST_UNAVAILABLE' }))
        close()
        return
      }

      const withImages = await fetchDishImages(dishes, restaurantName, cseKey, cseCx)
      send(sseEvent('dishes', { dishes: withImages }))
      close()

    } catch (err) {
      console.error(
        '[search/restaurants/dishes] unhandled error:',
        err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err),
      )
      send(sseEvent('error', { error: 'Dish list unavailable', code: 'DISH_LIST_UNAVAILABLE' }))
      close()
    }
  })()

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
