import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

vi.mock('server-only', () => ({}))

const { mockFrom } = vi.hoisted(() => ({ mockFrom: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabase: { from: mockFrom },
}))

const RECIPE_ID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const RECIPE_ID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'

// Helper for grocery_items query: chains select → order → limit
function makeItemsChain(resolvedValue: { data: unknown; error: unknown }) {
  const limitFn = vi.fn().mockResolvedValue(resolvedValue)
  const orderFn = vi.fn().mockReturnValue({ limit: limitFn })
  const selectFn = vi.fn().mockReturnValue({ order: orderFn })
  return { select: selectFn }
}

// Helper for recipes query: chains select → in
function makeRecipesChain(resolvedValue: { data: unknown; error: unknown }) {
  const inFn = vi.fn().mockResolvedValue(resolvedValue)
  const selectFn = vi.fn().mockReturnValue({ in: inFn })
  return { select: selectFn }
}

describe('GET /api/grocery/recipes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns empty array when grocery_items is empty', async () => {
    mockFrom.mockReturnValueOnce(makeItemsChain({ data: [], error: null }))

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([])
  })

  it('returns correct GroceryRecipeSummary shape for named recipe', async () => {
    mockFrom.mockReturnValueOnce(makeItemsChain({ data: [{ recipe_id: RECIPE_ID_A }, { recipe_id: RECIPE_ID_A }], error: null }))
    // Second call: recipes with restaurants join
    mockFrom.mockReturnValueOnce(
      makeRecipesChain({
        data: [
          {
            id: RECIPE_ID_A,
            name: 'Pasta Carbonara',
            dish_image_url: 'https://example.com/pasta.jpg',
            restaurants: { name: 'Trattoria Roma' },
          },
        ],
        error: null,
      })
    )

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({
      recipeId: RECIPE_ID_A,
      recipeName: 'Pasta Carbonara',
      dishImageUrl: 'https://example.com/pasta.jpg',
      restaurantName: 'Trattoria Roma',
      itemCount: 2,
    })
  })

  it('includes null group as "Other items" when recipe_id = null items exist', async () => {
    mockFrom.mockReturnValueOnce(makeItemsChain({ data: [{ recipe_id: RECIPE_ID_A }, { recipe_id: null }], error: null }))
    // Second call: recipes
    mockFrom.mockReturnValueOnce(
      makeRecipesChain({
        data: [
          {
            id: RECIPE_ID_A,
            name: 'Pizza',
            dish_image_url: null,
            restaurants: null,
          },
        ],
        error: null,
      })
    )

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    const otherGroup = body.data.find((s: { recipeId: string | null }) => s.recipeId === null)
    expect(otherGroup).toBeDefined()
    expect(otherGroup).toMatchObject({
      recipeId: null,
      recipeName: 'Other items',
      dishImageUrl: null,
      restaurantName: null,
      itemCount: 1,
    })
  })

  it('null group appears last in the array', async () => {
    mockFrom.mockReturnValueOnce(makeItemsChain({ data: [{ recipe_id: RECIPE_ID_A }, { recipe_id: null }, { recipe_id: RECIPE_ID_B }], error: null }))
    mockFrom.mockReturnValueOnce(
      makeRecipesChain({
        data: [
          { id: RECIPE_ID_A, name: 'Salad', dish_image_url: null, restaurants: null },
          { id: RECIPE_ID_B, name: 'Soup', dish_image_url: null, restaurants: null },
        ],
        error: null,
      })
    )

    const res = await GET()
    const body = await res.json()
    const last = body.data[body.data.length - 1]
    expect(last.recipeId).toBeNull()
  })

  it('handles only null group (no named recipes)', async () => {
    mockFrom.mockReturnValueOnce(makeItemsChain({ data: [{ recipe_id: null }, { recipe_id: null }], error: null }))
    // No second from() call — no recipe IDs to fetch

    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toHaveLength(1)
    expect(body.data[0]).toMatchObject({
      recipeId: null,
      recipeName: 'Other items',
      itemCount: 2,
    })
  })

  it('returns 500 when grocery_items query fails', async () => {
    mockFrom.mockReturnValueOnce(makeItemsChain({ data: null, error: { message: 'db error' } }))

    const res = await GET()
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBeDefined()
  })

  it('returns 500 when recipes query fails', async () => {
    mockFrom.mockReturnValueOnce(makeItemsChain({ data: [{ recipe_id: RECIPE_ID_A }], error: null }))
    mockFrom.mockReturnValueOnce(
      makeRecipesChain({ data: null, error: { message: 'db error' } })
    )

    const res = await GET()
    expect(res.status).toBe(500)
  })

  it('handles recipe without restaurant (restaurantName null)', async () => {
    mockFrom.mockReturnValueOnce(makeItemsChain({ data: [{ recipe_id: RECIPE_ID_A }], error: null }))
    mockFrom.mockReturnValueOnce(
      makeRecipesChain({
        data: [{ id: RECIPE_ID_A, name: 'Homemade Pasta', dish_image_url: null, restaurants: null }],
        error: null,
      })
    )

    const res = await GET()
    const body = await res.json()
    expect(body.data[0].restaurantName).toBeNull()
  })
})
