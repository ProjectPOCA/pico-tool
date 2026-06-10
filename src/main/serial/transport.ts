import { SerialPort } from 'serialport'
import { FlashError } from './errors'

/**
 * Minimal byte-stream abstraction over a serial connection so the raw-REPL
 * client can run against real hardware or the scripted mock.
 */
export interface Transport {
  readonly isOpen: boolean
  open(): Promise<void>
  write(data: Uint8Array): Promise<void>
  /** Subscribe to received bytes; returns unsubscribe. */
  onData(cb: (chunk: Uint8Array) => void): () => void
  /** Subscribe to transport close (device unplug, etc.); returns unsubscribe. */
  onClose(cb: () => void): () => void
  close(): Promise<void>
}

export class SerialPortTransport implements Transport {
  private port: SerialPort | null = null
  private dataSubs = new Set<(chunk: Uint8Array) => void>()
  private closeSubs = new Set<() => void>()

  constructor(
    private readonly path: string,
    private readonly baudRate = 115200
  ) {}

  get isOpen(): boolean {
    return this.port?.isOpen ?? false
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = new SerialPort({ path: this.path, baudRate: this.baudRate, autoOpen: false })
      port.on('data', (chunk: Buffer) => {
        for (const cb of this.dataSubs) cb(chunk)
      })
      port.on('close', () => {
        for (const cb of this.closeSubs) cb()
      })
      port.open((err) => {
        if (err) {
          const msg = String(err.message || err)
          if (/access denied|resource busy|ebusy|eacces|permission/i.test(msg)) {
            reject(FlashError.portBusy(this.path))
          } else {
            reject(new FlashError('no-device', `Could not open ${this.path}: ${msg}`))
          }
          return
        }
        this.port = port
        resolve()
      })
    })
  }

  write(data: Uint8Array): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = this.port
      if (!port || !port.isOpen) {
        reject(FlashError.disconnected())
        return
      }
      port.write(Buffer.from(data), (err) => {
        if (err) {
          reject(FlashError.disconnected())
          return
        }
        port.drain((drainErr) => (drainErr ? reject(FlashError.disconnected()) : resolve()))
      })
    })
  }

  onData(cb: (chunk: Uint8Array) => void): () => void {
    this.dataSubs.add(cb)
    return () => this.dataSubs.delete(cb)
  }

  onClose(cb: () => void): () => void {
    this.closeSubs.add(cb)
    return () => this.closeSubs.delete(cb)
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      const port = this.port
      this.port = null
      if (!port || !port.isOpen) {
        resolve()
        return
      }
      port.close(() => resolve())
    })
  }
}
