import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { app } from 'electron'
import { manifestSchema, type Manifest, type PanelManifestEntry } from '@shared/manifest-schema'
import type { PanelEntry } from '@shared/types'

/**
 * Loads and validates resources/payloads/manifest.json and resolves payload
 * file paths. The consumer-facing PanelEntry view strips the internal block.
 */

let cached: Manifest | null = null

export function resourcesRoot(): string {
  // Tests/tools point this at the repo checkout explicitly.
  if (process.env.PICO_TOOL_RESOURCES) {
    return process.env.PICO_TOOL_RESOURCES
  }
  // Packaged: extraResources land in process.resourcesPath/resources.
  if (app?.isPackaged) {
    return join(process.resourcesPath, 'resources')
  }
  // Dev: the bundled main runs from out/main/, two levels below the repo root.
  return resolve(__dirname, '../../resources')
}

export function payloadsRoot(): string {
  return join(resourcesRoot(), 'payloads')
}

export function loadManifest(): Manifest {
  if (cached) return cached
  const path = join(payloadsRoot(), 'manifest.json')
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  cached = manifestSchema.parse(raw)
  verifyFiles(cached)
  return cached
}

/** Fail loudly (at startup in dev/CI) if the manifest references missing files. */
function verifyFiles(manifest: Manifest): void {
  const missing: string[] = []
  const check = (rel: string) => {
    if (!existsSync(join(payloadsRoot(), rel))) missing.push(rel)
  }
  if (!existsSync(join(resourcesRoot(), manifest.firmware.uf2))) {
    missing.push(manifest.firmware.uf2)
  }
  for (const panel of manifest.panels) {
    const internal = panel.internal
    if ('modules' in internal) {
      for (const m of internal.modules) check(m.src)
      for (const a of internal.runtimeAssets) check(a.src)
      check(internal.calibration.planes.black)
      if (internal.calibration.planes.red) check(internal.calibration.planes.red)
      if (internal.calibration.planes.yellow) check(internal.calibration.planes.yellow)
      if (internal.calibration.quad) check(internal.calibration.quad)
      check(`viewers/${internal.viewerTemplate}.py.tpl`)
    } else {
      for (const rel of Object.values(internal.uf2)) check(rel)
    }
  }
  if (missing.length > 0) {
    throw new Error(`manifest references missing payload files:\n  ${missing.join('\n  ')}`)
  }
}

export function getPanel(panelId: string): PanelManifestEntry {
  const panel = loadManifest().panels.find(
    (p) => p.panelId === panelId || p.aliases.includes(panelId)
  )
  if (!panel) throw new Error(`unknown panel: ${panelId}`)
  return panel
}

/** Consumer-safe catalog: no backend names, no file paths. */
export function panelCatalog(): PanelEntry[] {
  return loadManifest().panels.map((p) => ({
    panelId: p.panelId,
    aliases: p.aliases,
    displayName: p.displayName,
    sizeClass: p.sizeClass,
    resolution: p.resolution,
    colors: p.colors,
    refreshSeconds: p.refreshSeconds,
    variantGroup: p.variantGroup,
    variantLabel: p.variantLabel,
    payloadType: p.payloadType,
    available: p.available
  }))
}

export function readPayloadFile(rel: string): Buffer {
  return readFileSync(join(payloadsRoot(), rel))
}

export function firmwareUf2Path(): string {
  return join(resourcesRoot(), loadManifest().firmware.uf2)
}
