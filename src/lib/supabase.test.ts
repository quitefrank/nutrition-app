import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock env vars before importing supabase module
beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
})

describe('supabase client', () => {
  it('exports a supabase client instance', async () => {
    const { supabase } = await import('./supabase')
    expect(supabase).toBeDefined()
    expect(typeof supabase.from).toBe('function')
  })
})
