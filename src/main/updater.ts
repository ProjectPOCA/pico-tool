import { app, BrowserWindow } from 'electron'
import type { UpdateStatus } from '@shared/types'
import { CHANNELS } from '@shared/ipc-contract'

/**
 * Update checking via electron-updater + GitHub Releases.
 *
 * Windows/Linux: download + install automatically on quit.
 * macOS (while builds are unsigned): electron-updater refuses to install, so
 * we only surface "new version available" with a link to the releases page.
 */

const RELEASES_URL = 'https://github.com/ProjectPOCA/pico-tool/releases'

let status: UpdateStatus = { state: 'idle' }

function setStatus(next: UpdateStatus): void {
  status = next
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(CHANNELS.updatesEvent, status)
  }
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!app.isPackaged) {
    return status
  }
  try {
    const { autoUpdater } = await import('electron-updater')
    autoUpdater.autoDownload = process.platform !== 'darwin'
    autoUpdater.on('update-available', (info) => {
      setStatus({
        state: 'available',
        version: info.version,
        manualUrl: process.platform === 'darwin' ? RELEASES_URL : undefined
      })
    })
    autoUpdater.on('update-downloaded', (info) => {
      setStatus({ state: 'downloaded', version: info.version })
    })
    autoUpdater.on('error', () => setStatus({ state: 'error' }))
    setStatus({ state: 'checking' })
    await autoUpdater.checkForUpdates()
  } catch {
    setStatus({ state: 'error' })
  }
  return status
}
