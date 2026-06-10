import { indexedToRgba, packPlanes, packQuad2bpp, quantize, type InkColor } from '@shared/binpack'
import type { PanelEntry } from '@shared/types'

/**
 * Renderer-side image pipeline for Badge and Raster Image modes.
 *
 * Images at these resolutions (max 400x300) quantize in a couple of
 * milliseconds, so this runs synchronously rather than in a worker.
 */

export interface GeneratedPlanes {
  black: Uint8Array
  red?: Uint8Array
  yellow?: Uint8Array
  quad?: Uint8Array
  /** Quantized preview for on-screen display. */
  previewRgba: Uint8ClampedArray
  width: number
  height: number
}

export type FitMode = 'cover' | 'contain'

export function panelPalette(panel: PanelEntry): InkColor[] {
  return panel.colors as InkColor[]
}

/** Decode picked image bytes and rasterize at panel resolution. */
export async function rasterizeImage(
  bytes: Uint8Array,
  panel: PanelEntry,
  fit: FitMode
): Promise<ImageData> {
  const [w, h] = panel.resolution
  const blob = new Blob([bytes as BlobPart])
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, w, h)

  const scale =
    fit === 'cover'
      ? Math.max(w / bitmap.width, h / bitmap.height)
      : Math.min(w / bitmap.width, h / bitmap.height)
  const dw = bitmap.width * scale
  const dh = bitmap.height * scale
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, (w - dw) / 2, (h - dh) / 2, dw, dh)
  bitmap.close()
  return ctx.getImageData(0, 0, w, h)
}

/** Compose the badge: solid background, centered DM Sans text. */
export function renderBadge(
  text: string,
  background: InkColor,
  textColor: InkColor,
  panel: PanelEntry
): ImageData {
  const [w, h] = panel.resolution
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const css: Record<InkColor, string> = {
    white: '#FFFFFF',
    black: '#000000',
    red: '#FF0000',
    yellow: '#FFD700'
  }
  ctx.fillStyle = css[background]
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = css[textColor]
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const lines = text.split('\n').filter((l) => l.length > 0)
  if (lines.length > 0) {
    let size = Math.floor(h / (lines.length + 1))
    ctx.font = `700 ${size}px 'DM Sans'`
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width))
    if (widest > w * 0.88) {
      size = Math.max(10, Math.floor((size * w * 0.88) / widest))
      ctx.font = `700 ${size}px 'DM Sans'`
    }
    const lineHeight = size * 1.08
    const startY = h / 2 - ((lines.length - 1) * lineHeight) / 2
    lines.forEach((line, i) => ctx.fillText(line, w / 2, startY + i * lineHeight))
  }
  return ctx.getImageData(0, 0, w, h)
}

/** Quantize + pack for the selected panel. Dither strength 0..1. */
export function generatePlanes(
  image: ImageData,
  panel: PanelEntry,
  dither: number
): GeneratedPlanes {
  const [w, h] = panel.resolution
  const indexed = quantize(image.data, w, h, { palette: panelPalette(panel), dither })
  const planes = packPlanes(indexed, w, h)
  const hasYellow = panel.colors.includes('yellow')
  return {
    black: planes.black,
    red: panel.colors.includes('red') ? planes.red : undefined,
    yellow: hasYellow ? planes.yellow : undefined,
    quad: hasYellow ? packQuad2bpp(indexed, w, h) : undefined,
    previewRgba: indexedToRgba(indexed),
    width: w,
    height: h
  }
}

/** Paint a quantized preview into a canvas element. */
export function paintPreview(canvas: HTMLCanvasElement, planes: GeneratedPlanes): void {
  canvas.width = planes.width
  canvas.height = planes.height
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(
    new ImageData(planes.previewRgba as Uint8ClampedArray<ArrayBuffer>, planes.width, planes.height),
    0,
    0
  )
}
