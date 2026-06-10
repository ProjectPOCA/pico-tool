import type {
  AppInfo,
  DeviceEvent,
  DeviceInfo,
  FlashJobEvent,
  FlashRequest,
  PanelEntry,
  SavedConfig,
  UpdateStatus
} from './types'

/**
 * The single typed boundary between renderer and main. The preload script
 * exposes this as `window.picoTool`; channel names live here only.
 */

export const CHANNELS = {
  panelsCatalog: 'panels:catalog',
  deviceList: 'device:list',
  deviceEvent: 'device:event',
  flashStart: 'flash:start',
  flashCancel: 'flash:cancel',
  flashProgress: 'flash:progress',
  flashStatus: 'flash:status',
  flashSaved: 'flash:saved',
  configsList: 'configs:list',
  configsSave: 'configs:save',
  configsDelete: 'configs:delete',
  dialogPickFile: 'dialog:pickFile',
  appInfo: 'app:info',
  windowControl: 'window:control',
  updatesCheck: 'updates:check',
  updatesEvent: 'updates:event',
  openExternal: 'shell:openExternal'
} as const

export interface PickedFile {
  path: string
  name: string
  /** Raw bytes for images so the renderer can decode without fs access. */
  bytes?: Uint8Array
  /** UTF-8 source for python files. */
  text?: string
}

export interface SaveConfigRequest {
  name: string
  panelId: string
  mode: FlashRequest['mode']
  summary: string
  scriptName?: string
  scriptSource?: string
  planes?: { black?: Uint8Array; red?: Uint8Array; yellow?: Uint8Array; quad?: Uint8Array }
}

/** API surface exposed on window.picoTool. */
export interface PicoToolApi {
  panelsCatalog(): Promise<PanelEntry[]>
  deviceList(): Promise<DeviceInfo[]>
  onDeviceEvent(cb: (ev: DeviceEvent) => void): () => void

  flashStart(req: FlashRequest): Promise<{ jobId: string }>
  /** Re-flash a saved config (planes/scripts are reloaded in main). */
  flashSaved(configId: string, portPath?: string): Promise<{ jobId: string }>
  flashCancel(jobId: string): Promise<void>
  /** Latest snapshot for a job — covers events fired before a page mounted. */
  flashStatus(jobId: string): Promise<FlashJobEvent | null>
  onFlashProgress(cb: (ev: FlashJobEvent) => void): () => void

  configsList(): Promise<SavedConfig[]>
  configsSave(req: SaveConfigRequest): Promise<SavedConfig>
  configsDelete(id: string): Promise<void>

  pickFile(kind: 'python' | 'image'): Promise<PickedFile | null>
  appInfo(): Promise<AppInfo>
  /** Frameless-window controls for platforms without native buttons. */
  windowControl(action: 'minimize' | 'close'): Promise<void>
  updatesCheck(): Promise<UpdateStatus>
  onUpdatesEvent(cb: (st: UpdateStatus) => void): () => void
  openExternal(url: string): Promise<void>
}

declare global {
  interface Window {
    picoTool: PicoToolApi
  }
}
