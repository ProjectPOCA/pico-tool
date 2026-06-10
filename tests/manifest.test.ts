import { beforeAll, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { loadManifest, panelCatalog, getPanel } from '../src/main/payloads/manifest'

beforeAll(() => {
  process.env.PICO_TOOL_RESOURCES = resolve(__dirname, '../resources')
})

describe('payload manifest', () => {
  it('validates and finds every referenced file on disk', () => {
    const manifest = loadManifest()
    expect(manifest.panels.length).toBeGreaterThanOrEqual(10)
  })

  it('exposes a consumer catalog without internal driver details', () => {
    const catalog = panelCatalog()
    const json = JSON.stringify(catalog)
    expect(json).not.toMatch(/backend|vusion|power_rail|ssd|q_series|\.py/i)
    for (const entry of catalog) {
      expect(entry.panelId).toMatch(/^E2\d/)
      expect(entry.colors).toContain('black')
      expect(entry.colors).toContain('white')
      expect(entry.refreshSeconds).toBeGreaterThan(0)
    }
  })

  it('groups the two same-color 2.1 drivers as anonymous a/b variants', () => {
    const a = getPanel('E2206JS071')
    const b = getPanel('E2206JSHJ1')
    expect(a.variantGroup).toBe(b.variantGroup)
    expect(a.variantLabel).toBe('a')
    expect(b.variantLabel).toBe('b')
  })

  it('resolves harvested-label aliases to the same panel', () => {
    expect(getPanel('E2206JS0E1').panelId).toBe('E2206JS071')
  })

  it('lists 7.4 panels as present but unavailable until UF2 binaries land', () => {
    for (const id of ['E2741JS0B1', 'E2741QS0B2']) {
      const p = getPanel(id)
      expect(p.payloadType).toBe('uf2')
      expect(p.available).toBe(false)
    }
  })
})
