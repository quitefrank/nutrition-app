'use client'

import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { GroceryIngredientView } from '@/components/grocery/grocery-ingredient-view'
import { GroceryRecipeView } from '@/components/grocery/grocery-recipe-view'

export default function GroceriesPage() {
  const [view, setView] = useState<'ingredients' | 'recipe'>('ingredients')
  const queryClient = useQueryClient()

  // After background sync fires queued PUT /api/grocery/[id] requests on reconnect,
  // invalidate both grocery query keys so the UI reflects the synced server state.
  // We delay 1.5s because the window `online` event fires before the service worker
  // `sync` event replays the queued PUTs — fetching immediately would return stale
  // (unchecked) server state. A BroadcastChannel from the SW would be more precise
  // but adds significant complexity; the delay is sufficient for this use case.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const handleOnline = () => {
      timer = setTimeout(() => {
        void queryClient.invalidateQueries({ queryKey: ['grocery-items'] })
        void queryClient.invalidateQueries({ queryKey: ['grocery-recipe-groups'] })
      }, 1500)
    }
    window.addEventListener('online', handleOnline)
    return () => {
      window.removeEventListener('online', handleOnline)
      clearTimeout(timer)
    }
  }, [queryClient])

  return (
    <main
      style={{
        minHeight: '100dvh',
        background: 'var(--bg-primary)',
        padding: '0 0 env(safe-area-inset-bottom)',
      }}
    >
      {/* View toggle pill — Ingredients / By Recipe */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '12px 16px 4px',
        }}
      >
        <div
          style={{
            display: 'flex',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(255,255,255,0.08)',
            padding: '2px',
            gap: '2px',
          }}
        >
          {(['ingredients', 'recipe'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              aria-pressed={view === v}
              style={{
                borderRadius: 'var(--radius-full)',
                padding: '4px 16px',
                fontSize: '0.875rem',
                fontWeight: view === v ? 600 : 400,
                background: view === v ? 'rgba(255,255,255,0.18)' : 'transparent',
                color: view === v ? 'var(--text-primary)' : 'var(--text-tertiary)',
                border: view === v ? '0.5px solid rgba(255,255,255,0.15)' : '0.5px solid transparent',
                cursor: 'pointer',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              {v === 'ingredients' ? 'Ingredients' : 'By Recipe'}
            </button>
          ))}
        </div>
      </div>

      {/* Crossfade container — both views always mounted, stacked in the same grid cell.
           CSS grid overlay: container height = max(ingredientView, recipeView) at all times,
           so neither view clips or bleeds excess whitespace into the other. */}
      <div style={{ display: 'grid' }}>
        <div
          style={{
            gridArea: '1 / 1',
            opacity: view === 'ingredients' ? 1 : 0,
            transition: 'opacity 0.2s ease',
            pointerEvents: view === 'ingredients' ? 'auto' : 'none',
          }}
        >
          <GroceryIngredientView />
        </div>

        <div
          style={{
            gridArea: '1 / 1',
            opacity: view === 'recipe' ? 1 : 0,
            transition: 'opacity 0.2s ease',
            pointerEvents: view === 'recipe' ? 'auto' : 'none',
          }}
        >
          <GroceryRecipeView />
        </div>
      </div>
    </main>
  )
}
