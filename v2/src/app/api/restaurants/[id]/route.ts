import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

// ─── Validation ───────────────────────────────────────────────────────────────

/** ARCH8: Validate id as UUID with Zod before any DB access */
const IdSchema = z.string().uuid()

// ─── Error helpers (ARCH7 response envelope) ─────────────────────────────────

function errorResponse(
  code: string,
  message: string,
  status: 404 | 422
) {
  return NextResponse.json({ error: { code, message } }, { status })
}

// ─── DELETE /api/restaurants/[id] ─────────────────────────────────────────────

/**
 * Soft-deletes a restaurant and all its recipes.
 *
 * ARCH7: Returns { success: true } or { error: { code, message } }.
 * ARCH8: Validates id as UUID before any DB access.
 * ARCH18: Uses createClient() from @/lib/supabase/server.
 *
 * SEC-ACC-1.00: Access enforced by Supabase row-level security (anon key).
 * SEC-INJ-1.00: Parameterized queries only — no string concatenation.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // ── Validate id (ARCH8) ────────────────────────────────────────────────────
  const parsed = IdSchema.safeParse(id)
  if (!parsed.success) {
    return errorResponse('INVALID_ID', 'id must be a valid UUID', 422)
  }

  const supabase = createClient()

  // ── Soft-delete recipes first (FK child rows) ─────────────────────────────
  // SEC-INJ-1.00: Supabase SDK uses parameterized queries internally.
  const { error: recipesError } = await supabase
    .from('recipes')
    .update({ removed_at: new Date().toISOString() })
    .eq('restaurant_id', parsed.data)
    .is('removed_at', null)

  if (recipesError) {
    console.error('[restaurants/[id]] recipes soft-delete failed:', recipesError.message)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to remove restaurant dishes' } },
      { status: 500 }
    )
  }

  // ── Soft-delete the restaurant ─────────────────────────────────────────────
  const { data, error: restaurantError } = await supabase
    .from('restaurants')
    .update({ removed_at: new Date().toISOString() })
    .eq('id', parsed.data)
    .is('removed_at', null)
    .select('id')

  if (restaurantError) {
    console.error('[restaurants/[id]] restaurant soft-delete failed:', restaurantError.message)
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to remove restaurant' } },
      { status: 500 }
    )
  }

  // ── 404 if no row was updated ─────────────────────────────────────────────
  if (!data || data.length === 0) {
    return errorResponse('NOT_FOUND', 'Restaurant not found', 404)
  }

  return NextResponse.json({ success: true }, { status: 200 })
}
