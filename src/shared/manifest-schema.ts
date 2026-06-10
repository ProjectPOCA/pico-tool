import { z } from 'zod'

/**
 * Schema for resources/payloads/manifest.json.
 *
 * The `internal` block wires a panel to its on-device driver payload and never
 * crosses the IPC boundary to the renderer.
 */

const fileMapping = z.object({
  /** Path relative to resources/payloads/ */
  src: z.string(),
  /** Absolute path on the Pico filesystem */
  dest: z.string()
})

const dirMapping = z.object({
  srcDir: z.string(),
  destDir: z.string()
})

const configTemplate = z.object({
  panel_profile: z.string(),
  backend: z.string(),
  ui_orientation: z.enum(['landscape', 'portrait']).optional(),
  ui_palette: z.enum(['bw', 'bwr', 'bwy', 'bwry']).optional(),
  overrides: z.record(z.string(), z.unknown()).default({})
})

const micropythonInternal = z.object({
  family: z.enum(['1in52', '2in1', '4in2']),
  configTemplate,
  /** Module name imported by the generated main.py for POCA OS installs. */
  bootstrapImport: z.string(),
  modules: z.array(fileMapping),
  fonts: dirMapping.optional(),
  /** Demo/boot assets required by the POCA OS runtime. */
  runtimeAssets: z.array(fileMapping).default([]),
  /** Calibration planes used by Test Display. */
  calibration: z.object({
    planes: z.object({
      black: z.string(),
      red: z.string().optional(),
      yellow: z.string().optional()
    }),
    quad: z.string().optional()
  }),
  /** Template id used by viewer-based modes (test/badge/raster). */
  viewerTemplate: z.string(),
  deviceDirs: z.array(z.string())
})

const uf2Internal = z.object({
  family: z.literal('7in4'),
  /** Per-mode UF2 binaries; absent file => mode unavailable. */
  uf2: z.record(z.string(), z.string())
})

export const panelSchema = z.object({
  panelId: z.string(),
  aliases: z.array(z.string()).default([]),
  displayName: z.string(),
  sizeClass: z.enum(['1.5', '2.06', '4.2', '7.4']),
  resolution: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  colors: z.array(z.enum(['black', 'white', 'red', 'yellow'])),
  refreshSeconds: z.number().positive(),
  variantGroup: z.string().optional(),
  variantLabel: z.enum(['a', 'b']).optional(),
  payloadType: z.enum(['micropython', 'uf2']),
  available: z.boolean(),
  internal: z.union([micropythonInternal, uf2Internal])
})

export const manifestSchema = z.object({
  version: z.literal(1),
  firmware: z.object({
    /** Bundled MicroPython UF2, relative to resources/. */
    uf2: z.string(),
    description: z.string()
  }),
  panels: z.array(panelSchema)
})

export type PanelManifestEntry = z.infer<typeof panelSchema>
export type MicropythonInternal = z.infer<typeof micropythonInternal>
export type Uf2Internal = z.infer<typeof uf2Internal>
export type Manifest = z.infer<typeof manifestSchema>
