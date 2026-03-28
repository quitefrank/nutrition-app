import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useNearbyRestaurant } from './use-nearby-restaurant'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Helpers to mock geolocation and permissions
function mockGeolocation(overrides?: Partial<Geolocation>) {
  const geo = {
    getCurrentPosition: vi.fn(),
    watchPosition: vi.fn(),
    clearWatch: vi.fn(),
    ...overrides,
  }
  Object.defineProperty(navigator, 'geolocation', {
    value: geo,
    configurable: true,
    writable: true,
  })
  return geo
}

function mockPermissions(state: PermissionState) {
  Object.defineProperty(navigator, 'permissions', {
    value: {
      query: vi.fn().mockResolvedValue({ state }),
    },
    configurable: true,
    writable: true,
  })
}

const nearbyRestaurantResponse = {
  ok: true,
  json: async () => ({
    data: [
      { id: 'rest-1', name: 'Le Canard', googlePlacesId: 'gp-123', recipeCount: 3 },
    ],
  }),
}

const emptyResponse = {
  ok: true,
  json: async () => ({ data: [] }),
}

describe('useNearbyRestaurant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('permissions.query returns "granted" → geolocation called automatically', async () => {
    const geo = mockGeolocation({
      getCurrentPosition: vi.fn().mockImplementation((success) => {
        success({ coords: { latitude: 51.5074, longitude: -0.1278 } })
      }),
    })
    mockPermissions('granted')
    mockFetch.mockResolvedValue(nearbyRestaurantResponse)

    const { result } = renderHook(() => useNearbyRestaurant())

    await waitFor(() => {
      expect(result.current.nearbyRestaurant).not.toBeNull()
    })

    expect(geo.getCurrentPosition).toHaveBeenCalled()
    expect(result.current.nearbyRestaurant?.id).toBe('rest-1')
    expect(result.current.nearbyRestaurant?.name).toBe('Le Canard')
    expect(result.current.nearbyRestaurant?.recipeCount).toBe(3)
  })

  it('permissions.query returns "prompt" → geolocation NOT called until requestPermission()', async () => {
    const geo = mockGeolocation({
      getCurrentPosition: vi.fn(),
    })
    mockPermissions('prompt')

    const { result } = renderHook(() => useNearbyRestaurant())

    // Wait for the permissions query effect to complete
    await waitFor(() => expect(navigator.permissions.query).toHaveBeenCalled())

    // Geolocation should NOT have been called yet
    expect(geo.getCurrentPosition).not.toHaveBeenCalled()
    expect(result.current.nearbyRestaurant).toBeNull()

    // Trigger permission request
    mockFetch.mockResolvedValue(nearbyRestaurantResponse)
    geo.getCurrentPosition.mockImplementation((success: PositionCallback) => {
      success({ coords: { latitude: 51.5074, longitude: -0.1278 } } as GeolocationPosition)
    })

    act(() => {
      result.current.requestPermission()
    })

    await waitFor(() => {
      expect(result.current.nearbyRestaurant).not.toBeNull()
    })

    expect(geo.getCurrentPosition).toHaveBeenCalledTimes(1)
  })

  it('GeolocationPositionError → nearbyRestaurant is null', async () => {
    const geo = mockGeolocation({
      getCurrentPosition: vi.fn().mockImplementation((_success, error) => {
        error({ code: 1, message: 'Permission denied' } as GeolocationPositionError)
      }),
    })
    mockPermissions('granted')

    const { result } = renderHook(() => useNearbyRestaurant())

    await waitFor(() => {
      expect(geo.getCurrentPosition).toHaveBeenCalled()
    })

    expect(result.current.nearbyRestaurant).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })

  it('no nearby restaurants in response → nearbyRestaurant is null', async () => {
    mockGeolocation({
      getCurrentPosition: vi.fn().mockImplementation((success) => {
        success({ coords: { latitude: 51.5074, longitude: -0.1278 } })
      }),
    })
    mockPermissions('granted')
    mockFetch.mockResolvedValue(emptyResponse)

    const { result } = renderHook(() => useNearbyRestaurant())

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.nearbyRestaurant).toBeNull()
  })

  it('permissions.query returns "denied" → geolocation not called', async () => {
    const geo = mockGeolocation()
    mockPermissions('denied')

    const { result } = renderHook(() => useNearbyRestaurant())
    await waitFor(() => expect(navigator.permissions.query).toHaveBeenCalled())

    expect(geo.getCurrentPosition).not.toHaveBeenCalled()
    expect(result.current.nearbyRestaurant).toBeNull()
  })
})
