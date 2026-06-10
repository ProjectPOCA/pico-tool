import { describe, expect, it } from 'vitest'
import { MockTransport } from '../src/main/serial/mock-transport'
import { RawReplClient } from '../src/main/serial/raw-repl'
import { FlashError } from '../src/main/serial/errors'

describe('RawReplClient against the scripted MicroPython mock', () => {
  it('connects, executes, and round-trips a file with verification', async () => {
    const mock = new MockTransport()
    const repl = new RawReplClient(mock)
    await repl.connect()

    await repl.mkdirs(['state', 'images', 'images/user'])
    expect(mock.dirs.has('/state')).toBe(true)
    expect(mock.dirs.has('/images/user')).toBe(true)

    const payload = Buffer.alloc(5000)
    for (let i = 0; i < payload.length; i++) payload[i] = i % 251
    await repl.writeFile('/images/user/user_black.bin', payload)
    expect(mock.files.get('/images/user/user_black.bin')?.equals(payload)).toBe(true)

    const readBack = await repl.readFile('/images/user/user_black.bin')
    expect(readBack?.equals(payload)).toBe(true)

    expect(await repl.statSize('/missing.bin')).toBeNull()
    expect(await repl.statvfsFree()).toBeGreaterThan(0)
    await repl.close()
  })

  const FAST = { enterRawTimeoutMs: 250, enterRawAttempts: 3, execTimeoutMs: 2000, chunkBytes: 768 }

  it('retries entering raw mode when the device is slow to interrupt', async () => {
    const mock = new MockTransport({ failEnterRawAttempts: 2 })
    const repl = new RawReplClient(mock, FAST)
    await repl.connect()
    const { stdout } = await repl.exec("print('hi')\n")
    // The mock answers generic execs with empty stdout; success is no throw.
    expect(stdout).toBe('')
    await repl.close()
  })

  it('gives up when raw mode never appears', async () => {
    const mock = new MockTransport({ failEnterRawAttempts: 99 })
    const repl = new RawReplClient(mock, FAST)
    await expect(repl.connect()).rejects.toMatchObject({ code: 'protocol-timeout' })
  })

  it('surfaces device tracebacks as exec errors', async () => {
    const mock = new MockTransport({ failPath: '/boom.bin' })
    const repl = new RawReplClient(mock)
    await repl.connect()
    await expect(repl.writeFile('/boom.bin', Buffer.from('x'))).rejects.toMatchObject({
      code: 'exec-error'
    })
  })

  it('reports disconnection mid-transfer', async () => {
    const mock = new MockTransport({ disconnectAfterChunks: 2 })
    const repl = new RawReplClient(mock)
    await repl.connect()
    const big = Buffer.alloc(768 * 5, 7)
    await expect(repl.writeFile('/big.bin', big)).rejects.toBeInstanceOf(FlashError)
  })

  it('treats port death during machine.reset() as success', async () => {
    const mock = new MockTransport()
    const repl = new RawReplClient(mock)
    await repl.connect()
    await repl.hardReset()
    expect(mock.resetCount).toBe(1)
    expect(mock.isOpen).toBe(false)
  })
})
