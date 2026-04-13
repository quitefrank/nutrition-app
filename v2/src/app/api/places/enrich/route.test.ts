import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockGetApiKeys = vi.hoisted(() =>
  vi.fn(() => ({ places: 'places-test-key' as string | undefined }))
)
const mockGetRestaurantPhotos = vi.hoisted(() => vi.fn().mockResolvedValue([]))
const mockSupabaseFrom = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-keys', () => ({ getApiKeys: mockGetApiKeys }))
vi.mock('@/lib/placesPhotos', () => ({ getRestaurantPhotos: mockGetRestaurantPhotos }))
vi.mock('@/lib/supabase', () => ({ supabase: { from: mockSupabaseFrom } }))

import { POST } from './route'

// ─── Types ────────────────────────────────────────────────────────────────────

type RestaurantRow = { id: string; place_id: string | null; reference_image_url: string | null }
type RecipeRow = { id: string; photo_status: string; dish_image_url: string | null }
type DbError = { message: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/places/enrich', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * Configures the supabase mock for a single route invocation.
 *
 * Supports optional error injection for restaurant/recipe fetch and recipe
 * updates (P1: Supabase error handling coverage).
 */
function setupSupabaseMock({
  restaurant,
  recipes,
  restaurantError = null,
  recipesError = null,
  recipeUpdateError = null,
}: {
  restaurant: RestaurantRow | null
  recipes: RecipeRow[]
  restaurantError?: DbError | null
  recipesError?: DbError | null
  recipeUpdateError?: DbError | null
}) {
  const recipeUpdateEq = vi.fn().mockResolvedValue({ error: recipeUpdateError })
  const recipeUpdate = vi.fn(() => ({ eq: recipeUpdateEq }))

  const restaurantUpdateEq = vi.fn().mockResolvedValue({ error: null })
  const restaurantUpdate = vi.fn(() => ({ eq: restaurantUpdateEq }))

  mockSupabaseFrom.mockImplementation((table: string) => {
    if (table === 'restaurants') {
      const maybeSingle = vi.fn().mockResolvedValue({
        data: restaurantError ? null : restaurant,
        error: restaurantError,
      })
      const eqFn = vi.fn(() => ({ maybeSingle }))
      const selectFn = vi.fn(() => ({ eq: eqFn }))
      return { select: selectFn, update: restaurantUpdate }
    }
    if (table === 'recipes') {
      const neqFn = vi.fn().mockResolvedValue({
        data: recipesError ? null : recipes,
        error: recipesError,
      })
      const eqFn = vi.fn(() => ({ neq: neqFn }))
      const selectFn = vi.fn(() => ({ eq: eqFn }))
      return { select: selectFn, update: recipeUpdate }
    }
  })

  return { recipeUpdate, recipeUpdateEq, restaurantUpdate, restaurantUpdateEq }
}

// UUIDs used across tests
const RESTAURANT_UUID = '00000000-0000-4000-8000-000000000001'

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/places/enrich', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetApiKeys.mockReturnValue({ places: 'places-test-key' })
    mockGetRestaurantPhotos.mockResolvedValue([])
  })

  // ─── Key and input validation ─────────────────────────────────────────────

  describe('key and input validation', () => {
    it('missing Places API key → 503, nested error { code: "PLACES_SERVICE_UNAVAILABLE" }', async () => {
      mockGetApiKeys.mockReturnValue({ places: undefined })
      const res = await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.error).toMatchObject({ message: expect.any(String), code: 'PLACES_SERVICE_UNAVAILABLE' })
      expect(typeof body.error).toBe('object')
    })

    it('invalid JSON body → 400, nested error { code: "INVALID_REQUEST" }', async () => {
      const res = await POST(
        new NextRequest('http://localhost/api/places/enrich', {
          method: 'POST',
          body: 'not-json',
          headers: { 'Content-Type': 'application/json' },
        })
      )
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.error).toMatchObject({ code: 'INVALID_REQUEST' })
      expect(typeof body.error).toBe('object')
    })

    it('missing restaurantId → 422, nested error { code: "VALIDATION_ERROR" }', async () => {
      const res = await POST(makeReq({}))
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
    })

    it('non-UUID restaurantId → 422, nested error { code: "VALIDATION_ERROR" }', async () => {
      const res = await POST(makeReq({ restaurantId: 'not-a-uuid' }))
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
    })
  })

  // ─── Database lookup ──────────────────────────────────────────────────────

  describe('database lookup', () => {
    it('restaurant not found in DB → 404, nested error { code: "NOT_FOUND" }', async () => {
      setupSupabaseMock({ restaurant: null, recipes: [] })
      const res = await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toMatchObject({ code: 'NOT_FOUND' })
      expect(typeof body.error).toBe('object')
    })

    // P1: Supabase error on restaurant fetch
    it('Supabase error on restaurant fetch → 503, nested error { code: "DATABASE_ERROR" }', async () => {
      setupSupabaseMock({
        restaurant: null,
        recipes: [],
        restaurantError: { message: 'connection refused' },
      })
      const res = await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.error).toMatchObject({ code: 'DATABASE_ERROR' })
    })

    // P1: Supabase error on recipes fetch
    it('Supabase error on recipes fetch → 503, nested error { code: "DATABASE_ERROR" }', async () => {
      setupSupabaseMock({
        restaurant: { id: RESTAURANT_UUID, place_id: 'place-abc', reference_image_url: null },
        recipes: [],
        recipesError: { message: 'timeout' },
      })
      const res = await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.error).toMatchObject({ code: 'DATABASE_ERROR' })
    })
  })

  // ─── Early-exit (skip) paths ──────────────────────────────────────────────

  describe('early-exit paths', () => {
    it('restaurant has no place_id (null) → 200, data.skipped: true, reason: "no_place_id"', async () => {
      setupSupabaseMock({
        restaurant: { id: RESTAURANT_UUID, place_id: null, reference_image_url: null },
        recipes: [],
      })
      const res = await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toMatchObject({
        restaurantId: RESTAURANT_UUID,
        photosAssigned: 0,
        skipped: true,
        reason: 'no_place_id',
      })
    })

    // P6: empty string place_id must also skip (P3 in route.ts)
    it('restaurant has empty-string place_id → 200, data.skipped: true, reason: "no_place_id"', async () => {
      setupSupabaseMock({
        restaurant: { id: RESTAURANT_UUID, place_id: '', reference_image_url: null },
        recipes: [],
      })
      const res = await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toMatchObject({
        skipped: true,
        reason: 'no_place_id',
      })
      expect(mockGetRestaurantPhotos).not.toHaveBeenCalled()
    })

    it('all recipes confirmed + reference_image_url set → 200, data.skipped: true, reason: "already_enriched"', async () => {
      setupSupabaseMock({
        // P2: reference_image_url must be set for already_enriched to fire
        restaurant: { id: RESTAURANT_UUID, place_id: 'place-abc', reference_image_url: 'https://cover.jpg' },
        recipes: [
          { id: 'r1', photo_status: 'confirmed', dish_image_url: 'https://img.example.com/1.jpg' },
          { id: 'r2', photo_status: 'confirmed', dish_image_url: 'https://img.example.com/2.jpg' },
        ],
      })
      const res = await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toMatchObject({ skipped: true, reason: 'already_enriched' })
    })

    // P5: suppressed recipes do not block the already_enriched cache
    it('all recipes confirmed + suppressed + reference_image_url set → 200, skipped, already_enriched', async () => {
      setupSupabaseMock({
        restaurant: { id: RESTAURANT_UUID, place_id: 'place-abc', reference_image_url: 'https://cover.jpg' },
        recipes: [
          { id: 'r1', photo_status: 'confirmed', dish_image_url: 'https://img.example.com/1.jpg' },
          { id: 'r2', photo_status: 'suppressed', dish_image_url: null },
        ],
      })
      const res = await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toMatchObject({ skipped: true, reason: 'already_enriched' })
    })
  })

  // ─── Photo assignment — first enrichment pass (reference_image_url: null) ─

  describe('photo assignment (first enrichment pass)', () => {
    it('Places returns 2 photos, 5 placeholder recipes → photosAssigned: 5 (round-robin reuse), 5 recipe UPDATE calls', async () => {
      const { recipeUpdate, restaurantUpdate } = setupSupabaseMock({
        // reference_image_url: null → first enrichment pass, calls Places
        restaurant: { id: RESTAURANT_UUID, place_id: 'place-abc', reference_image_url: null },
        recipes: [
          { id: 'r1', photo_status: 'placeholder', dish_image_url: null },
          { id: 'r2', photo_status: 'placeholder', dish_image_url: null },
          { id: 'r3', photo_status: 'placeholder', dish_image_url: null },
          { id: 'r4', photo_status: 'placeholder', dish_image_url: null },
          { id: 'r5', photo_status: 'placeholder', dish_image_url: null },
        ],
      })
      mockGetRestaurantPhotos.mockResolvedValue([
        'https://photos.example.com/a.jpg',
        'https://photos.example.com/b.jpg',
      ])
      const res = await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toMatchObject({ restaurantId: RESTAURANT_UUID, photosAssigned: 5 })
      expect(recipeUpdate).toHaveBeenCalledTimes(5)
      // reference_image_url was null → restaurant cover photo gets set
      expect(restaurantUpdate).toHaveBeenCalledWith({ reference_image_url: 'https://photos.example.com/a.jpg' })
    })

    it('Places returns 0 photos → photosAssigned: 0, no recipe UPDATE calls', async () => {
      const { recipeUpdate } = setupSupabaseMock({
        restaurant: { id: RESTAURANT_UUID, place_id: 'place-abc', reference_image_url: null },
        recipes: [
          { id: 'r1', photo_status: 'placeholder', dish_image_url: null },
          { id: 'r2', photo_status: 'placeholder', dish_image_url: null },
        ],
      })
      mockGetRestaurantPhotos.mockResolvedValue([])
      const res = await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.data).toMatchObject({ restaurantId: RESTAURANT_UUID, photosAssigned: 0 })
      expect(recipeUpdate).not.toHaveBeenCalled()
    })

    // P5: suppressed recipes do not receive photo assignment; placeholders are enriched
    it('suppressed recipes do not block enrichment of placeholder recipes', async () => {
      const { recipeUpdate } = setupSupabaseMock({
        restaurant: { id: RESTAURANT_UUID, place_id: 'place-abc', reference_image_url: null },
        recipes: [
          { id: 'r1', photo_status: 'suppressed', dish_image_url: null },
          { id: 'r2', photo_status: 'placeholder', dish_image_url: null },
        ],
      })
      mockGetRestaurantPhotos.mockResolvedValue(['https://photos.example.com/a.jpg'])
      const res = await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      expect(res.status).toBe(200)
      const body = await res.json()
      // Only r2 (placeholder) gets a photo; r1 (suppressed) is never updated
      expect(body.data.photosAssigned).toBe(1)
      expect(recipeUpdate).toHaveBeenCalledTimes(1)
    })

    // P7: confirmed recipes are skipped; per-recipe ID targeting verified
    it('only placeholder recipes receive updates; confirmed recipes are skipped', async () => {
      const { recipeUpdate, recipeUpdateEq } = setupSupabaseMock({
        restaurant: { id: RESTAURANT_UUID, place_id: 'place-abc', reference_image_url: null },
        recipes: [
          { id: 'r1', photo_status: 'placeholder', dish_image_url: null },
          { id: 'r2', photo_status: 'confirmed', dish_image_url: 'https://existing.jpg' },
          { id: 'r3', photo_status: 'placeholder', dish_image_url: null },
        ],
      })
      mockGetRestaurantPhotos.mockResolvedValue([
        'https://photos.example.com/a.jpg',
        'https://photos.example.com/b.jpg',
      ])
      const res = await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      expect(res.status).toBe(200)
      const body = await res.json()
      // Only r1 and r3 get updated; r2 (confirmed) is skipped
      expect(body.data.photosAssigned).toBe(2)
      expect(recipeUpdate).toHaveBeenCalledTimes(2)
      // P7: verify correct recipe IDs were targeted, not r2
      const updatedIds = recipeUpdateEq.mock.calls.map((call: unknown[]) => call[1])
      expect(updatedIds).toContain('r1')
      expect(updatedIds).toContain('r3')
      expect(updatedIds).not.toContain('r2')
    })

    it('Places returns photos, reference_image_url is null → restaurants.reference_image_url updated with photos[0]', async () => {
      const { restaurantUpdate } = setupSupabaseMock({
        restaurant: { id: RESTAURANT_UUID, place_id: 'place-abc', reference_image_url: null },
        recipes: [
          { id: 'r1', photo_status: 'placeholder', dish_image_url: null },
        ],
      })
      mockGetRestaurantPhotos.mockResolvedValue([
        'https://photos.example.com/cover.jpg',
        'https://photos.example.com/interior.jpg',
      ])
      const res = await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      expect(res.status).toBe(200)
      expect(restaurantUpdate).toHaveBeenCalledWith({ reference_image_url: 'https://photos.example.com/cover.jpg' })
    })

    // P1: recipe update error is logged but does not fail the request; photosAssigned not incremented
    it('recipe UPDATE error → photosAssigned not incremented for the failed write', async () => {
      setupSupabaseMock({
        restaurant: { id: RESTAURANT_UUID, place_id: 'place-abc', reference_image_url: null },
        recipes: [
          { id: 'r1', photo_status: 'placeholder', dish_image_url: null },
          { id: 'r2', photo_status: 'placeholder', dish_image_url: null },
        ],
        recipeUpdateError: { message: 'constraint violation' },
      })
      mockGetRestaurantPhotos.mockResolvedValue(['https://photos.example.com/a.jpg'])
      const res = await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      expect(res.status).toBe(200)
      const body = await res.json()
      // Both updates failed → photosAssigned: 0 (not 2)
      expect(body.data.photosAssigned).toBe(0)
    })
  })

  // ─── Photo assignment — repeat enrichment pass (reference_image_url set) ──

  describe('photo assignment (repeat enrichment pass)', () => {
    // I2: when reference_image_url is already set, reuse it without calling Places
    it('reference_image_url set + placeholder recipes → cached URL assigned, no Places API call', async () => {
      const { recipeUpdate } = setupSupabaseMock({
        restaurant: {
          id: RESTAURANT_UUID,
          place_id: 'place-abc',
          reference_image_url: 'https://cached-cover.jpg',
        },
        recipes: [
          { id: 'r1', photo_status: 'placeholder', dish_image_url: null },
          { id: 'r2', photo_status: 'confirmed', dish_image_url: 'https://existing.jpg' },
        ],
      })
      const res = await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      expect(res.status).toBe(200)
      const body = await res.json()
      // Only r1 (placeholder) is updated; r2 (confirmed) is skipped
      expect(body.data.photosAssigned).toBe(1)
      // No Places API call — uses cached reference_image_url
      expect(mockGetRestaurantPhotos).not.toHaveBeenCalled()
      // Assigned the cached cover URL to the placeholder recipe
      expect(recipeUpdate).toHaveBeenCalledWith({
        dish_image_url: 'https://cached-cover.jpg',
        photo_status: 'confirmed',
      })
    })

    // P2: reference_image_url already set → restaurant row NOT updated again
    it('reference_image_url already set → restaurants table NOT updated, no Places API call', async () => {
      const { restaurantUpdate } = setupSupabaseMock({
        restaurant: {
          id: RESTAURANT_UUID,
          place_id: 'place-abc',
          reference_image_url: 'https://already-set.jpg',
        },
        recipes: [
          { id: 'r1', photo_status: 'placeholder', dish_image_url: null },
        ],
      })
      await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      // I2 cache path: no Places call
      expect(mockGetRestaurantPhotos).not.toHaveBeenCalled()
      // reference_image_url already set → restaurant row not re-updated
      expect(restaurantUpdate).not.toHaveBeenCalled()
    })
  })

  // ─── Places API failure ───────────────────────────────────────────────────

  describe('Places API failure', () => {
    it('getRestaurantPhotos throws → 503, nested error { code: "PLACES_UNAVAILABLE" }', async () => {
      setupSupabaseMock({
        restaurant: { id: RESTAURANT_UUID, place_id: 'place-abc', reference_image_url: null },
        recipes: [{ id: 'r1', photo_status: 'placeholder', dish_image_url: null }],
      })
      mockGetRestaurantPhotos.mockRejectedValue(new Error('Places API down'))
      const res = await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.error).toMatchObject({ message: 'Photos unavailable', code: 'PLACES_UNAVAILABLE' })
      expect(typeof body.error).toBe('object')
    })
  })

  // ─── Error envelope ───────────────────────────────────────────────────────

  describe('error envelope', () => {
    it('all error responses use nested { error: { message, code } } — not flat { error: "string" }', async () => {
      // Verify via the missing-key path (most direct error route)
      mockGetApiKeys.mockReturnValue({ places: undefined })
      const res = await POST(makeReq({ restaurantId: RESTAURANT_UUID }))
      const body = await res.json()
      expect(typeof body.error).toBe('object')
      expect(typeof body.error.message).toBe('string')
      expect(typeof body.error.code).toBe('string')
      // Flat shape must NOT be present
      expect(typeof body.error).not.toBe('string')
    })
  })
})
