'use client'

import { GroceryIngredientView } from '@/components/grocery/grocery-ingredient-view'

export default function GroceriesPage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        background: 'var(--bg-primary)',
        padding: '0 0 env(safe-area-inset-bottom)',
      }}
    >
      {/* Story 4.3 will add a toggle pill here (ingredient-view / recipe-view) */}
      <GroceryIngredientView />
    </main>
  )
}
