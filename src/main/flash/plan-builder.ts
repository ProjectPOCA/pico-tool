import type { FlashMode, FlashModeInputs, FlashStepId } from '@shared/types'
import type { MicropythonInternal } from '@shared/manifest-schema'
import { getPanel, readPayloadFile } from '../payloads/manifest'
import { renderTemplate } from '../payloads/templates'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { payloadsRoot } from '../payloads/manifest'

/**
 * Turns (panel, mode, inputs) into a concrete device write plan. All payload
 * bytes are materialized here so the orchestrator only moves buffers.
 */

export interface PlanFile {
  devicePath: string
  data: Buffer
  /** Which UI step this write belongs to. */
  step: 'driver' | 'load'
}

export interface FlashPlan {
  panelId: string
  mode: FlashMode
  payloadType: 'micropython' | 'uf2'
  dirs: string[]
  files: PlanFile[]
  /** Module main.py imports after install. */
  bootstrapImport: string
  totalBytes: number
  stepLabels: Record<FlashStepId, string>
  /** Absolute path of the UF2 to copy for uf2-type plans. */
  uf2Path?: string
}

const MODE_LABELS: Record<FlashMode, string> = {
  'poca-os': 'Load POCA OS',
  badge: 'Load Badge',
  activity: 'Load MicroPython Activity',
  raster: 'Load Raster Image',
  'test-display': 'Load test pattern'
}

/** Viewer overrides matching the runtime bootstrap's landscape defaults. */
function viewerOverrides(internal: MicropythonInternal): Record<string, unknown> {
  if (internal.family === '2in1') {
    return {
      ui_w: 248,
      ui_h: 128,
      panel_w: 128,
      panel_h: 248,
      panel_rotation: 'cw',
      ...internal.configTemplate.overrides
    }
  }
  return { ...internal.configTemplate.overrides }
}

function backendModuleName(internal: MicropythonInternal): string {
  const backendModule = internal.modules.find((m) => m.dest.includes('backend'))
  if (!backendModule) throw new Error(`no backend module for family ${internal.family}`)
  return backendModule.dest.replace(/^\//, '').replace(/\.py$/, '')
}

export function buildPlan(panelId: string, mode: FlashMode, inputs?: FlashModeInputs): FlashPlan {
  const panel = getPanel(panelId)
  if (!panel.available) {
    throw new Error(`panel ${panelId} is not flashable yet`)
  }

  if (!('modules' in panel.internal)) {
    // UF2 payload (7.4" class). The plan is a single binary copy.
    const uf2Rel = panel.internal.uf2[mode === 'poca-os' ? 'pocaOs' : mode]
    if (!uf2Rel) throw new Error(`no UF2 available for ${panelId} mode ${mode}`)
    return {
      panelId: panel.panelId,
      mode,
      payloadType: 'uf2',
      dirs: [],
      files: [],
      bootstrapImport: '',
      totalBytes: 0,
      uf2Path: join(payloadsRoot(), uf2Rel),
      stepLabels: {
        connect: 'Enter bootloader mode',
        driver: 'Install the display driver',
        load: MODE_LABELS[mode],
        reboot: 'Reboot',
        ready: 'Pico ready for use'
      }
    }
  }

  const internal = panel.internal
  const files: PlanFile[] = []
  const dirs = [...internal.deviceDirs]

  // -- driver step: runtime/backend modules + glyph fonts --------------------
  for (const m of internal.modules) {
    files.push({ devicePath: m.dest, data: readPayloadFile(m.src), step: 'driver' })
  }
  if (internal.fonts) {
    const fontDir = join(payloadsRoot(), internal.fonts.srcDir)
    for (const f of readdirSync(fontDir).filter((f) => f.endsWith('.bmp'))) {
      files.push({
        devicePath: `${internal.fonts.destDir}/${f}`,
        data: readPayloadFile(`${internal.fonts.srcDir}/${f}`),
        step: 'driver'
      })
    }
  }

  // -- load step: mode payload + runtime config + main bootstrap target ------
  const config: Record<string, unknown> = { ...internal.configTemplate }
  let bootstrapImport: string

  const userPlanes = {
    black: '/images/user/user_black.bin',
    red: '/images/user/user_red.bin',
    yellow: '/images/user/user_yellow.bin',
    quad: '/images/user/user_quad2bpp.bin'
  }

  const pushViewer = (planes: {
    black?: Buffer
    red?: Buffer
    yellow?: Buffer
    quad?: Buffer
  }): void => {
    const wantsQuad = internal.viewerTemplate === 'viewer_4in2_quad'
    if (wantsQuad) {
      if (!planes.quad) throw new Error('this panel requires the packed framebuffer payload')
      files.push({ devicePath: userPlanes.quad, data: planes.quad, step: 'load' })
      files.push({
        devicePath: '/poca_viewer.py',
        data: Buffer.from(renderTemplate(internal.viewerTemplate, { QUAD_BIN: userPlanes.quad })),
        step: 'load'
      })
      return
    }
    const black = planes.black ?? Buffer.alloc(0)
    files.push({ devicePath: userPlanes.black, data: black, step: 'load' })
    if (planes.red) files.push({ devicePath: userPlanes.red, data: planes.red, step: 'load' })
    const hasYellow = Boolean(planes.yellow) && panel.colors.includes('yellow')
    if (planes.yellow && hasYellow) {
      files.push({ devicePath: userPlanes.yellow, data: planes.yellow, step: 'load' })
    }
    const vars: Record<string, string> =
      internal.viewerTemplate === 'viewer_4in2_bwr'
        ? { BLACK_BIN: userPlanes.black, RED_BIN: planes.red ? userPlanes.red : '' }
        : {
            BACKEND_MODULE: backendModuleName(internal),
            OVERRIDES_JSON: pyDict(viewerOverrides(internal)),
            BLACK_BIN: userPlanes.black,
            RED_BIN: planes.red ? userPlanes.red : '',
            YELLOW_BIN: hasYellow ? userPlanes.yellow : ''
          }
    files.push({
      devicePath: '/poca_viewer.py',
      data: Buffer.from(renderTemplate(internal.viewerTemplate, vars)),
      step: 'load'
    })
  }

  switch (mode) {
    case 'poca-os': {
      for (const a of internal.runtimeAssets) {
        files.push({ devicePath: a.dest, data: readPayloadFile(a.src), step: 'load' })
      }
      bootstrapImport = internal.bootstrapImport
      break
    }
    case 'test-display': {
      const cal = internal.calibration
      pushViewer({
        black: readPayloadFile(cal.planes.black),
        red: cal.planes.red ? readPayloadFile(cal.planes.red) : undefined,
        yellow: cal.planes.yellow ? readPayloadFile(cal.planes.yellow) : undefined,
        quad: cal.quad ? readPayloadFile(cal.quad) : undefined
      })
      bootstrapImport = 'poca_viewer'
      break
    }
    case 'badge':
    case 'raster': {
      const p = inputs?.planes
      if (!p) throw new Error(`${mode} mode requires generated image planes`)
      pushViewer({
        black: p.black ? Buffer.from(p.black) : undefined,
        red: p.red ? Buffer.from(p.red) : undefined,
        yellow: p.yellow ? Buffer.from(p.yellow) : undefined,
        quad: p.quad ? Buffer.from(p.quad) : undefined
      })
      bootstrapImport = 'poca_viewer'
      break
    }
    case 'activity': {
      if (!inputs?.scriptSource) throw new Error('activity mode requires a script')
      files.push({
        devicePath: '/user_activity.py',
        data: Buffer.from(inputs.scriptSource, 'utf8'),
        step: 'load'
      })
      files.push({
        devicePath: '/poca_activity_boot.py',
        data: Buffer.from(renderTemplate('activity_bootstrap', { ACTIVITY_MODULE: 'user_activity' })),
        step: 'load'
      })
      bootstrapImport = 'poca_activity_boot'
      break
    }
  }

  // Runtime config is read by both the POCA OS bootstrap and split viewers.
  files.push({
    devicePath: '/state/poca_runtime_config.json',
    data: Buffer.from(JSON.stringify(config)),
    step: 'load'
  })

  return {
    panelId: panel.panelId,
    mode,
    payloadType: 'micropython',
    dirs,
    files,
    bootstrapImport,
    totalBytes: files.reduce((sum, f) => sum + f.data.length, 0),
    stepLabels: {
      connect: 'Connect to Pico',
      driver: 'Install the display driver',
      load: MODE_LABELS[mode],
      reboot: 'Reboot',
      ready: 'Pico ready for use'
    }
  }
}

/** Serialize a flat JS object as a Python dict literal. */
function pyDict(obj: Record<string, unknown>): string {
  const entries = Object.entries(obj).map(([k, v]) => {
    if (typeof v === 'string') return `"${k}": "${v}"`
    if (typeof v === 'boolean') return `"${k}": ${v ? 'True' : 'False'}`
    return `"${k}": ${v}`
  })
  return `{${entries.join(', ')}}`
}
