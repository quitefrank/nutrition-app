/**
 * palette.ts — Client-side dominant color extraction from dish photos.
 *
 * Downscales the image to a 64×64 canvas, samples pixels in a grid, quantizes
 * to 16 levels per channel, and returns the most common warm/saturated color
 * bucket along with a muted variant for gradient blending.
 *
 * Results are cached in-memory for the session so repeated calls for the same
 * URL are instant and produce no extra network or GPU work.
 */

export interface PaletteResult {
  /** Dominant warm color as a hex string, e.g. "#C4622D" */
  dominant: string
  /** Lighter/more transparent muted version for overlay gradients */
  muted: string
  /** True when the dominant color's luminance is below 0.4 */
  isDark: boolean
}

// In-memory session cache — keyed by imageUrl
const cache = new Map<string, PaletteResult>()

// ─── Public API ─────────────────────────────────────────────

/**
 * Extract the dominant warm color from an image URL.
 * Returns null if:
 *  - called server-side (no canvas available)
 *  - the image fails to load
 *  - no sufficiently saturated pixels are found
 */
export async function extractPalette(imageUrl: string): Promise<PaletteResult | null> {
  // Server-side guard
  if (typeof window === 'undefined' || typeof document === 'undefined') return null

  // Return cached result if available
  const cached = cache.get(imageUrl)
  if (cached) return cached

  try {
    const result = await extractFromUrl(imageUrl)
    if (result) cache.set(imageUrl, result)
    return result
  } catch {
    return null
  }
}

// ─── Internal implementation ─────────────────────────────────

const SAMPLE_SIZE = 64  // downscale target (px)
const QUANTIZE = 16     // color buckets per channel (256 / 16 = 16-level grid)
// Minimum color spread before we consider a pixel "warm/saturated" (skip near-grays)
const MIN_SATURATION_SPREAD = 30

async function extractFromUrl(imageUrl: string): Promise<PaletteResult | null> {
  const img = await loadImage(imageUrl)

  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE_SIZE
  canvas.height = SAMPLE_SIZE

  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(img, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

  const { data } = ctx.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE)

  // Count occurrences of each quantized color bucket, biasing toward warm/saturated
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>()

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]

    // Skip transparent pixels
    if (a < 128) continue

    // Skip near-grays (low saturation)
    const spread = Math.max(r, g, b) - Math.min(r, g, b)
    if (spread < MIN_SATURATION_SPREAD) continue

    // Quantize to reduce color space
    const qr = Math.round(r / QUANTIZE) * QUANTIZE
    const qg = Math.round(g / QUANTIZE) * QUANTIZE
    const qb = Math.round(b / QUANTIZE) * QUANTIZE

    const key = `${qr},${qg},${qb}`
    const existing = buckets.get(key)
    if (existing) {
      existing.count++
    } else {
      buckets.set(key, { r: qr, g: qg, b: qb, count: 1 })
    }
  }

  if (buckets.size === 0) return null

  // Find the bucket with the highest count
  let dominant: { r: number; g: number; b: number; count: number } | null = null
  for (const bucket of buckets.values()) {
    if (!dominant || bucket.count > dominant.count) {
      dominant = bucket
    }
  }

  if (!dominant) return null

  const { r, g, b } = dominant
  const isDark = relativeLuminance(r, g, b) < 0.4

  return {
    dominant: toHex(r, g, b),
    muted: toMuted(r, g, b),
    isDark,
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

// ─── Color math helpers ──────────────────────────────────────

function toHex(r: number, g: number, b: number): string {
  return (
    '#' +
    r.toString(16).padStart(2, '0') +
    g.toString(16).padStart(2, '0') +
    b.toString(16).padStart(2, '0')
  )
}

/**
 * Generate a lighter, more transparent muted variant suitable for gradient
 * overlays. Blends the color 50% toward white and reduces it to a CSS rgba
 * string at 0.18 opacity.
 */
function toMuted(r: number, g: number, b: number): string {
  const mr = Math.round(r + (255 - r) * 0.5)
  const mg = Math.round(g + (255 - g) * 0.5)
  const mb = Math.round(b + (255 - b) * 0.5)
  return `rgba(${mr}, ${mg}, ${mb}, 0.18)`
}

/**
 * WCAG relative luminance for a linear sRGB triplet (0–255).
 * https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
function relativeLuminance(r: number, g: number, b: number): number {
  const linearize = (v: number) => {
    const s = v / 255
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)
}
