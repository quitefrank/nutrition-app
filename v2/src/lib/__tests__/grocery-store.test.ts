import { describe, it, expect, beforeEach } from 'vitest'
import {
  readGroceryList,
  addIngredientsToGrocery,
  toggleGroceryItem,
  removeGroceryItem,
  clearGroceryList,
  clearCheckedItems,
} from '../grocery-store'

const KEY = 'plately_grocery'

beforeEach(() => {
  localStorage.clear()
})

// ─── readGroceryList ──────────────────────────────────────────────────────────

describe('readGroceryList', () => {
  it('returns [] when localStorage is empty', () => {
    expect(readGroceryList()).toEqual([])
  })

  it('returns [] when localStorage value is malformed JSON', () => {
    localStorage.setItem(KEY, 'not-json')
    expect(readGroceryList()).toEqual([])
  })

  it('returns [] when stored value is not an array', () => {
    localStorage.setItem(KEY, JSON.stringify({ not: 'an array' }))
    expect(readGroceryList()).toEqual([])
  })

  it('filters out items missing a name field', () => {
    localStorage.setItem(KEY, JSON.stringify([
      { id: '1', name: 'Eggs', quantity: null, unit: null, dishName: 'Omelette', restaurantName: null, checked: false, addedAt: 0 },
      { id: '2', quantity: '1', unit: 'cup', dishName: 'Soup', restaurantName: null, checked: false, addedAt: 0 }, // missing name
    ]))
    const items = readGroceryList()
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('Eggs')
  })

  it('returns stored items correctly', () => {
    const stored = [
      { id: 'abc', name: 'Butter', quantity: '100', unit: 'g', dishName: 'Croissant', restaurantName: 'Bakery', checked: true, addedAt: 1000 },
    ]
    localStorage.setItem(KEY, JSON.stringify(stored))
    expect(readGroceryList()).toEqual(stored)
  })
})

// ─── addIngredientsToGrocery ──────────────────────────────────────────────────

describe('addIngredientsToGrocery', () => {
  it('adds new ingredients to an empty list', () => {
    addIngredientsToGrocery(
      [{ name: 'Flour', quantity: '200', unit: 'g' }],
      'Bread',
      null
    )
    const items = readGroceryList()
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('Flour')
    expect(items[0].quantity).toBe('200')
    expect(items[0].unit).toBe('g')
    expect(items[0].dishName).toBe('Bread')
    expect(items[0].restaurantName).toBeNull()
    expect(items[0].checked).toBe(false)
  })

  it('skips ingredients with empty or whitespace-only names', () => {
    addIngredientsToGrocery(
      [{ name: '' }, { name: '   ' }, { name: 'Salt' }],
      'Soup',
      null
    )
    const items = readGroceryList()
    expect(items).toHaveLength(1)
    expect(items[0].name).toBe('Salt')
  })

  it('deduplicates by name (case-insensitive) and merges matching quantities', () => {
    addIngredientsToGrocery([{ name: 'Butter', quantity: '50', unit: 'g' }], 'Toast', null)
    addIngredientsToGrocery([{ name: 'butter', quantity: '100', unit: 'g' }], 'Cake', null)

    const items = readGroceryList()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe('150') // 50 + 100
  })

  it('keeps existing item when units differ and cannot merge', () => {
    addIngredientsToGrocery([{ name: 'Milk', quantity: '1', unit: 'cup' }], 'Cereal', null)
    addIngredientsToGrocery([{ name: 'Milk', quantity: '200', unit: 'ml' }], 'Smoothie', null)

    const items = readGroceryList()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe('1')  // unchanged — unit mismatch
    expect(items[0].unit).toBe('cup')
  })

  it('keeps existing item when quantities are non-numeric', () => {
    addIngredientsToGrocery([{ name: 'Salt', quantity: 'a pinch', unit: null }], 'Pasta', null)
    addIngredientsToGrocery([{ name: 'Salt', quantity: 'to taste', unit: null }], 'Soup', null)

    const items = readGroceryList()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe('a pinch')  // unchanged
  })

  it('handles fraction quantities (1/2 + 1/2 = 1)', () => {
    addIngredientsToGrocery([{ name: 'Cup sugar', quantity: '1/2', unit: 'cup' }], 'Cake A', null)
    addIngredientsToGrocery([{ name: 'Cup sugar', quantity: '1/2', unit: 'cup' }], 'Cake B', null)

    const items = readGroceryList()
    expect(items).toHaveLength(1)
    expect(items[0].quantity).toBe('1')
  })

  it('each new item gets a unique id', () => {
    addIngredientsToGrocery(
      [{ name: 'Eggs' }, { name: 'Milk' }],
      'Omelette',
      null
    )
    const items = readGroceryList()
    expect(items[0].id).not.toBe(items[1].id)
    expect(typeof items[0].id).toBe('string')
    expect(items[0].id.length).toBeGreaterThan(0)
  })

  it('dispatches plately:grocery-updated event', () => {
    let fired = false
    window.addEventListener('plately:grocery-updated', () => { fired = true }, { once: true })
    addIngredientsToGrocery([{ name: 'Onion' }], 'Soup', null)
    expect(fired).toBe(true)
  })
})

// ─── toggleGroceryItem ────────────────────────────────────────────────────────

describe('toggleGroceryItem', () => {
  it('toggles unchecked → checked', () => {
    addIngredientsToGrocery([{ name: 'Eggs' }], 'Omelette', null)
    const [item] = readGroceryList()
    expect(item.checked).toBe(false)

    toggleGroceryItem(item.id)
    expect(readGroceryList()[0].checked).toBe(true)
  })

  it('toggles checked → unchecked', () => {
    addIngredientsToGrocery([{ name: 'Eggs' }], 'Omelette', null)
    const [item] = readGroceryList()
    toggleGroceryItem(item.id)
    toggleGroceryItem(item.id)
    expect(readGroceryList()[0].checked).toBe(false)
  })

  it('is a no-op for unknown id', () => {
    addIngredientsToGrocery([{ name: 'Eggs' }], 'Omelette', null)
    toggleGroceryItem('nonexistent-id')
    expect(readGroceryList()[0].checked).toBe(false)
  })
})

// ─── removeGroceryItem ────────────────────────────────────────────────────────

describe('removeGroceryItem', () => {
  it('removes item by id', () => {
    addIngredientsToGrocery([{ name: 'Eggs' }, { name: 'Butter' }], 'Cake', null)
    const items = readGroceryList()
    const eggsId = items.find((i) => i.name === 'Eggs')!.id

    removeGroceryItem(eggsId)
    const remaining = readGroceryList()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].name).toBe('Butter')
  })

  it('is a no-op for unknown id', () => {
    addIngredientsToGrocery([{ name: 'Eggs' }], 'Omelette', null)
    removeGroceryItem('does-not-exist')
    expect(readGroceryList()).toHaveLength(1)
  })
})

// ─── clearGroceryList ─────────────────────────────────────────────────────────

describe('clearGroceryList', () => {
  it('removes all items', () => {
    addIngredientsToGrocery([{ name: 'Eggs' }, { name: 'Butter' }], 'Cake', null)
    expect(readGroceryList()).toHaveLength(2)
    clearGroceryList()
    expect(readGroceryList()).toHaveLength(0)
  })

  it('is a no-op on empty list', () => {
    expect(() => clearGroceryList()).not.toThrow()
    expect(readGroceryList()).toHaveLength(0)
  })
})

// ─── clearCheckedItems ────────────────────────────────────────────────────────

describe('clearCheckedItems', () => {
  it('removes only checked items', () => {
    addIngredientsToGrocery([{ name: 'Eggs' }, { name: 'Butter' }], 'Cake', null)
    const items = readGroceryList()
    toggleGroceryItem(items[0].id) // check Eggs

    clearCheckedItems()
    const remaining = readGroceryList()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].name).toBe('Butter')
  })

  it('is a no-op when nothing is checked', () => {
    addIngredientsToGrocery([{ name: 'Eggs' }], 'Omelette', null)
    clearCheckedItems()
    expect(readGroceryList()).toHaveLength(1)
  })
})
