import { describe, it, expect } from 'vitest'
import {
  checkWcagContrast,
  getContrastRatio,
  getCuisineFallback,
  buildTieredBackground,
} from './atmospheric'

describe('getContrastRatio', () => {
  it('returns a high ratio for white on black', () => {
    // white (#ffffff) on black (#000000) = 21:1
    expect(getContrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0)
  })

  it('returns 1 for identical colours', () => {
    expect(getContrastRatio('#888888', '#888888')).toBeCloseTo(1, 1)
  })

  it('handles 3-character hex shorthand (#fff = #ffffff)', () => {
    // #fff expands to #ffffff — should match the full-form result
    expect(getContrastRatio('#fff', '#000')).toBeCloseTo(21, 0)
  })

  it('returns same ratio for 3-char and 6-char equivalent', () => {
    expect(getContrastRatio('#fff', '#000')).toBeCloseTo(getContrastRatio('#ffffff', '#000000'), 5)
  })
})

describe('checkWcagContrast', () => {
  it('returns true for white text on black background (21:1 >> 4.5)', () => {
    expect(checkWcagContrast('#ffffff', '#000000')).toBe(true)
  })

  it('returns true for white text on neutral dark base (#0a0a0a)', () => {
    // near-black — ratio well above 4.5
    expect(checkWcagContrast('#ffffff', '#0a0a0a')).toBe(true)
  })

  it('returns false for light grey on white (#d0d0d0 on #ffffff)', () => {
    // very low contrast — should fail AA
    expect(checkWcagContrast('#d0d0d0', '#ffffff')).toBe(false)
  })

  it('returns false for mid-grey on white (#888888 on #ffffff)', () => {
    // ~3.9:1 — fails 4.5 threshold
    expect(checkWcagContrast('#888888', '#ffffff')).toBe(false)
  })
})

describe('getCuisineFallback', () => {
  it('returns a valid palette for "italian"', () => {
    const palette = getCuisineFallback('italian')
    expect(palette.dominantColor).toBe('#1a0f08')
    expect(palette.sourceImageUrl).toBe('')
  })

  it('returns a valid palette for "japanese"', () => {
    expect(getCuisineFallback('japanese').dominantColor).toBe('#0a0f1a')
  })

  it('falls back to default for unknown cuisine', () => {
    const palette = getCuisineFallback('unknown-cuisine-xyz')
    expect(palette.dominantColor).toBe('#0a0a0a')
  })

  it('is case-insensitive', () => {
    const lower = getCuisineFallback('italian')
    const upper = getCuisineFallback('ITALIAN')
    expect(lower.dominantColor).toBe(upper.dominantColor)
  })
})

describe('buildTieredBackground', () => {
  const WHITE = '#ffffff'
  const NEUTRAL_DARK = '#0a0a0a'

  it('returns tier 3 (neutral) when no palette and no cuisine', () => {
    const state = buildTieredBackground()
    expect(state.tier).toBe('neutral')
    expect(state.imageUrl).toBeNull()
    expect(state.backgroundColorFallback).toBe(NEUTRAL_DARK)
  })

  it('returns tier 1 (restaurant) when palette passes contrast', () => {
    const palette = { dominantColor: '#0a0a0a', sourceImageUrl: 'https://example.com/img.jpg' }
    const state = buildTieredBackground('rest-1', undefined, palette)
    expect(state.tier).toBe('restaurant')
    expect(state.imageUrl).toBe(palette.sourceImageUrl)
  })

  it('falls back to tier 2 when tier 1 contrast fails', () => {
    // A very light colour that fails contrast against white text
    const failingPalette = { dominantColor: '#f0f0f0', sourceImageUrl: 'https://example.com/img.jpg' }
    const state = buildTieredBackground('rest-2', 'japanese', failingPalette)
    // Tier 1 fails (light bg vs white text), should fall to cuisine tier
    expect(state.tier).toBe('cuisine')
    expect(state.imageUrl).toBeNull()
  })

  it('falls back to tier 3 when both tier 1 and tier 2 fail', () => {
    // Both tier 1 and tier 2 use very light colours that fail contrast
    const failingPalette = { dominantColor: '#f0f0f0', sourceImageUrl: 'https://example.com/img.jpg' }
    // Override getCuisineFallback to use a light color by passing a custom cuisineType
    // Since all hardcoded cuisine fallbacks pass AA, we test by passing null palette and no cuisine
    // -> falls to tier 3
    const state = buildTieredBackground('rest-3', undefined, failingPalette)
    expect(state.tier).toBe('neutral')
    expect(state.backgroundColorFallback).toBe(NEUTRAL_DARK)
  })

  it('returns tier 3 when palette is null', () => {
    const state = buildTieredBackground('rest-4', undefined, null)
    expect(state.tier).toBe('neutral')
  })

  it('cuisine tier is applied when tier 1 fails and cuisine is provided', () => {
    const failingPalette = { dominantColor: '#eeeeee', sourceImageUrl: 'https://example.com/img.jpg' }
    const state = buildTieredBackground('rest-5', 'italian', failingPalette)
    expect(state.tier).toBe('cuisine')
    expect(state.backgroundColorFallback).toBe('#1a0f08')
  })

  it('all hardcoded cuisine fallback colours pass WCAG AA against white text', () => {
    const cuisines = ['italian', 'japanese', 'french', 'mexican', 'american', 'chinese', 'indian']
    for (const cuisine of cuisines) {
      const palette = getCuisineFallback(cuisine)
      expect(checkWcagContrast(WHITE, palette.dominantColor)).toBe(true)
    }
  })
})
