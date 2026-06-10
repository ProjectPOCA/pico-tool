import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PNG } from 'pngjs'
import { INK, packPlanes, packQuad2bpp, quantize } from '../src/shared/binpack'

describe('quantize + pack against hand-computed fixtures', () => {
  // 8 pixels in one row: B W R Y B B W W
  const rgba = new Uint8Array(
    [
      [0, 0, 0],
      [255, 255, 255],
      [255, 0, 0],
      [255, 215, 0],
      [10, 10, 10],
      [30, 0, 0],
      [250, 250, 250],
      [240, 245, 240]
    ].flatMap(([r, g, b]) => [r, g, b, 255])
  )

  it('quantizes to the nearest ink', () => {
    const idx = quantize(rgba, 8, 1, { palette: ['white', 'black', 'red', 'yellow'], dither: 0 })
    expect([...idx]).toEqual([
      INK.black,
      INK.white,
      INK.red,
      INK.yellow,
      INK.black,
      INK.black,
      INK.white,
      INK.white
    ])
  })

  it('packs 1bpp ink planes MSB-first with set bit = ink', () => {
    const idx = quantize(rgba, 8, 1, { palette: ['white', 'black', 'red', 'yellow'], dither: 0 })
    const planes = packPlanes(idx, 8, 1)
    expect(planes.black[0]).toBe(0b10001100)
    expect(planes.red[0]).toBe(0b00100000)
    expect(planes.yellow[0]).toBe(0b00010000)
  })

  it('packs 2bpp quad frames: 00=black 01=white 10=yellow 11=red', () => {
    const idx = quantize(rgba, 8, 1, { palette: ['white', 'black', 'red', 'yellow'], dither: 0 })
    const quad = packQuad2bpp(idx, 8, 1)
    // B W R Y -> 00 01 11 10 ; B B W W -> 00 00 01 01
    expect(quad[0]).toBe(0b00011110)
    expect(quad[1]).toBe(0b00000101)
  })

  it('treats transparency as white paper', () => {
    const clear = new Uint8Array([0, 0, 0, 0])
    const idx = quantize(clear, 1, 1, { palette: ['white', 'black'], dither: 0 })
    expect(idx[0]).toBe(INK.white)
  })
})

describe('golden: bundled calibration bins regenerate from source PNGs', () => {
  const root = resolve(__dirname, '../resources/payloads')

  const cases = [
    { png: 'calibration/src/calibration_2in1_248x128.png', base: 'panels/2in1/assets/poca_calibration_2in1', w: 248, h: 128 },
    { png: 'calibration/src/calibration_4in2_400x300.png', base: 'panels/4in2/assets/poca_calibration_4in2', w: 400, h: 300 }
  ]

  for (const c of cases) {
    it(`matches ${c.base}`, () => {
      const png = PNG.sync.read(readFileSync(resolve(root, c.png)))
      const idx = quantize(new Uint8Array(png.data), c.w, c.h, {
        palette: ['white', 'black', 'red', 'yellow'],
        dither: 0
      })
      const planes = packPlanes(idx, c.w, c.h)
      for (const ink of ['black', 'red', 'yellow'] as const) {
        const golden = readFileSync(resolve(root, `${c.base}_${ink}.bin`))
        expect(Buffer.from(planes[ink]).equals(golden)).toBe(true)
      }
      const quadGolden = readFileSync(resolve(root, `${c.base}_quad2bpp.bin`))
      expect(Buffer.from(packQuad2bpp(idx, c.w, c.h)).equals(quadGolden)).toBe(true)
    })
  }
})
