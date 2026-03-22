import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import type { GroceryCheckRequest, GroceryCheckResponse } from '@/types/api'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id', code: 'BAD_REQUEST' }, { status: 400 })
  }

  let body: GroceryCheckRequest
  try {
    body = await req.json() as GroceryCheckRequest
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'VALIDATION_ERROR' }, { status: 422 })
  }

  if (typeof body.checked !== 'boolean') {
    return NextResponse.json({ error: 'checked must be a boolean', code: 'VALIDATION_ERROR' }, { status: 422 })
  }

  const { data: updated, error } = await supabase
    .from('grocery_items')
    .update({ checked: body.checked })
    .eq('id', id)
    .select('id')

  if (error) {
    return NextResponse.json({ error: 'Failed to update item', code: 'DB_ERROR' }, { status: 500 })
  }

  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: 'Item not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  const responseData: GroceryCheckResponse = { id, checked: body.checked }
  return NextResponse.json({ data: responseData })
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id', code: 'BAD_REQUEST' }, { status: 400 })
  }

  const { data: deleted, error } = await supabase
    .from('grocery_items')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) {
    return NextResponse.json({ error: 'Failed to delete item', code: 'DB_ERROR' }, { status: 500 })
  }

  if (!deleted || deleted.length === 0) {
    return NextResponse.json({ error: 'Item not found', code: 'NOT_FOUND' }, { status: 404 })
  }

  return NextResponse.json({ data: { deleted: true } })
}
