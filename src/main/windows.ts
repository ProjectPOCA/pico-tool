import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

/**
 * Two windows: a frameless transparent splash card shown immediately, and the
 * main wizard window revealed once it is ready (splash stays >= 1.6s so the
 * loading moment reads as intentional).
 */

const SPLASH_MIN_MS = 1600

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined

function rendererUrl(file: 'index.html' | 'splash.html'): { url?: string; file?: string } {
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl) return { url: `${devUrl}/${file}` }
  return { file: join(__dirname, `../renderer/${file}`) }
}

export function createSplashWindow(): BrowserWindow {
  // Sized so the card's 60px-blur drop shadow isn't clipped at the edges.
  const splash = new BrowserWindow({
    width: 851,
    height: 559,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })
  const target = rendererUrl('splash.html')
  if (target.url) void splash.loadURL(target.url)
  else if (target.file) void splash.loadFile(target.file)
  splash.once('ready-to-show', () => splash.show())
  return splash
}

/**
 * Frameless chrome per platform. macOS uses a TRANSPARENT window with CSS
 * rounded corners: opaque hidden-titlebar windows carry a native 1px border
 * that renders near-black in dark mode against the white app. Transparent
 * windows have no native border, but macOS caches their shadow shape — the
 * cause of the "doubled shadow / hairline" artifact — so the shadow is
 * explicitly invalidated after loads and periodically (see createMainWindow).
 * Windows 11 auto-rounds opaque frameless windows; Linux stays square.
 */
function framelessOptions(): Electron.BrowserWindowConstructorOptions {
  if (process.platform === 'darwin') {
    return {
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 24, y: 32 },
      transparent: true,
      fullscreenable: false
    }
  }
  return { frame: false, backgroundColor: '#FFFFFF' }
}

export function createMainWindow(onReady: () => void): BrowserWindow {
  const win = new BrowserWindow({
    title: 'pico tool',
    width: 1080,
    height: 720,
    minWidth: 960,
    minHeight: 640,
    show: false,
    ...framelessOptions(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false
    }
  })
  // The design owns the title; never let document.title override it.
  win.on('page-title-updated', (e) => e.preventDefault())

  // No browser-style content zoom: pinch zoom off here, keyboard zoom is
  // gone with the default menu (see menu.ts).
  win.webContents.on('did-finish-load', () => {
    void win.webContents.setVisualZoomLevelLimits(1, 1)
  })

  if (process.platform === 'darwin') {
    // Keep the transparent window's cached shadow in sync with its shape,
    // otherwise macOS layers stale copies into a dark rim over time.
    const refreshShadow = (): void => {
      if (!win.isDestroyed() && win.isVisible()) win.invalidateShadow()
    }
    win.webContents.on('did-finish-load', refreshShadow)
    win.on('resize', refreshShadow)
    const shadowTimer = setInterval(refreshShadow, 2000)
    win.on('closed', () => clearInterval(shadowTimer))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const target = rendererUrl('index.html')
  if (target.url) void win.loadURL(target.url)
  else if (target.file) void win.loadFile(target.file)

  const shownAt = Date.now()
  win.once('ready-to-show', () => {
    const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - shownAt))
    setTimeout(() => {
      win.show()
      onReady()
    }, wait)
  })
  return win
}
