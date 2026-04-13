/**
 * /api/places/nearby — Places API degraded states (Story 6.5 AC2)
 *
 * Verifies that every Places failure mode degrades gracefully:
 * 4xx/5xx from Places API, missing API key, malformed response schema,
 * photo resolution failures (via .catch(() => [])), and the outer INTERNAL_ERROR.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockGetApiKeys = vi.hoisted(() =>
  vi.fn(() => ({ places: 'places-test-key' as string | undefined }))
)
const mockGetRestaurantPhotos = vi.hoisted(() => vi.fn().mockResolvedValue([]))

vi.mock('@/lib/api-keys', () => ({ getApiKeys: mockGetApiKeys }))
vi.mock('@/lib/placesPhotos', () => ({ getRestaurantPhotos: mockGetRestaurantPhotos }))

// Import after mocks are set up
import { POST } from './nearby/route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/places/nearby', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const VALID_COORDS = { lat: 43.6532, lng: -79.3832 }

/** Builds a minimal valid Places API success response with one result. */
function placesSuccessResponse() {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue({
      places: [
        {
          id: 'place-123',
          displayName: { text: 'The Burger Joint' },
          formattedAddress: '123 Main St',
          rating: 4.5,
          userRatingCount: 200,
        },
      ],
    }),
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('/api/places/nearby — Places API degraded states', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
    originalFetch = global.fetch
    global.fetch = vi.fn()
    mockGetApiKeys.mockReturnValue({ places: 'places-test-key' })
    mockGetRestaurantPhotos.mockResolvedValue([])
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns PLACES_ERROR 502 when Places API returns 500', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 500 })

    const res = await POST(makeReq(VALID_COORDS))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error.code).toBe('PLACES_ERROR')
    expect(typeof body.error.message).toBe('string')
  })

  it('returns PLACES_ERROR 502 when Places API returns 429', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 429 })

    const res = await POST(makeReq(VALID_COORDS))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error.code).toBe('PLACES_ERROR')
  })

  it('returns PLACES_ERROR 502 when Places API returns 403 (invalid key)', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 403 })

    const res = await POST(makeReq(VALID_COORDS))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error.code).toBe('PLACES_ERROR')
  })

  it('returns SERVICE_UNAVAILABLE 503 when no Places API key is configured', async () => {
    mockGetApiKeys.mockReturnValueOnce({ places: undefined })

    const res = await POST(makeReq(VALID_COORDS))
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE')
    // No fetch should have been attempted
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('degrades to empty data array when Places response schema is malformed', async () => {
    // Response has no "places" field — Zod .catch([]) on the array degrades to []
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ unexpected_field: 'no places here' }),
    })

    const res = await POST(makeReq(VALID_COORDS))
    // Schema coercion means no error — just an empty result
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data).toHaveLength(0)
  })

  it('photo resolution failure (.catch(() => [])) yields photoUrl: null, not an error', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(placesSuccessResponse())
    // getRestaurantPhotos throws — the .catch(() => []) in the route handles it
    mockGetRestaurantPhotos.mockRejectedValueOnce(new Error('network failure'))

    const res = await POST(makeReq(VALID_COORDS))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0].photoUrl).toBeNull()
    // No error code — just degraded data
    expect(body.error).toBeUndefined()
  })

  it('photo resolution timeout (AbortError from getRestaurantPhotos) yields photoUrl: null', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(placesSuccessResponse())
    // Simulate AbortError (e.g. from a timeout) — .catch(() => []) handles it identically
    const abortError = new DOMException('Timed out', 'AbortError')
    mockGetRestaurantPhotos.mockRejectedValueOnce(abortError)

    const res = await POST(makeReq(VALID_COORDS))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data[0].photoUrl).toBeNull()
  })

  it('returns INTERNAL_ERROR 500 on unexpected throws inside the main try/catch', async () => {
    // Make res.json() throw — this is inside the main try/catch but outside all inner guards,
    // so it propagates to the outer catch → INTERNAL_ERROR 500.
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new Error('Unexpected JSON parse failure')),
    })

    const res = await POST(makeReq(VALID_COORDS))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error.code).toBe('INTERNAL_ERROR')
  })
})
