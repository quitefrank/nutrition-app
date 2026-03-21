// atmospheric.ts — colour extraction and contrast utilities
// NOTE: Uses browser Canvas API — call from 'use client' context only.

import type { AtmosphericPalette, AtmosphericState } from '@/types/domain'

// ─── Cuisine fallback palette map ────────────────────────────────────────────

const CUISINE_FALLBACKS: Record<string, string> = {
  italian: '#1a0f08',     // warm dark brown
  japanese: '#0a0f1a',    // cool dark blue
  french: '#0f1208',      // dark earthy green
  mexican: '#1a0a00',     // deep warm orange-brown
  american: '#0d0d0d',    // neutral dark
  chinese: '#1a0808',     // deep red-black
  indian: '#1a0c00',      // warm spiced dark
  default: '#0a0a0a',
}

const NEUTRAL_BASE = '#0a0a0a'

// ─── WCAG relative luminance ─────────────────────────────────────────────────

function getRelativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const sRGB = c / 255
    return sRGB <= 0.04045 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function parseHexToRgb(hex: string): [number, number, number] | null {
  let clean = hex.replace('#', '')
  // Expand 3-character shorthand (#abc → #aabbcc)
  if (clean.length === 3) {
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]
  }
  if (clean.length !== 6) return null
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null
  return [r, g, b]
}

export function getContrastRatio(fg: string, bg: string): number {
  const fgRgb = parseHexToRgb(fg)
  const bgRgb = parseHexToRgb(bg)
  if (!fgRgb || !bgRgb) return 1

  const l1 = getRelativeLuminance(...fgRgb)
  const l2 = getRelativeLuminance(...bgRgb)
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * WCAG AA: normal text ≥ 4.5:1, large text / UI ≥ 3:1.
 * We use the 4.5:1 threshold (body text) as the gating criterion.
 */
export function checkWcagContrast(foreground: string, background: string): boolean {
  return getContrastRatio(foreground, background) >= 4.5
}

// ─── Canvas-based palette extraction ─────────────────────────────────────────

const EXTRACT_TIMEOUT_MS = 8000

export async function extractPalette(imageUrl: string): Promise<AtmosphericPalette | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), EXTRACT_TIMEOUT_MS)

    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      clearTimeout(timer)
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 50
        canvas.height = 50
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve(null)
          return
        }
        ctx.drawImage(img, 0, 0, 50, 50)
        const { data } = ctx.getImageData(0, 0, 50, 50)

        let rSum = 0
        let gSum = 0
        let bSum = 0
        let count = 0
        // Sample every 4th pixel for speed (data is [r,g,b,a, r,g,b,a, ...])
        for (let i = 0; i < data.length; i += 16) {
          const a = data[i + 3]
          if (a > 128) { // skip mostly-transparent pixels
            rSum += data[i]
            gSum += data[i + 1]
            bSum += data[i + 2]
            count++
          }
        }

        if (count === 0) {
          resolve(null)
          return
        }

        const r = Math.round(rSum / count)
        const g = Math.round(gSum / count)
        const b = Math.round(bSum / count)
        const toHex = (n: number) => n.toString(16).padStart(2, '0')
        const dominantColor = `#${toHex(r)}${toHex(g)}${toHex(b)}`

        resolve({ dominantColor, sourceImageUrl: imageUrl })
      } catch {
        resolve(null)
      }
    }

    img.onerror = () => { clearTimeout(timer); resolve(null) }
    img.src = imageUrl
  })
}

// ─── Cuisine fallback ─────────────────────────────────────────────────────────

export function getCuisineFallback(cuisineType: string): AtmosphericPalette {
  const key = cuisineType.toLowerCase()
  const dominantColor = CUISINE_FALLBACKS[key] ?? CUISINE_FALLBACKS.default
  return { dominantColor, sourceImageUrl: '' }
}

// ─── Tiered background builder ────────────────────────────────────────────────

/**
 * Resolves the atmospheric state using the three-tier fallback system:
 *   Tier 1: restaurant-specific (imageUrl + extracted palette)
 *   Tier 2: cuisine-type fallback palette
 *   Tier 3: neutral dark base (#0a0a0a)
 *
 * Each tier is contrast-gated against text-primary (white in dark mode).
 * The winning tier is logged via console.debug.
 */
const isDev = process.env.NODE_ENV === 'development'

export function buildTieredBackground(
  restaurantId?: string,
  cuisineType?: string,
  palette?: AtmosphericPalette | null,
): AtmosphericState {
  // Text primary in dark mode (used as foreground for contrast check)
  const TEXT_PRIMARY_DARK = '#ffffff'

  // Tier 1: restaurant-specific extracted palette
  if (palette?.dominantColor && palette.sourceImageUrl) {
    if (checkWcagContrast(TEXT_PRIMARY_DARK, palette.dominantColor)) {
      if (isDev) console.debug('[atmospheric] tier applied: restaurant', { restaurantId, imageUrl: palette.sourceImageUrl })
      return {
        imageUrl: palette.sourceImageUrl,
        palette,
        tier: 'restaurant',
        backgroundColorFallback: palette.dominantColor,
      }
    }
    if (isDev) console.debug('[atmospheric] tier 1 contrast failed — falling to tier 2', { restaurantId, imageUrl: palette.sourceImageUrl })
  }

  // Tier 2: cuisine fallback palette
  if (cuisineType) {
    const cuisinePalette = getCuisineFallback(cuisineType)
    if (checkWcagContrast(TEXT_PRIMARY_DARK, cuisinePalette.dominantColor)) {
      if (isDev) console.debug('[atmospheric] tier applied: cuisine', { restaurantId, cuisineType, imageUrl: null })
      return {
        imageUrl: null,
        palette: cuisinePalette,
        tier: 'cuisine',
        backgroundColorFallback: cuisinePalette.dominantColor,
      }
    }
    if (isDev) console.debug('[atmospheric] tier 2 contrast failed — falling to tier 3', { restaurantId, cuisineType, imageUrl: null })
  }

  // Tier 3: neutral base — always passes
  if (isDev) console.debug('[atmospheric] tier applied: neutral', { restaurantId, imageUrl: null })
  return {
    imageUrl: null,
    palette: null,
    tier: 'neutral',
    backgroundColorFallback: NEUTRAL_BASE,
  }
}
