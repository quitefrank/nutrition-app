import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const checkedParam = searchParams.get('checked')
  const recipeIdParam = searchParams.get('recipeId')

  // Reject ambiguous: both params supplied
  if (checkedParam !== null && recipeIdParam !== null) {
    return NextResponse.json(
      { error: 'Provide either checked=true or recipeId=<uuid>, not both', code: 'BAD_REQUEST' },
      { status: 400 }
    )
  }

  // Reject malformed checked param
  if (checkedParam !== null && checkedParam !== 'true') {
    return NextResponse.json(
      { error: 'checked must be "true"', code: 'BAD_REQUEST' },
      { status: 400 }
    )
  }

  // Mode 1: ?checked=true — delete all checked items (this story)
  if (checkedParam === 'true') {
    const { data, error } = await supabase
      .from('grocery_items')
      .delete()
      .eq('checked', true)
      .select('id')

    if (error) {
      return NextResponse.json({ error: 'Failed to clear checked items', code: 'DB_ERROR' }, { status: 500 })
    }

    return NextResponse.json({ data: { deleted: (data ?? []).length } })
  }

  // Mode 2: ?recipeId=<uuid> — delete all items for a recipe (Story 4.3)
  if (recipeIdParam !== null) {
    if (!UUID_RE.test(recipeIdParam)) {
      return NextResponse.json({ error: 'Invalid recipeId', code: 'BAD_REQUEST' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('grocery_items')
      .delete()
      .eq('recipe_id', recipeIdParam)
      .select('id')

    if (error) {
      return NextResponse.json({ error: 'Failed to delete recipe items', code: 'DB_ERROR' }, { status: 500 })
    }

    return NextResponse.json({ data: { deleted: (data ?? []).length } })
  }

  // Neither valid param supplied
  return NextResponse.json(
    { error: 'Provide checked=true or recipeId=<uuid>', code: 'BAD_REQUEST' },
    { status: 400 }
  )
}
