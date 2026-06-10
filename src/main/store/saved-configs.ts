import { mkdirSync, readFileSync, renameSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import type { FlashMode, SavedConfig } from '@shared/types'

/**
 * "My Pico" saved configurations. Plain JSON with atomic writes; generated
 * badge/raster planes are persisted alongside so re-flash works without the
 * original source image.
 */

function storeDir(): string {
  return app.getPath('userData')
}

function storePath(): string {
  return join(storeDir(), 'saved-picos.json')
}

function payloadDir(id: string): string {
  return join(storeDir(), 'saved-payloads', id)
}

export function listConfigs(): SavedConfig[] {
  try {
    const parsed = JSON.parse(readFileSync(storePath(), 'utf8'))
    return Array.isArray(parsed) ? (parsed as SavedConfig[]) : []
  } catch {
    return []
  }
}

function persist(configs: SavedConfig[]): void {
  mkdirSync(storeDir(), { recursive: true })
  const tmp = storePath() + '.tmp'
  writeFileSync(tmp, JSON.stringify(configs, null, 2))
  renameSync(tmp, storePath())
}

export interface SaveConfigInput {
  name: string
  panelId: string
  mode: FlashMode
  summary: string
  scriptName?: string
  scriptSource?: string
  planes?: { black?: Uint8Array; red?: Uint8Array; yellow?: Uint8Array; quad?: Uint8Array }
}

export function saveConfig(input: SaveConfigInput): SavedConfig {
  const id = randomUUID()
  const now = new Date().toISOString()
  let savedPayloadDir: string | undefined
  if (input.planes) {
    savedPayloadDir = payloadDir(id)
    mkdirSync(savedPayloadDir, { recursive: true })
    for (const key of ['black', 'red', 'yellow', 'quad'] as const) {
      const data = input.planes[key]
      if (data) writeFileSync(join(savedPayloadDir, `${key}.bin`), Buffer.from(data))
    }
  }
  const config: SavedConfig = {
    id,
    name: input.name,
    panelId: input.panelId,
    mode: input.mode,
    summary: input.summary,
    createdAt: now,
    lastFlashedAt: now,
    payloadDir: savedPayloadDir,
    scriptName: input.scriptName,
    scriptSource: input.scriptSource
  }
  persist([config, ...listConfigs()])
  return config
}

export function touchConfig(id: string): void {
  const configs = listConfigs()
  const c = configs.find((c) => c.id === id)
  if (!c) return
  c.lastFlashedAt = new Date().toISOString()
  persist(configs)
}

export function deleteConfig(id: string): void {
  persist(listConfigs().filter((c) => c.id !== id))
  const dir = payloadDir(id)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

/** Reload persisted planes for re-flashing a saved badge/raster config. */
export function loadConfigPlanes(
  config: SavedConfig
): { black?: Uint8Array; red?: Uint8Array; yellow?: Uint8Array; quad?: Uint8Array } | undefined {
  if (!config.payloadDir) return undefined
  const planes: Record<string, Uint8Array> = {}
  for (const key of ['black', 'red', 'yellow', 'quad']) {
    const p = join(config.payloadDir, `${key}.bin`)
    if (existsSync(p)) planes[key] = readFileSync(p)
  }
  return planes
}
