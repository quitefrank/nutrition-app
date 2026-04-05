import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { RecipeCard } from './recipe-card'
import type { Recipe } from '@/types/domain'

vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) =>
    React.createElement('a', { href, ...props }, children),
}))

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) =>
    React.createElement('img', { src, alt, ...props }),
}))

const baseRecipe: Recipe = {
  id: 'recipe-1',
  name: 'Duck Confit',
  restaurantId: 'rest-1',
  dishImageUrl: 'https://example.com/duck.jpg',
  confidenceMetadataJson: null,
  servingSize: 1,
  createdAt: '2026-03-22T00:00:00Z',
  restaurant: { id: 'rest-1', name: 'Le Canard', googlePlacesId: null, atmosphericPaletteJson: null, updatedAt: '2026-03-22T00:00:00Z' },
}

describe('RecipeCard', () => {
  it('renders recipe name', () => {
    render(<RecipeCard recipe={baseRecipe} />)
    expect(screen.getByText('Duck Confit')).toBeTruthy()
  })

  it('renders restaurant name when present', () => {
    render(<RecipeCard recipe={baseRecipe} />)
    expect(screen.getByText('Le Canard')).toBeTruthy()
  })

  it('does not render restaurant name when restaurant is null', () => {
    render(<RecipeCard recipe={{ ...baseRecipe, restaurant: null }} />)
    expect(screen.queryByText('Le Canard')).toBeNull()
  })

  it('renders image when dishImageUrl is set', () => {
    render(<RecipeCard recipe={baseRecipe} />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('src')).toBe('https://example.com/duck.jpg')
  })

  it('renders placeholder when dishImageUrl is null', () => {
    render(<RecipeCard recipe={{ ...baseRecipe, dishImageUrl: null }} />)
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('link href points to /recipes/{id}', () => {
    render(<RecipeCard recipe={baseRecipe} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/recipes/recipe-1')
  })
})
