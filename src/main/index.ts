import { app, BrowserWindow, nativeTheme } from 'electron'
import { loadManifest } from './payloads/manifest'
import { registerIpc } from './ipc'
import { installAppMenu } from './menu'
import { createMainWindow, createSplashWindow } from './windows'
import { checkForUpdates } from './updater'

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let watcherStop: (() => void) | null = null

// The design is white-on-white in any OS appearance. Pinning light keeps
// macOS from drawing dark-mode window chrome (near-black shadow outline and
// heavier shadow) around the white app when the system switches to dark.
nativeTheme.themeSource = 'light'

app.whenReady().then(() => {
  // Validate the bundled payloads before any window opens; a broken bundle
  // should fail loudly rather than mid-flash.
  loadManifest()

  installAppMenu()
  const { watcher } = registerIpc()
  watcherStop = () => watcher.stop()

  const splash = createSplashWindow()
  createMainWindow(() => {
    if (!splash.isDestroyed()) splash.close()
    void checkForUpdates()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(() => undefined)
    }
  })
})

app.on('window-all-closed', () => {
  watcherStop?.()
  app.quit()
})
