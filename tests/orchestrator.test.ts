import { beforeAll, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import type { FlashJobEvent } from '../src/shared/types'
import { MockTransport } from '../src/main/serial/mock-transport'
import { PortWatcher } from '../src/main/serial/port-watcher'
import { FlashOrchestrator } from '../src/main/flash/orchestrator'
import { buildPlan } from '../src/main/flash/plan-builder'

beforeAll(() => {
  process.env.PICO_TOOL_RESOURCES = resolve(__dirname, '../resources')
})

function watcherWithMockPico(): PortWatcher {
  const watcher = new PortWatcher()
  const device = {
    kind: 'micropython' as const,
    portPath: '/dev/mock',
    serialNumber: 'TEST',
    label: 'Raspberry Pi Pico'
  }
  ;(watcher as unknown as { known: Map<string, unknown> }).known.set('mp:TEST', device)
  return watcher
}

function runJob(start: () => string): Promise<FlashJobEvent> {
  return new Promise((resolveDone) => {
    let last: FlashJobEvent | null = null
    orchestratorEvents.push((ev) => {
      last = ev
    })
    start()
    const poll = setInterval(() => {
      if (last?.done) {
        clearInterval(poll)
        resolveDone(last)
      }
    }, 10)
  })
}

// Collected emit callbacks (the orchestrator takes emit in its constructor).
const orchestratorEvents: ((ev: FlashJobEvent) => void)[] = []

describe('FlashOrchestrator end-to-end against the mock device', () => {
  it('runs a POCA OS plan through all five steps and lands the payload', async () => {
    const watcher = watcherWithMockPico()
    const mock = new MockTransport()
    const orchestrator = new FlashOrchestrator(
      watcher,
      () => mock,
      (ev) => orchestratorEvents.forEach((cb) => cb(ev))
    )

    const plan = buildPlan('E2206JSHJ1', 'poca-os')
    expect(plan.totalBytes).toBeGreaterThan(30000)

    const result = await runJob(() => orchestrator.start(plan))
    expect(result.error).toBeUndefined()
    expect(result.steps.every((s) => s.state === 'done')).toBe(true)

    // Driver modules + config + bootstrap all landed on the device.
    expect(mock.files.has('/vusion_2in1_main.py')).toBe(true)
    expect(mock.files.has('/vusion_2in1_backend_ssd.py')).toBe(true)
    expect(mock.files.get('/main.py')?.toString()).toContain('import vusion_2in1_main')
    const config = JSON.parse(mock.files.get('/state/poca_runtime_config.json')!.toString())
    expect(config.backend).toBe('ssd')
    expect(mock.resetCount).toBe(1)
  }, 15000)

  it('renders a viewer for test-display plans', async () => {
    const watcher = watcherWithMockPico()
    const mock = new MockTransport()
    const orchestrator = new FlashOrchestrator(
      watcher,
      () => mock,
      (ev) => orchestratorEvents.forEach((cb) => cb(ev))
    )
    const plan = buildPlan('E2152JSHJ2', 'test-display')
    const result = await runJob(() => orchestrator.start(plan))
    expect(result.error).toBeUndefined()
    const viewer = mock.files.get('/poca_viewer.py')?.toString()
    expect(viewer).toContain('from vusion_1in52_backend_bwr import Backend')
    expect(viewer).not.toContain('{{')
    expect(mock.files.has('/images/user/user_black.bin')).toBe(true)
    expect(mock.files.get('/main.py')?.toString()).toContain('import poca_viewer')
  }, 15000)

  it('fails fast with a clear error when the filesystem is too small', async () => {
    const watcher = watcherWithMockPico()
    const mock = new MockTransport({ freeBytes: 1000 })
    const orchestrator = new FlashOrchestrator(
      watcher,
      () => mock,
      (ev) => orchestratorEvents.forEach((cb) => cb(ev))
    )
    const plan = buildPlan('E2206JSHJ1', 'poca-os')
    const result = await runJob(() => orchestrator.start(plan))
    expect(result.error?.message).toMatch(/free space/i)
    expect(result.steps.find((s) => s.id === 'connect')?.state).toBe('error')
    // main.py untouched on failure before the reboot step.
    expect(mock.files.has('/main.py')).toBe(false)
  }, 15000)

  it('fails the active step when the device disconnects mid-write', async () => {
    const watcher = watcherWithMockPico()
    const mock = new MockTransport({ disconnectAfterChunks: 10 })
    const orchestrator = new FlashOrchestrator(
      watcher,
      () => mock,
      (ev) => orchestratorEvents.forEach((cb) => cb(ev))
    )
    const plan = buildPlan('E2206JSHJ1', 'poca-os')
    const result = await runJob(() => orchestrator.start(plan))
    expect(result.error).toBeDefined()
    expect(result.error?.retriable).toBe(true)
    expect(mock.files.has('/main.py')).toBe(false)
  }, 15000)

  it('builds activity plans with the crash-safe bootstrap', () => {
    const plan = buildPlan('E2417JS0D2', 'activity', {
      scriptName: 'blink.py',
      scriptSource: 'print("hello")\n'
    })
    const boot = plan.files.find((f) => f.devicePath === '/poca_activity_boot.py')
    expect(boot?.data.toString()).toContain('import user_activity')
    expect(plan.bootstrapImport).toBe('poca_activity_boot')
  })

  it('requires packed payload for quad-color 4.2 raster plans', () => {
    expect(() =>
      buildPlan('E2417QS0A3', 'raster', { planes: { black: new Uint8Array(15000) } })
    ).toThrow(/packed framebuffer/)
    const plan = buildPlan('E2417QS0A3', 'raster', {
      planes: { quad: new Uint8Array(30000) }
    })
    const viewer = plan.files.find((f) => f.devicePath === '/poca_viewer.py')
    expect(viewer?.data.toString()).toContain('user_quad2bpp.bin')
  })
})
