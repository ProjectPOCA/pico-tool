import { Menu, app } from 'electron'

/**
 * Replace Electron's default menu so the app stops behaving like a browser:
 * no zoom accelerators (Cmd +/-/0), no View menu. macOS keeps a minimal menu
 * for Quit/Edit/Window roles; other platforms drop the menu bar entirely
 * (the window is frameless there anyway).
 */
export function installAppMenu(): void {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null)
    return
  }
  const template: Electron.MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    { role: 'windowMenu' }
  ]
  if (!app.isPackaged) {
    template.push({
      label: 'Developer',
      submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }]
    })
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
