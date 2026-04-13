import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

// Supabase builder chain mock: .from().update().eq().is().select() → { data, error }
const { mockFrom, mockUpdate, mockEq, mockIs, mockSelect } = vi.hoisted(() => {
  const mockSelect = vi.fn()
  const mockIs = vi.fn(() => ({ select: mockSelect }))
  const mockEq = vi.fn(() => ({ is: mockIs }))
  const mockUpdate = vi.fn(() => ({ eq: mockEq }))
  const mockFrom = vi.fn(() => ({ update: mockUpdate }))
  return { mockFrom, mockUpdate, mockEq, mockIs, mockSelect }
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}))

// Import after mocks
import { DELETE } from './route'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_UUID = '00000000-0000-4000-8000-000000000001'

function makeReq(id: string) {
  return new NextRequest(`http://localhost/api/restaurants/${id}`, {
    method: 'DELETE',
  })
}

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DELETE /api/restaurants/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('validation', () => {
    it('returns 422 with INVALID_ID for non-UUID id', async () => {
      const req = makeReq('not-a-uuid')
      const res = await DELETE(req, makeParams('not-a-uuid'))
      expect(res.status).toBe(422)
      const body = await res.json() as { error: { code: string; message: string } }
      expect(body.error.code).toBe('INVALID_ID')
      expect(body.error.message).toBe('id must be a valid UUID')
    })

    it('returns 422 for empty string id', async () => {
      const req = makeReq('')
      const res = await DELETE(req, makeParams(''))
      expect(res.status).toBe(422)
      const body = await res.json() as { error: { code: string } }
      expect(body.error.code).toBe('INVALID_ID')
    })

    it('does not call Supabase when id is invalid', async () => {
      await DELETE(makeReq('bad'), makeParams('bad'))
      expect(mockFrom).not.toHaveBeenCalled()
    })
  })

  describe('success path', () => {
    beforeEach(() => {
      // First call: recipes soft-delete → { error: null }
      // Second call: restaurant soft-delete → { data: [{ id: VALID_UUID }], error: null }
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // recipes .update().eq().is() chain — no select needed
          const isRecipes = vi.fn().mockResolvedValue({ data: null, error: null })
          const eqRecipes = vi.fn(() => ({ is: isRecipes }))
          const updateRecipes = vi.fn(() => ({ eq: eqRecipes }))
          return { update: updateRecipes }
        } else {
          // restaurant .update().eq().is().select() chain
          const selectRest = vi.fn().mockResolvedValue({ data: [{ id: VALID_UUID }], error: null })
          const isRest = vi.fn(() => ({ select: selectRest }))
          const eqRest = vi.fn(() => ({ is: isRest }))
          const updateRest = vi.fn(() => ({ eq: eqRest }))
          return { update: updateRest }
        }
      })
    })

    it('returns 200 { success: true }', async () => {
      const req = makeReq(VALID_UUID)
      const res = await DELETE(req, makeParams(VALID_UUID))
      expect(res.status).toBe(200)
      const body = await res.json() as { success: boolean }
      expect(body.success).toBe(true)
    })

    it('soft-deletes recipes then restaurant (calls from twice)', async () => {
      const req = makeReq(VALID_UUID)
      await DELETE(req, makeParams(VALID_UUID))
      // from() called once for recipes, once for restaurant
      expect(mockFrom).toHaveBeenCalledTimes(2)
      expect(mockFrom).toHaveBeenNthCalledWith(1, 'recipes')
      expect(mockFrom).toHaveBeenNthCalledWith(2, 'restaurants')
    })
  })

  describe('500 path — recipes update failure', () => {
    it('returns 500 with INTERNAL_ERROR when recipes soft-delete fails', async () => {
      mockFrom.mockImplementation(() => {
        // recipes call returns a Supabase error — handler short-circuits here
        const isRecipes = vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'connection timeout' },
        })
        const eqRecipes = vi.fn(() => ({ is: isRecipes }))
        const updateRecipes = vi.fn(() => ({ eq: eqRecipes }))
        return { update: updateRecipes }
      })

      const req = makeReq(VALID_UUID)
      const res = await DELETE(req, makeParams(VALID_UUID))

      expect(res.status).toBe(500)
      const body = await res.json() as { error: { code: string; message: string } }
      expect(body.error.code).toBe('INTERNAL_ERROR')
      expect(body.error.message).toBe('Failed to remove restaurant dishes')

      // Restaurant soft-delete must NOT have been called (short-circuit after recipes error)
      expect(mockFrom).toHaveBeenCalledTimes(1)
      expect(mockFrom).toHaveBeenCalledWith('recipes')
      expect(mockFrom).not.toHaveBeenCalledWith('restaurants')
    })
  })

  describe('404 path', () => {
    beforeEach(() => {
      let callCount = 0
      mockFrom.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // recipes — no error
          const isRecipes = vi.fn().mockResolvedValue({ data: null, error: null })
          const eqRecipes = vi.fn(() => ({ is: isRecipes }))
          const updateRecipes = vi.fn(() => ({ eq: eqRecipes }))
          return { update: updateRecipes }
        } else {
          // restaurant — returns empty data (not found / already removed)
          const selectRest = vi.fn().mockResolvedValue({ data: [], error: null })
          const isRest = vi.fn(() => ({ select: selectRest }))
          const eqRest = vi.fn(() => ({ is: isRest }))
          const updateRest = vi.fn(() => ({ eq: eqRest }))
          return { update: updateRest }
        }
      })
    })

    it('returns 404 with NOT_FOUND when restaurant does not exist or is already removed', async () => {
      const req = makeReq(VALID_UUID)
      const res = await DELETE(req, makeParams(VALID_UUID))
      expect(res.status).toBe(404)
      const body = await res.json() as { error: { code: string; message: string } }
      expect(body.error.code).toBe('NOT_FOUND')
      expect(body.error.message).toBe('Restaurant not found')
    })
  })
})
