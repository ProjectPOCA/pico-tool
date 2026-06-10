import type { Transport } from './transport'

/**
 * Scripted MicroPython device used by unit tests and PICO_TOOL_MOCK=1 mode.
 *
 * Implements just enough of the raw-REPL protocol and an in-memory filesystem
 * to satisfy RawReplClient: banner on Ctrl-A, OK/EOT framing, and pattern
 * recognition of the exact snippets the client sends (open/write/close/stat/
 * statvfs/mkdir/machine.reset).
 */

export interface MockOptions {
  /** Fail the first N attempts to enter raw mode (timeout injection). */
  failEnterRawAttempts?: number
  /** Drop the connection after this many successful file-write chunks. */
  disconnectAfterChunks?: number
  /** Reported free filesystem bytes. */
  freeBytes?: number
  /** Artificial response latency in ms. */
  latencyMs?: number
  /** Raise a Python error on any write to this path. */
  failPath?: string
}

export class MockTransport implements Transport {
  isOpen = false
  files = new Map<string, Buffer>()
  dirs = new Set<string>()
  resetCount = 0

  private dataSubs = new Set<(chunk: Uint8Array) => void>()
  private closeSubs = new Set<() => void>()
  private rawMode = false
  private pending = Buffer.alloc(0)
  private enterRawFailures = 0
  private chunkWrites = 0
  private openFile: { path: string; data: Buffer } | null = null

  constructor(private readonly opts: MockOptions = {}) {}

  async open(): Promise<void> {
    this.isOpen = true
  }

  onData(cb: (chunk: Uint8Array) => void): () => void {
    this.dataSubs.add(cb)
    return () => this.dataSubs.delete(cb)
  }

  onClose(cb: () => void): () => void {
    this.closeSubs.add(cb)
    return () => this.closeSubs.delete(cb)
  }

  async close(): Promise<void> {
    if (!this.isOpen) return
    this.isOpen = false
    for (const cb of this.closeSubs) cb()
  }

  /** Simulate the device dropping off the bus. */
  forceDisconnect(): void {
    void this.close()
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.isOpen) throw new Error('write after close')
    if (this.opts.latencyMs) await delay(this.opts.latencyMs)
    this.pending = Buffer.concat([this.pending, Buffer.from(data)])
    this.drain()
  }

  private emit(text: string | Buffer): void {
    const buf = typeof text === 'string' ? Buffer.from(text, 'utf8') : text
    // Deliver asynchronously like a real port.
    queueMicrotask(() => {
      if (!this.isOpen) return
      for (const cb of this.dataSubs) cb(buf)
    })
  }

  private drain(): void {
    for (;;) {
      if (!this.rawMode) {
        // Look for Ctrl-A; discard interrupts/noise before it.
        const idx = this.pending.indexOf(0x01)
        if (idx < 0) {
          this.pending = Buffer.alloc(0)
          return
        }
        this.pending = this.pending.subarray(idx + 1)
        if (this.enterRawFailures < (this.opts.failEnterRawAttempts ?? 0)) {
          this.enterRawFailures++
          // Stay silent: client times out and retries.
          continue
        }
        this.rawMode = true
        this.emit('raw REPL; CTRL-B to exit\r\n>')
        continue
      }
      // Raw mode: a snippet is terminated by Ctrl-D.
      const eot = this.pending.indexOf(0x04)
      if (eot < 0) return
      const code = this.pending.subarray(0, eot).toString('utf8')
      this.pending = this.pending.subarray(eot + 1)
      if (code.includes('\x02')) {
        // Ctrl-B inside stream: exit raw mode (soft reset path).
        this.rawMode = false
        continue
      }
      this.execute(code)
    }
  }

  private respond(stdout: string, stderr = ''): void {
    this.emit('OK' + stdout + '\x04' + stderr + '\x04>')
  }

  private execute(code: string): void {
    // machine.reset() — port dies without a reply.
    if (code.includes('machine.reset()')) {
      this.resetCount++
      this.forceDisconnect()
      return
    }

    // mkdir loop
    if (code.includes('os.mkdir')) {
      for (const m of code.matchAll(/'(\/[^']*)'/g)) this.dirs.add(m[1])
      this.respond('')
      return
    }

    // statvfs free space
    if (code.includes('os.statvfs')) {
      this.respond(`${this.opts.freeBytes ?? 1_400_000}\n`)
      return
    }

    // open for write
    let m = code.match(/_f=open\('([^']+)','wb'\)/)
    if (m) {
      if (this.opts.failPath && m[1] === this.opts.failPath) {
        this.respond('', `Traceback (most recent call last):\r\nOSError: 28\r\n`)
        return
      }
      this.openFile = { path: m[1], data: Buffer.alloc(0) }
      this.respond('')
      return
    }

    // base64 chunk write
    m = code.match(/_f\.write\(ubinascii\.a2b_base64\('([^']*)'\)\)/)
    if (m) {
      this.chunkWrites++
      if (
        this.opts.disconnectAfterChunks !== undefined &&
        this.chunkWrites > this.opts.disconnectAfterChunks
      ) {
        this.forceDisconnect()
        return
      }
      if (this.openFile) {
        this.openFile.data = Buffer.concat([this.openFile.data, Buffer.from(m[1], 'base64')])
      }
      this.respond('')
      return
    }

    // close
    if (code.includes('_f.close()')) {
      if (this.openFile) {
        this.files.set(this.openFile.path, this.openFile.data)
        this.openFile = null
      }
      this.respond('')
      return
    }

    // stat size with -1 fallback
    m = code.match(/os\.stat\('([^']+)'\)\[6\]/)
    if (m) {
      const f = this.files.get(m[1])
      this.respond(`${f ? f.length : -1}\n`)
      return
    }

    // read file as base64
    m = code.match(/open\('([^']+)','rb'\)/)
    if (m) {
      const f = this.files.get(m[1])
      if (!f) {
        this.respond('', `Traceback (most recent call last):\r\nOSError: [Errno 2] ENOENT\r\n`)
      } else {
        this.respond(f.toString('base64') + '\n')
      }
      return
    }

    // Anything else: succeed silently (imports etc.)
    this.respond('')
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
