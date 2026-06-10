import type { FlashRequest } from '@shared/types'
import { useNav, type PendingFlash } from './nav-store'

/**
 * Single entry point for starting a flash. When more than one Pico is
 * connected, stashes the request so the DevicePickerModal (rendered by App)
 * can resolve the port; otherwise starts immediately and moves to progress.
 */

export async function beginFlash(
  request: FlashRequest,
  savedConfigId?: string,
  opts?: { silent?: boolean }
): Promise<void> {
  const devices = await window.picoTool.deviceList()
  const picos = devices.filter((d) => d.kind === 'micropython')
  if (picos.length > 1 && !request.portPath) {
    useNav.getState().setPendingFlash({ request, savedConfigId, silent: opts?.silent })
    return
  }
  await launch({ request, savedConfigId, silent: opts?.silent })
}

export async function launch(pending: PendingFlash, portPath?: string): Promise<void> {
  const resolvedPort = portPath ?? pending.request.portPath
  const { jobId } = pending.savedConfigId
    ? await window.picoTool.flashSaved(pending.savedConfigId, resolvedPort)
    : await window.picoTool.flashStart({ ...pending.request, portPath: resolvedPort })
  const nav = useNav.getState()
  nav.setPendingFlash(null)
  nav.setJob(jobId, pending.savedConfigId ?? null)
  if (!pending.silent) {
    nav.navigate('flash-progress', 'x')
  }
}

export function cancelPendingFlash(): void {
  useNav.getState().setPendingFlash(null)
}
