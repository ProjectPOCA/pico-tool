import { createReadStream, createWriteStream, statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { FlashError } from '../serial/errors'
import type { PortWatcher } from '../serial/port-watcher'

/**
 * BOOTSEL-mode flashing: copy a .uf2 onto the mounted RPI-RP2 volume.
 * Used to bootstrap MicroPython onto fresh Picos and for uf2-type panels.
 */

export async function waitForBootsel(
  watcher: PortWatcher,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (signal?.aborted) throw FlashError.cancelled()
    const vol = watcher.bootselVolume()
    if (vol?.volumePath) return vol.volumePath
    if (Date.now() > deadline) {
      throw FlashError.timeout('waiting for the Pico in bootloader mode (hold BOOTSEL while plugging in)')
    }
    await delay(400)
  }
}

export async function flashUf2(
  volumePath: string,
  uf2Path: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const total = statSync(uf2Path).size
  const dest = join(volumePath, basename(uf2Path))
  await new Promise<void>((resolve, reject) => {
    const read = createReadStream(uf2Path, { highWaterMark: 64 * 1024 })
    const write = createWriteStream(dest)
    let written = 0
    read.on('data', (chunk) => {
      if (signal?.aborted) {
        read.destroy()
        write.destroy()
        reject(FlashError.cancelled())
        return
      }
      written += chunk.length
      onProgress?.(Math.round((written / total) * 100))
    })
    read.on('error', (e) => reject(new FlashError('internal', `Could not read firmware: ${e.message}`)))
    // The volume vanishes when the RP2040 reboots; treat late write errors as success.
    write.on('error', () => resolve())
    write.on('finish', () => resolve())
    read.pipe(write)
  })
}

/** Wait until the BOOTSEL volume disappears (device rebooted into new firmware). */
export async function waitForBootselGone(
  watcher: PortWatcher,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!watcher.bootselVolume()) return true
    await delay(400)
  }
  return false
}

/** Wait for a MicroPython serial device to (re)appear. */
export async function waitForSerial(
  watcher: PortWatcher,
  timeoutMs: number
): Promise<string | null> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const dev = watcher.pickPort()
    if (dev?.portPath) return dev.portPath
    await delay(400)
  }
  return null
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
