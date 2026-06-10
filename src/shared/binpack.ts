/**
 * Image -> e-paper framebuffer conversion.
 *
 * Shared by the renderer imaging worker (Raster Image / Badge modes), the
 * calibration asset build script, and unit tests. Pure functions, no DOM.
 *
 * Plane format (BWR-family panels): one 1bpp buffer per ink color, MSB-first,
 * row stride ceil(w / 8); a set bit means "ink this pixel with the plane color".
 * Per-panel polarity inversion is applied by the on-device backend, not here.
 *
 * Packed format (quad-color panels): 2 bits per pixel, 4 pixels per byte,
 * MSB-first: 00=black, 01=white, 10=yellow, 11=red.
 */

export const PALETTE_RGB = {
  white: [255, 255, 255],
  black: [0, 0, 0],
  red: [255, 0, 0],
  yellow: [255, 215, 0]
} as const

export type InkColor = keyof typeof PALETTE_RGB

/** Palette index values used in the intermediate indexed image. */
export const INK: Record<InkColor, number> = { white: 0, black: 1, red: 2, yellow: 3 }
const INDEX_TO_INK: InkColor[] = ['white', 'black', 'red', 'yellow']

const QUAD_BITS: Record<InkColor, number> = { black: 0b00, white: 0b01, yellow: 0b10, red: 0b11 }

export interface QuantizeOptions {
  /** Ink colors available on the target panel (always include white + black). */
  palette: InkColor[]
  /**
   * Floyd–Steinberg serpentine error-diffusion strength, 0..1.
   * 0 = nearest color only; 1 = full diffusion; between = scaled error,
   * trading speckle for banding.
   */
  dither: number
}

/**
 * Quantize RGBA pixels to panel ink indexes (see INK). Transparent pixels
 * resolve against white, matching paper.
 */
export function quantize(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  options: QuantizeOptions
): Uint8Array {
  if (rgba.length < width * height * 4) {
    throw new Error(`rgba buffer too small: ${rgba.length} < ${width * height * 4}`)
  }
  const palette = options.palette.map((name) => ({
    index: INK[name],
    rgb: PALETTE_RGB[name]
  }))
  const out = new Uint8Array(width * height)

  const strength = Math.min(1, Math.max(0, options.dither))
  // Working copy in floats only when dithering (error diffusion mutates pixels).
  const work = strength > 0 ? new Float32Array(width * height * 3) : null
  if (work) {
    for (let i = 0, p = 0; i < width * height; i++, p += 3) {
      const a = rgba[i * 4 + 3] / 255
      work[p] = rgba[i * 4] * a + 255 * (1 - a)
      work[p + 1] = rgba[i * 4 + 1] * a + 255 * (1 - a)
      work[p + 2] = rgba[i * 4 + 2] * a + 255 * (1 - a)
    }
  }

  const nearest = (r: number, g: number, b: number) => {
    let best = palette[0]
    let bestD = Infinity
    for (const c of palette) {
      const dr = r - c.rgb[0]
      const dg = g - c.rgb[1]
      const db = b - c.rgb[2]
      const d = dr * dr + dg * dg + db * db
      if (d < bestD) {
        bestD = d
        best = c
      }
    }
    return best
  }

  if (!work) {
    for (let i = 0; i < width * height; i++) {
      const a = rgba[i * 4 + 3] / 255
      const r = rgba[i * 4] * a + 255 * (1 - a)
      const g = rgba[i * 4 + 1] * a + 255 * (1 - a)
      const b = rgba[i * 4 + 2] * a + 255 * (1 - a)
      out[i] = nearest(r, g, b).index
    }
    return out
  }

  // Floyd–Steinberg, serpentine scan.
  for (let y = 0; y < height; y++) {
    const ltr = y % 2 === 0
    for (let step = 0; step < width; step++) {
      const x = ltr ? step : width - 1 - step
      const i = y * width + x
      const p = i * 3
      const chosen = nearest(work[p], work[p + 1], work[p + 2])
      out[i] = chosen.index
      const er = (work[p] - chosen.rgb[0]) * strength
      const eg = (work[p + 1] - chosen.rgb[1]) * strength
      const eb = (work[p + 2] - chosen.rgb[2]) * strength
      const spread = (dx: number, dy: number, f: number) => {
        const nx = x + (ltr ? dx : -dx)
        const ny = y + dy
        if (nx < 0 || nx >= width || ny >= height) return
        const np = (ny * width + nx) * 3
        work[np] += er * f
        work[np + 1] += eg * f
        work[np + 2] += eb * f
      }
      spread(1, 0, 7 / 16)
      spread(-1, 1, 3 / 16)
      spread(0, 1, 5 / 16)
      spread(1, 1, 1 / 16)
    }
  }
  return out
}

export interface InkPlanes {
  black: Uint8Array
  red: Uint8Array
  yellow: Uint8Array
}

/**
 * Pack an indexed image into per-ink 1bpp planes (BWR-family format).
 * Matches the format of the committed POCA calibration bins.
 */
export function packPlanes(indexed: Uint8Array, width: number, height: number): InkPlanes {
  const stride = (width + 7) >> 3
  const len = stride * height
  const planes: InkPlanes = {
    black: new Uint8Array(len),
    red: new Uint8Array(len),
    yellow: new Uint8Array(len)
  }
  for (let y = 0; y < height; y++) {
    const row = y * stride
    for (let x = 0; x < width; x++) {
      const ink = INDEX_TO_INK[indexed[y * width + x]]
      if (ink === 'white') continue
      const i = row + (x >> 3)
      const bit = 0x80 >> (x & 7)
      planes[ink][i] |= bit
    }
  }
  return planes
}

/**
 * Pack an indexed image into the quad-color single-framebuffer format:
 * 2bpp, 4 pixels/byte, MSB-first; 00=black 01=white 10=yellow 11=red.
 */
export function packQuad2bpp(indexed: Uint8Array, width: number, height: number): Uint8Array {
  if (width % 4 !== 0) {
    throw new Error(`quad-color packing requires width % 4 === 0, got ${width}`)
  }
  const out = new Uint8Array((width * height) >> 2)
  for (let i = 0; i < width * height; i++) {
    const bits = QUAD_BITS[INDEX_TO_INK[indexed[i]]]
    out[i >> 2] |= bits << ((3 - (i & 3)) << 1)
  }
  return out
}

/** Render an indexed image back to RGBA for on-screen preview. */
export function indexedToRgba(indexed: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(indexed.length * 4)
  for (let i = 0; i < indexed.length; i++) {
    const [r, g, b] = PALETTE_RGB[INDEX_TO_INK[indexed[i]]]
    out[i * 4] = r
    out[i * 4 + 1] = g
    out[i * 4 + 2] = b
    out[i * 4 + 3] = 255
  }
  return out
}
