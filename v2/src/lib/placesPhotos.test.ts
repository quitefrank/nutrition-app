import { vi, describe, it, expect, beforeEach } from 'vitest'

// server-only is aliased to a no-op in vitest.config.ts
// framer-motion is also aliased — neither affects this file

global.fetch = vi.fn()

import { getRestaurantPhotos } from './placesPhotos'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function searchOk(placeId?: string) {
  return {
    ok: true,
    json: async () => ({ places: placeId ? [{ id: placeId }] : [] }),
  } as Response
}

function searchFail(status = 500) {
  return { ok: false, status } as Response
}

function detailsOk(photoNames: string[]) {
  return {
    ok: true,
    json: async () => ({ photos: photoNames.map((name) => ({ name })) }),
  } as Response
}

function detailsFail(status = 403) {
  return { ok: false, status } as Response
}

function mediaOk(photoUri: string) {
  return {
    ok: true,
    json: async () => ({ photoUri }),
  } as Response
}

function mediaFail(status = 404) {
  return { ok: false, status } as Response
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('getRestaurantPhotos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── No inputs ────────────────────────────────────────────────────────────

  it('returns [] immediately when neither placeId nor name is provided', async () => {
    const result = await getRestaurantPhotos({}, 'test-key')
    expect(result).toEqual([])
    expect(global.fetch).not.toHaveBeenCalled()
  })

  // ─── Direct placeId path ──────────────────────────────────────────────────

  it('skips text search when placeId is provided — only 2 fetches (details + media)', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(detailsOk(['places/p1/photos/ref1']))
      .mockResolvedValueOnce(mediaOk('https://cdn.example.com/photo.jpg'))

    const result = await getRestaurantPhotos({ placeId: 'place-123' }, 'test-key')

    expect(result).toEqual(['https://cdn.example.com/photo.jpg'])
    expect(global.fetch).toHaveBeenCalledTimes(2)
    // First call must be the details endpoint, not searchText
    expect(vi.mocked(global.fetch).mock.calls[0][0]).toContain('places/place-123')
  })

  it('details fetch fails → returns []', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(detailsFail())

    const result = await getRestaurantPhotos({ placeId: 'place-123' }, 'test-key')
    expect(result).toEqual([])
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('details returns no photos → returns [] without fetching media', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(detailsOk([]))

    const result = await getRestaurantPhotos({ placeId: 'place-123' }, 'test-key')
    expect(result).toEqual([])
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  // ─── Name → text search → placeId path ───────────────────────────────────

  it('resolves placeId via text search when only name provided — 3 fetches total', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(searchOk('resolved-place-id'))
      .mockResolvedValueOnce(detailsOk(['places/resolved-place-id/photos/ref1']))
      .mockResolvedValueOnce(mediaOk('https://cdn.example.com/restaurant.jpg'))

    const result = await getRestaurantPhotos({ name: 'Pizza Palace' }, 'test-key')

    expect(result).toEqual(['https://cdn.example.com/restaurant.jpg'])
    expect(global.fetch).toHaveBeenCalledTimes(3)
    // First call must be the Places searchText endpoint
    const firstUrl = vi.mocked(global.fetch).mock.calls[0][0] as string
    expect(firstUrl).toContain('searchText')
  })

  it('text search returns no places → returns [] without fetching details', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(searchOk(undefined))

    const result = await getRestaurantPhotos({ name: 'Ghost Kitchen' }, 'test-key')
    expect(result).toEqual([])
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('text search fetch fails (non-200) → returns []', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(searchFail(503))

    const result = await getRestaurantPhotos({ name: 'Pizza Palace' }, 'test-key')
    expect(result).toEqual([])
  })

  // ─── Media URL security (SEC-SEC-1.00) ───────────────────────────────────

  it('filters out non-HTTPS photo URIs', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(detailsOk(['places/p1/photos/1', 'places/p1/photos/2']))
      .mockResolvedValueOnce(mediaOk('http://insecure.example.com/photo.jpg')) // HTTP — must be excluded
      .mockResolvedValueOnce(mediaOk('https://cdn.example.com/secure.jpg'))

    const result = await getRestaurantPhotos({ placeId: 'place-123' }, 'test-key')
    expect(result).toEqual(['https://cdn.example.com/secure.jpg'])
    expect(result).not.toContain('http://insecure.example.com/photo.jpg')
  })

  it('filters out null photoUri (missing field in media response)', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(detailsOk(['places/p1/photos/1']))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ /* photoUri absent */ }),
      } as Response)

    const result = await getRestaurantPhotos({ placeId: 'place-123' }, 'test-key')
    expect(result).toEqual([])
  })

  // ─── Partial media failures ───────────────────────────────────────────────

  it('one media fetch fails → that photo excluded, others returned', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(detailsOk(['places/p1/photos/1', 'places/p1/photos/2']))
      .mockResolvedValueOnce(mediaFail(404))
      .mockResolvedValueOnce(mediaOk('https://cdn.example.com/photo2.jpg'))

    const result = await getRestaurantPhotos({ placeId: 'place-123' }, 'test-key')
    expect(result).toEqual(['https://cdn.example.com/photo2.jpg'])
  })

  it('all media fetches fail → returns []', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(detailsOk(['places/p1/photos/1', 'places/p1/photos/2']))
      .mockResolvedValueOnce(mediaFail())
      .mockResolvedValueOnce(mediaFail())

    const result = await getRestaurantPhotos({ placeId: 'place-123' }, 'test-key')
    expect(result).toEqual([])
  })

  // ─── maxPhotos limit ──────────────────────────────────────────────────────

  it('respects maxPhotos — only fetches and returns up to that many', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(detailsOk(['places/p1/photos/1', 'places/p1/photos/2', 'places/p1/photos/3']))
      .mockResolvedValueOnce(mediaOk('https://cdn.example.com/1.jpg'))
      .mockResolvedValueOnce(mediaOk('https://cdn.example.com/2.jpg'))
      // photo 3 should NOT be fetched

    const result = await getRestaurantPhotos({ placeId: 'place-123' }, 'test-key', 2)

    expect(result).toHaveLength(2)
    // details + 2 media (not 4)
    expect(global.fetch).toHaveBeenCalledTimes(3)
  })

  // ─── Network / unexpected errors ─────────────────────────────────────────

  it('fetch throws (network error) → returns [] gracefully', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await getRestaurantPhotos({ placeId: 'place-123' }, 'test-key')
    expect(result).toEqual([])
  })

  it('placeId provided alongside name → placeId wins, no text search', async () => {
    vi.mocked(global.fetch)
      .mockResolvedValueOnce(detailsOk(['places/p1/photos/ref1']))
      .mockResolvedValueOnce(mediaOk('https://cdn.example.com/photo.jpg'))

    await getRestaurantPhotos({ placeId: 'explicit-id', name: 'Pizza Palace' }, 'test-key')

    // Only 2 fetches — details and media, no searchText
    expect(global.fetch).toHaveBeenCalledTimes(2)
    const firstUrl = vi.mocked(global.fetch).mock.calls[0][0] as string
    expect(firstUrl).not.toContain('searchText')
    expect(firstUrl).toContain('explicit-id')
  })
})
