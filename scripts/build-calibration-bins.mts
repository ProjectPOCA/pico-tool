/**
 * Regenerate the bundled calibration .bin planes from the source PNGs in
 * resources/payloads/calibration/src/. Run with: npm run build-calibration
 *
 * Uses the same quantize/pack pipeline as the in-app Raster Image mode
 * (src/shared/binpack.ts), so these bins double as golden fixtures.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'
import { quantize, packPlanes, packQuad2bpp } from '../src/shared/binpack'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(root, 'resources/payloads/calibration/src')
const panelsDir = join(root, 'resources/payloads/panels')

const TARGETS = [
  { png: 'calibration_1in5_200x200.png', family: '1in52', base: 'poca_calibration_1in5', w: 200, h: 200 },
  { png: 'calibration_2in1_248x128.png', family: '2in1', base: 'poca_calibration_2in1', w: 248, h: 128 },
  { png: 'calibration_4in2_400x300.png', family: '4in2', base: 'poca_calibration_4in2', w: 400, h: 300 }
]

for (const t of TARGETS) {
  const png = PNG.sync.read(readFileSync(join(srcDir, t.png)))
  if (png.width !== t.w || png.height !== t.h) {
    throw new Error(`${t.png}: expected ${t.w}x${t.h}, got ${png.width}x${png.height}`)
  }
  const indexed = quantize(new Uint8Array(png.data), t.w, t.h, {
    palette: ['white', 'black', 'red', 'yellow'],
    dither: 0
  })
  const outDir = join(panelsDir, t.family, 'assets')
  mkdirSync(outDir, { recursive: true })

  const planes = packPlanes(indexed, t.w, t.h)
  for (const ink of ['black', 'red', 'yellow'] as const) {
    const file = join(outDir, `${t.base}_${ink}.bin`)
    writeFileSync(file, planes[ink])
    console.log('wrote', file, planes[ink].length)
  }
  const quad = packQuad2bpp(indexed, t.w, t.h)
  const quadFile = join(outDir, `${t.base}_quad2bpp.bin`)
  writeFileSync(quadFile, quad)
  console.log('wrote', quadFile, quad.length)
}
