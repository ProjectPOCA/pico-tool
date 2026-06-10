import { EventEmitter } from 'node:events'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SerialPort } from 'serialport'
import * as drivelist from 'drivelist'
import type { DeviceEvent, DeviceInfo } from '@shared/types'

/**
 * Watches for Pico devices in both states:
 *  - MicroPython CDC serial (VID 2E8A / PID 0005)
 *  - RP2040 BOOTSEL mass-storage volume (INFO_UF2.TXT present)
 *
 * Polling keeps this dependency-light and identical across platforms.
 */

const RPI_VID = '2e8a'
const MICROPYTHON_PIDS = new Set(['0005'])
const SERIAL_POLL_MS = 1000
const VOLUME_POLL_MS = 1500

export declare interface PortWatcher {
  on(event: 'device', cb: (ev: DeviceEvent) => void): this
}

export class PortWatcher extends EventEmitter {
  private known = new Map<string, DeviceInfo>()
  private serialTimer: NodeJS.Timeout | null = null
  private volumeTimer: NodeJS.Timeout | null = null
  private stopped = true

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    const pollSerial = async () => {
      if (this.stopped) return
      try {
        await this.scanSerial()
      } catch {
        // enumeration hiccups are non-fatal
      }
      this.serialTimer = setTimeout(pollSerial, SERIAL_POLL_MS)
    }
    const pollVolumes = async () => {
      if (this.stopped) return
      try {
        await this.scanVolumes()
      } catch {
        // drivelist can fail transiently during mount/unmount
      }
      this.volumeTimer = setTimeout(pollVolumes, VOLUME_POLL_MS)
    }
    void pollSerial()
    void pollVolumes()
  }

  stop(): void {
    this.stopped = true
    if (this.serialTimer) clearTimeout(this.serialTimer)
    if (this.volumeTimer) clearTimeout(this.volumeTimer)
  }

  list(): DeviceInfo[] {
    return [...this.known.values()]
  }

  /** Resolve the port to use; prefers the explicit path when given. */
  pickPort(explicit?: string): DeviceInfo | null {
    const ports = this.list().filter((d) => d.kind === 'micropython')
    if (explicit) return ports.find((d) => d.portPath === explicit) ?? null
    return ports[0] ?? null
  }

  bootselVolume(): DeviceInfo | null {
    return this.list().find((d) => d.kind === 'bootsel') ?? null
  }

  private async scanSerial(): Promise<void> {
    const ports = await SerialPort.list()
    const seen = new Set<string>()
    for (const p of ports) {
      const vid = (p.vendorId ?? '').toLowerCase()
      const pid = (p.productId ?? '').toLowerCase()
      if (vid !== RPI_VID || !MICROPYTHON_PIDS.has(pid)) continue
      // macOS enumeration reports the /dev/tty.* device; open the /dev/cu.*
      // callout twin instead (tty.* blocks waiting for DCD).
      let portPath = p.path
      if (process.platform === 'darwin' && portPath.startsWith('/dev/tty.')) {
        const callout = '/dev/cu.' + portPath.slice('/dev/tty.'.length)
        if (existsSync(callout)) portPath = callout
      }
      const key = `mp:${p.serialNumber ?? portPath}`
      seen.add(key)
      if (!this.known.has(key)) {
        const device: DeviceInfo = {
          kind: 'micropython',
          portPath,
          serialNumber: p.serialNumber ?? undefined,
          label: 'Raspberry Pi Pico'
        }
        this.known.set(key, device)
        this.emit('device', { type: 'added', device } satisfies DeviceEvent)
      } else {
        // COM numbers can shuffle on Windows; keep portPath fresh.
        const existing = this.known.get(key)!
        existing.portPath = portPath
      }
    }
    this.expire('mp:', seen)
  }

  private async scanVolumes(): Promise<void> {
    const drives = await drivelist.list()
    const seen = new Set<string>()
    for (const d of drives) {
      if (!d.isRemovable && !d.isUSB) continue
      for (const mp of d.mountpoints ?? []) {
        const infoPath = join(mp.path, 'INFO_UF2.TXT')
        try {
          if (!existsSync(infoPath)) continue
          const info = readFileSync(infoPath, 'utf8')
          if (!/RP2040|RPI-RP2|Raspberry/i.test(info)) continue
        } catch {
          continue
        }
        const key = `boot:${mp.path}`
        seen.add(key)
        if (!this.known.has(key)) {
          const device: DeviceInfo = {
            kind: 'bootsel',
            volumePath: mp.path,
            label: 'Pico (bootloader mode)'
          }
          this.known.set(key, device)
          this.emit('device', { type: 'added', device } satisfies DeviceEvent)
        }
      }
    }
    this.expire('boot:', seen)
  }

  private expire(prefix: string, seen: Set<string>): void {
    for (const [key, device] of this.known) {
      if (key.startsWith(prefix) && !seen.has(key)) {
        this.known.delete(key)
        this.emit('device', { type: 'removed', device } satisfies DeviceEvent)
      }
    }
  }
}
