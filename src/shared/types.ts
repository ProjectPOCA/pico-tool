/** Types shared across main, preload, and renderer. */

export type InkColorName = 'black' | 'white' | 'red' | 'yellow'

/**
 * Consumer-safe panel description. This is everything the renderer is allowed
 * to know about a panel: identity, geometry, colors, refresh. Driver/backend
 * naming stays in the main process.
 */
export interface PanelEntry {
  panelId: string
  /** Additional harvested label IDs that identify the same driver path. */
  aliases: string[]
  /** e.g. "Pervasive 4.2" */
  displayName: string
  /** e.g. "4.2" — used to group diagrams on the selection screen. */
  sizeClass: '1.5' | '2.06' | '4.2' | '7.4'
  /** [width, height] in panel pixels, landscape UI orientation. */
  resolution: [number, number]
  colors: InkColorName[]
  refreshSeconds: number
  /**
   * Panels sharing a variantGroup have identical size + colors and render as
   * anonymous "a"/"b" options after the color ability is chosen.
   */
  variantGroup?: string
  variantLabel?: 'a' | 'b'
  payloadType: 'micropython' | 'uf2'
  /** False = listed but not yet flashable (shown as coming soon). */
  available: boolean
}

export type FlashMode = 'poca-os' | 'badge' | 'activity' | 'raster' | 'test-display'

export interface DeviceInfo {
  kind: 'micropython' | 'bootsel'
  /** Serial port path (micropython kind). */
  portPath?: string
  /** Mounted volume path (bootsel kind). */
  volumePath?: string
  serialNumber?: string
  label: string
}

export type DeviceEvent =
  | { type: 'added'; device: DeviceInfo }
  | { type: 'removed'; device: DeviceInfo }

export type FlashStepId = 'connect' | 'driver' | 'load' | 'reboot' | 'ready'
export type FlashStepState = 'pending' | 'active' | 'done' | 'error'

export interface FlashStep {
  id: FlashStepId
  label: string
  state: FlashStepState
}

export interface FlashJobEvent {
  jobId: string
  steps: FlashStep[]
  /** 0-100 within the active step, where measurable. */
  activeStepPercent: number
  /** Present when the job failed. */
  error?: { message: string; retriable: boolean }
  done: boolean
}

/** Inputs that vary per flash mode. Binary planes travel as Uint8Array. */
export interface FlashModeInputs {
  /** activity: user script source */
  scriptName?: string
  scriptSource?: string
  /** badge/raster: pre-packed framebuffer planes from the imaging pipeline */
  planes?: { black?: Uint8Array; red?: Uint8Array; yellow?: Uint8Array; quad?: Uint8Array }
}

export interface FlashRequest {
  panelId: string
  mode: FlashMode
  inputs?: FlashModeInputs
  /** Explicit port when more than one device is connected. */
  portPath?: string
}

export interface SavedConfig {
  id: string
  name: string
  panelId: string
  mode: FlashMode
  /** Human summary, e.g. "Badge — 'HELLO'" */
  summary: string
  createdAt: string
  lastFlashedAt: string
  /** Present when generated planes were persisted for re-flash. */
  payloadDir?: string
  scriptName?: string
  scriptSource?: string
}

export interface UpdateStatus {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'error'
  version?: string
  /** macOS unsigned builds cannot auto-install; link out instead. */
  manualUrl?: string
}

export interface AppInfo {
  version: string
  /** process.platform value, e.g. 'darwin' | 'win32' | 'linux' */
  platform: string
  mock: boolean
}
