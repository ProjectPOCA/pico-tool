import { FlashError } from './errors'
import type { Transport } from './transport'

/**
 * MicroPython raw-REPL protocol client.
 *
 * Replaces the mpremote dependency: interrupts the running program, enters raw
 * mode (Ctrl-A), executes short Python snippets framed by OK/EOT markers, and
 * streams files via chunked base64 writes.
 *
 * Protocol reference: micropython/tools/pyboard.py and docs/reference/repl.
 */

const CTRL_A = 0x01 // enter raw REPL
const CTRL_B = 0x02 // exit raw REPL
const CTRL_C = 0x03 // interrupt
const CTRL_D = 0x04 // execute / soft reboot
const EOT = Buffer.from([CTRL_D])
const RAW_BANNER = Buffer.from('raw REPL; CTRL-B to exit\r\n')

const DEFAULTS = {
  enterRawTimeoutMs: 2000,
  enterRawAttempts: 3,
  execTimeoutMs: 10000,
  /** Raw payload bytes per write chunk (encodes to ~1KB of base64). */
  chunkBytes: 768
}

export interface ExecResult {
  stdout: string
  stderr: string
}

export class RawReplClient {
  private rx: Buffer = Buffer.alloc(0)
  private waiter: { resolve: () => void } | null = null
  private closed = false
  private unsubData: (() => void) | null = null
  private unsubClose: (() => void) | null = null

  constructor(
    private readonly transport: Transport,
    private readonly opts = DEFAULTS
  ) {}

  /** Open the transport, interrupt any running program, and enter raw mode. */
  async connect(): Promise<void> {
    await this.transport.open()
    this.unsubData = this.transport.onData((chunk) => {
      this.rx = Buffer.concat([this.rx, Buffer.from(chunk)])
      this.waiter?.resolve()
    })
    this.unsubClose = this.transport.onClose(() => {
      this.closed = true
      this.waiter?.resolve()
    })

    let lastErr: unknown = null
    for (let attempt = 0; attempt < this.opts.enterRawAttempts; attempt++) {
      try {
        // Kill any running program. Two Ctrl-C with a pause handles tight loops.
        await this.transport.write(Buffer.from('\r', 'ascii'))
        await this.transport.write(Buffer.from([CTRL_C]))
        await delay(150)
        await this.transport.write(Buffer.from([CTRL_C]))
        await delay(250)
        this.rx = Buffer.alloc(0)
        await this.transport.write(Buffer.from([0x0d, CTRL_A]))
        await this.waitFor(RAW_BANNER, this.opts.enterRawTimeoutMs)
        // Consume the prompt '>' that follows the banner.
        await this.waitFor(Buffer.from('>'), this.opts.enterRawTimeoutMs)
        return
      } catch (e) {
        lastErr = e
        if (this.closed) throw FlashError.disconnected()
      }
    }
    throw lastErr instanceof FlashError ? lastErr : FlashError.timeout('connecting to the Pico')
  }

  /**
   * Execute a Python snippet in raw mode and collect its output.
   * Throws FlashError('exec-error') when the device reports a traceback.
   */
  async exec(code: string, timeoutMs = this.opts.execTimeoutMs): Promise<ExecResult> {
    if (this.closed) throw FlashError.disconnected()
    await this.transport.write(Buffer.from(code, 'utf8'))
    await this.transport.write(EOT)
    // Device echoes "OK" once it has compiled and started the snippet.
    await this.waitFor(Buffer.from('OK'), timeoutMs)
    const stdout = (await this.waitFor(EOT, timeoutMs)).toString('utf8')
    const stderr = (await this.waitFor(EOT, timeoutMs)).toString('utf8')
    await this.waitFor(Buffer.from('>'), timeoutMs)
    if (stderr.length > 0) {
      throw FlashError.exec(stderr)
    }
    return { stdout, stderr }
  }

  /** Create all directories (deepest-last), ignoring already-exists errors. */
  async mkdirs(paths: string[]): Promise<void> {
    if (paths.length === 0) return
    const list = paths.map((p) => `'/${p.replace(/^\//, '')}'`).join(',')
    await this.exec(
      `import os\nfor _p in (${list},):\n try:\n  os.mkdir(_p)\n except OSError:\n  pass\n`
    )
  }

  /** Free bytes on the device filesystem. */
  async statvfsFree(): Promise<number> {
    const { stdout } = await this.exec(`import os\n_s=os.statvfs('/')\nprint(_s[0]*_s[3])\n`)
    const n = parseInt(stdout.trim(), 10)
    if (!Number.isFinite(n)) throw new FlashError('internal', 'Could not read free space.')
    return n
  }

  /** Size of a device file, or null when missing. */
  async statSize(devicePath: string): Promise<number | null> {
    const { stdout } = await this.exec(
      `import os\ntry:\n print(os.stat('${devicePath}')[6])\nexcept OSError:\n print(-1)\n`
    )
    const n = parseInt(stdout.trim(), 10)
    return n >= 0 ? n : null
  }

  /** Stream a file to the device via chunked base64 writes, then verify size. */
  async writeFile(
    devicePath: string,
    data: Uint8Array,
    onProgress?: (written: number, total: number) => void,
    signal?: AbortSignal
  ): Promise<void> {
    await this.exec(`import ubinascii\n_f=open('${devicePath}','wb')\n`)
    try {
      for (let off = 0; off < data.length; off += this.opts.chunkBytes) {
        if (signal?.aborted) throw FlashError.cancelled()
        const chunk = Buffer.from(data.subarray(off, off + this.opts.chunkBytes))
        const b64 = chunk.toString('base64')
        await this.exec(`_f.write(ubinascii.a2b_base64('${b64}'))\n`)
        onProgress?.(Math.min(off + this.opts.chunkBytes, data.length), data.length)
      }
    } finally {
      try {
        await this.exec(`_f.close()\n`)
      } catch {
        // Best effort on abort/disconnect; verification below catches truncation.
      }
    }
    const size = await this.statSize(devicePath)
    if (size !== data.length) {
      throw new FlashError(
        'exec-error',
        `Verification failed for ${devicePath}: wrote ${data.length} bytes, device reports ${size ?? 'missing'}.`
      )
    }
  }

  /** Read a small device file (used for main.py backups). Returns null if missing. */
  async readFile(devicePath: string): Promise<Buffer | null> {
    try {
      const { stdout } = await this.exec(
        `import ubinascii\nwith open('${devicePath}','rb') as _f:\n print(ubinascii.b2a_base64(_f.read()).decode())\n`
      )
      return Buffer.from(stdout.trim(), 'base64')
    } catch (e) {
      if (e instanceof FlashError && e.code === 'exec-error') return null
      throw e
    }
  }

  /**
   * Hard-reset via machine.reset(). The port dies mid-exec; closure here is
   * success, a clean exec completion is also fine.
   */
  async hardReset(): Promise<void> {
    try {
      await this.transport.write(Buffer.from('import machine\nmachine.reset()\n', 'utf8'))
      await this.transport.write(EOT)
      await delay(300)
    } catch {
      // Disconnection is the expected outcome.
    }
    await this.close()
  }

  /** Leave raw mode and trigger a soft reboot so main.py runs. */
  async softReset(): Promise<void> {
    try {
      await this.transport.write(Buffer.from([CTRL_B]))
      await delay(100)
      await this.transport.write(EOT)
      await delay(100)
    } catch {
      // Device may drop the port during reboot.
    }
    await this.close()
  }

  async close(): Promise<void> {
    this.unsubData?.()
    this.unsubClose?.()
    this.unsubData = null
    this.unsubClose = null
    await this.transport.close()
  }

  /**
   * Wait until `needle` appears in the receive buffer; consume and return
   * everything before it (the needle itself is consumed too).
   */
  private async waitFor(needle: Buffer, timeoutMs: number): Promise<Buffer> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const idx = this.rx.indexOf(needle)
      if (idx >= 0) {
        const before = this.rx.subarray(0, idx)
        this.rx = this.rx.subarray(idx + needle.length)
        return Buffer.from(before)
      }
      if (this.closed) throw FlashError.disconnected()
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        throw FlashError.timeout(`waiting for the Pico to respond`)
      }
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, Math.min(remaining, 250))
        this.waiter = {
          resolve: () => {
            clearTimeout(t)
            resolve()
          }
        }
      })
      this.waiter = null
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
