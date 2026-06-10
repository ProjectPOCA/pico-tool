import { useEffect, useState } from 'react'
import type { DeviceInfo, FlashJobEvent, PanelEntry, SavedConfig, UpdateStatus } from '@shared/types'

/** Renderer-side subscriptions over the preload bridge. */

export function useCatalog(): PanelEntry[] {
  const [catalog, setCatalog] = useState<PanelEntry[]>([])
  useEffect(() => {
    void window.picoTool.panelsCatalog().then(setCatalog)
  }, [])
  return catalog
}

export function useDevices(): DeviceInfo[] {
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  useEffect(() => {
    void window.picoTool.deviceList().then(setDevices)
    return window.picoTool.onDeviceEvent(() => {
      void window.picoTool.deviceList().then(setDevices)
    })
  }, [])
  return devices
}

export function useFlashJob(jobId: string | null): FlashJobEvent | null {
  const [event, setEvent] = useState<FlashJobEvent | null>(null)
  useEffect(() => {
    setEvent(null)
    if (!jobId) return
    // Catch up on anything that fired before this page mounted, then stream.
    void window.picoTool.flashStatus(jobId).then((snapshot) => {
      if (snapshot) setEvent((current) => current ?? snapshot)
    })
    return window.picoTool.onFlashProgress((ev) => {
      if (ev.jobId === jobId) setEvent(ev)
    })
  }, [jobId])
  return event
}

export function useSavedConfigs(): {
  configs: SavedConfig[]
  refresh(): void
  remove(id: string): Promise<void>
} {
  const [configs, setConfigs] = useState<SavedConfig[]>([])
  const refresh = (): void => {
    void window.picoTool.configsList().then(setConfigs)
  }
  useEffect(refresh, [])
  return {
    configs,
    refresh,
    remove: async (id) => {
      await window.picoTool.configsDelete(id)
      refresh()
    }
  }
}

export function useUpdateStatus(): UpdateStatus {
  const [status, setStatus] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => window.picoTool.onUpdatesEvent(setStatus), [])
  return status
}
