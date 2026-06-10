import { contextBridge, ipcRenderer } from 'electron'
import { CHANNELS, type PicoToolApi } from '@shared/ipc-contract'

function subscribe<T>(channel: string) {
  return (cb: (payload: T) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: T) => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

const api: PicoToolApi = {
  panelsCatalog: () => ipcRenderer.invoke(CHANNELS.panelsCatalog),
  deviceList: () => ipcRenderer.invoke(CHANNELS.deviceList),
  onDeviceEvent: subscribe(CHANNELS.deviceEvent),

  flashStart: (req) => ipcRenderer.invoke(CHANNELS.flashStart, req),
  flashSaved: (configId, portPath) => ipcRenderer.invoke(CHANNELS.flashSaved, configId, portPath),
  flashCancel: (jobId) => ipcRenderer.invoke(CHANNELS.flashCancel, jobId),
  flashStatus: (jobId) => ipcRenderer.invoke(CHANNELS.flashStatus, jobId),
  onFlashProgress: subscribe(CHANNELS.flashProgress),

  configsList: () => ipcRenderer.invoke(CHANNELS.configsList),
  configsSave: (req) => ipcRenderer.invoke(CHANNELS.configsSave, req),
  configsDelete: (id) => ipcRenderer.invoke(CHANNELS.configsDelete, id),

  pickFile: (kind) => ipcRenderer.invoke(CHANNELS.dialogPickFile, kind),
  appInfo: () => ipcRenderer.invoke(CHANNELS.appInfo),
  windowControl: (action) => ipcRenderer.invoke(CHANNELS.windowControl, action),
  updatesCheck: () => ipcRenderer.invoke(CHANNELS.updatesCheck),
  onUpdatesEvent: subscribe(CHANNELS.updatesEvent),
  openExternal: (url) => ipcRenderer.invoke(CHANNELS.openExternal, url)
}

contextBridge.exposeInMainWorld('picoTool', api)
