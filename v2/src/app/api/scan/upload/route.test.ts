import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const mockGetApiKeys = vi.hoisted(() => vi.fn())
// vi.fn() without factory avoids narrowing the return type to a specific literal
const mockCreateClient = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-keys', () => ({ getApiKeys: mockGetApiKeys }))
vi.mock('@supabase/supabase-js', () => ({ createClient: mockCreateClient }))

import { POST } from './route'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: unknown) {
  return new NextRequest('http://localhost/api/scan/upload', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const VALID_BODY = {
  imageBase64: 'dGVzdA==', // base64("test")
  mimeType: 'image/jpeg',
  recipeId: '550e8400-e29b-41d4-a716-446655440000', // valid UUID v4 format (Zod v4 validates version bits)
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/scan/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: storage not configured (createClient → null, no env vars)
    mockGetApiKeys.mockReturnValue({
      gemini: 'AItest123456789012345678901234567890',
      supabaseServiceRole: undefined,
    })
    mockCreateClient.mockReturnValue(null)
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
  })

  // ─── Storage not configured (intentionally non-fatal) ─────────────────────

  it('storage not configured → 200, { photoUrl: null }', async () => {
    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.photoUrl).toBeNull()
  })

  it('storage not configured + invalid JSON → 200, { photoUrl: null } (non-fatal)', async () => {
    // The route short-circuits at getServiceClient() before reaching JSON parse
    const res = await POST(makeReq('not-json'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.photoUrl).toBeNull()
  })

  // ─── Invalid JSON body (when storage IS configured) ───────────────────────

  it('invalid JSON body with storage configured → 400, code: INVALID_REQUEST, nested envelope', async () => {
    mockGetApiKeys.mockReturnValue({
      gemini: 'AItest123456789012345678901234567890',
      supabaseUrl: 'https://test.supabase.co',
      supabaseServiceRole: 'service-role-key',
    })
    // createClient returns a mock client (non-null) so route proceeds past the guard
    mockCreateClient.mockReturnValue({
      storage: { from: vi.fn(() => ({ upload: vi.fn(), getPublicUrl: vi.fn() })) },
      from: vi.fn(),
    })

    const res = await POST(makeReq('not-json'))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'INVALID_REQUEST' })
    expect(typeof body.error).toBe('object')
  })

  // ─── Zod validation failure (when storage IS configured) ─────────────────

  it('missing required fields with storage configured → 422, code: VALIDATION_ERROR, nested envelope', async () => {
    mockGetApiKeys.mockReturnValue({
      gemini: 'AItest123456789012345678901234567890',
      supabaseUrl: 'https://test.supabase.co',
      supabaseServiceRole: 'service-role-key',
    })
    mockCreateClient.mockReturnValue({
      storage: { from: vi.fn(() => ({ upload: vi.fn(), getPublicUrl: vi.fn() })) },
      from: vi.fn(),
    })

    const res = await POST(makeReq({ imageBase64: 'dGVzdA==' })) // missing mimeType and recipeId
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatchObject({ code: 'VALIDATION_ERROR' })
    expect(typeof body.error).toBe('object')
  })

  // ─── D8: successful upload path ───────────────────────────────────────────

  it('successful upload → 200, { photoUrl: "https://..." }', async () => {
    const publicUrl =
      'https://test.supabase.co/storage/v1/object/public/dish-photos/recipes/00000000-0000-0000-0000-000000000001/dish.jpg'
    const mockUpload = vi.fn().mockResolvedValue({ error: null })
    const mockGetPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl } })
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })

    mockGetApiKeys.mockReturnValue({
      supabaseUrl: 'https://test.supabase.co',
      supabaseServiceRole: 'service-role-key',
    })
    mockCreateClient.mockReturnValue({
      storage: {
        from: vi.fn(() => ({ upload: mockUpload, getPublicUrl: mockGetPublicUrl })),
      },
      from: vi.fn(() => ({ update: mockUpdate })),
    })

    const res = await POST(makeReq(VALID_BODY))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(typeof body.photoUrl).toBe('string')
    expect(body.photoUrl).toMatch(/^https:\/\//)
    expect(mockUpload).toHaveBeenCalledOnce()
    expect(mockGetPublicUrl).toHaveBeenCalledOnce()
  })
})
