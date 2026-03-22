import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'
import { FeaturedRecipeCard } from './featured-recipe-card'
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
  id: 'recipe-featured-1',
  name: 'Truffle Risotto',
  restaurantId: 'rest-2',
  dishImageUrl: 'https://example.com/risotto.jpg',
  confidenceMetadataJson: null,
  servingSize: 2,
  createdAt: '2026-03-22T00:00:00Z',
  restaurant: { id: 'rest-2', name: 'Osteria Bello', googlePlacesId: null, atmosphericPaletteJson: null, updatedAt: '2026-03-22T00:00:00Z' },
}

describe('FeaturedRecipeCard', () => {
  it('renders recipe name', () => {
    render(<FeaturedRecipeCard recipe={baseRecipe} />)
    expect(screen.getByText('Truffle Risotto')).toBeTruthy()
  })

  it('renders restaurant name when present', () => {
    render(<FeaturedRecipeCard recipe={baseRecipe} />)
    expect(screen.getByText('Osteria Bello')).toBeTruthy()
  })

  it('does not render restaurant name when restaurant is null', () => {
    render(<FeaturedRecipeCard recipe={{ ...baseRecipe, restaurant: null }} />)
    expect(screen.queryByText('Osteria Bello')).toBeNull()
  })

  it('renders image when dishImageUrl is set', () => {
    render(<FeaturedRecipeCard recipe={baseRecipe} />)
    const img = screen.getByRole('img')
    expect(img.getAttribute('src')).toBe('https://example.com/risotto.jpg')
  })

  it('renders placeholder when dishImageUrl is null', () => {
    render(<FeaturedRecipeCard recipe={{ ...baseRecipe, dishImageUrl: null }} />)
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('link href points to /recipes/{id}', () => {
    render(<FeaturedRecipeCard recipe={baseRecipe} />)
    const link = screen.getByRole('link')
    expect(link.getAttribute('href')).toBe('/recipes/recipe-featured-1')
  })
})
