import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { CHANNELS, type PickedFile, type SaveConfigRequest } from '@shared/ipc-contract'
import type { AppInfo, FlashRequest } from '@shared/types'
import { panelCatalog } from './payloads/manifest'
import { PortWatcher } from './serial/port-watcher'
import { SerialPortTransport, type Transport } from './serial/transport'
import { MockTransport } from './serial/mock-transport'
import { FlashOrchestrator } from './flash/orchestrator'
import { buildPlan } from './flash/plan-builder'
import {
  deleteConfig,
  listConfigs,
  loadConfigPlanes,
  saveConfig,
  touchConfig
} from './store/saved-configs'
import { checkForUpdates } from './updater'

export const IS_MOCK = process.env.PICO_TOOL_MOCK === '1'

/** External link allowlist — the renderer cannot open arbitrary URLs. */
const ALLOWED_URLS = [
  'https://github.com/ProjectPOCA/pico-tool',
  'https://github.com/ProjectPOCA/pico-tool/releases',
  'https://github.com/ProjectPOCA/pico-tool/blob/main/TERMS.md',
  'https://github.com/ProjectPOCA/pico-tool/blob/main/PRIVACY.md'
]

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

export function registerIpc(): { watcher: PortWatcher } {
  const watcher = new PortWatcher()

  const transportFactory = (portPath: string): Transport =>
    IS_MOCK ? new MockTransport({ latencyMs: 2 }) : new SerialPortTransport(portPath)

  const orchestrator = new FlashOrchestrator(watcher, transportFactory, (ev) =>
    broadcast(CHANNELS.flashProgress, ev)
  )

  if (IS_MOCK) {
    installMockDevices(watcher)
  } else {
    watcher.start()
  }
  watcher.on('device', (ev) => broadcast(CHANNELS.deviceEvent, ev))

  ipcMain.handle(CHANNELS.panelsCatalog, () => panelCatalog())
  ipcMain.handle(CHANNELS.deviceList, () => watcher.list())

  ipcMain.handle(CHANNELS.flashStart, (_e, req: FlashRequest) => {
    const plan = buildPlan(req.panelId, req.mode, req.inputs)
    return { jobId: orchestrator.start(plan, req.portPath) }
  })

  ipcMain.handle(CHANNELS.flashSaved, (_e, configId: string, portPath?: string) => {
    const config = listConfigs().find((c) => c.id === configId)
    if (!config) throw new Error('saved configuration not found')
    const plan = buildPlan(config.panelId, config.mode, {
      planes: loadConfigPlanes(config),
      scriptName: config.scriptName,
      scriptSource: config.scriptSource
    })
    touchConfig(configId)
    return { jobId: orchestrator.start(plan, portPath) }
  })

  ipcMain.handle(CHANNELS.flashCancel, (_e, jobId: string) => orchestrator.cancel(jobId))
  ipcMain.handle(CHANNELS.flashStatus, (_e, jobId: string) => orchestrator.status(jobId))

  ipcMain.handle(CHANNELS.configsList, () => listConfigs())
  ipcMain.handle(CHANNELS.configsSave, (_e, req: SaveConfigRequest) => saveConfig(req))
  ipcMain.handle(CHANNELS.configsDelete, (_e, id: string) => deleteConfig(id))

  ipcMain.handle(CHANNELS.dialogPickFile, async (_e, kind: 'python' | 'image') => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters:
        kind === 'python'
          ? [{ name: 'MicroPython script', extensions: ['py'] }]
          : [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]
    const picked: PickedFile = { path, name: basename(path) }
    if (kind === 'image') picked.bytes = readFileSync(path)
    else picked.text = readFileSync(path, 'utf8')
    return picked
  })

  ipcMain.handle(CHANNELS.appInfo, (): AppInfo => {
    return { version: app.getVersion(), platform: process.platform, mock: IS_MOCK }
  })

  ipcMain.handle(CHANNELS.updatesCheck, () => checkForUpdates())

  ipcMain.handle(CHANNELS.windowControl, (e, action: 'minimize' | 'close') => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (action === 'minimize') win.minimize()
    else win.close()
  })

  ipcMain.handle(CHANNELS.openExternal, (_e, url: string) => {
    if (!ALLOWED_URLS.some((allowed) => url.startsWith(allowed))) {
      throw new Error('blocked external url')
    }
    return shell.openExternal(url)
  })

  return { watcher }
}

/** PICO_TOOL_MOCK=1: a fake Pico appears shortly after launch. */
function installMockDevices(watcher: PortWatcher): void {
  setTimeout(() => {
    const device = {
      kind: 'micropython' as const,
      portPath: '/dev/mock-pico',
      serialNumber: 'MOCK0001',
      label: 'Raspberry Pi Pico'
    }
    // Reach into the watcher's map so list()/pickPort() agree with the event.
    ;(watcher as unknown as { known: Map<string, unknown> }).known.set('mp:MOCK0001', device)
    watcher.emit('device', { type: 'added', device })
  }, 1200)
}
