import { randomUUID } from 'node:crypto'
import type { FlashJobEvent, FlashStep, FlashStepId } from '@shared/types'
import { FlashError, isFlashError } from '../serial/errors'
import { RawReplClient } from '../serial/raw-repl'
import type { Transport } from '../serial/transport'
import type { PortWatcher } from '../serial/port-watcher'
import { firmwareUf2Path } from '../payloads/manifest'
import { flashUf2, waitForBootsel, waitForBootselGone, waitForSerial } from './uf2-flasher'
import type { FlashPlan } from './plan-builder'

/**
 * Runs a FlashPlan as the five-step pipeline shown in the UI:
 * connect -> driver -> load -> reboot -> ready.
 *
 * main.py is only touched in the reboot step, so a cancelled or failed flash
 * never leaves the board unable to boot its previous payload.
 */

const STEP_ORDER: FlashStepId[] = ['connect', 'driver', 'load', 'reboot', 'ready']
const FREE_SPACE_MARGIN = 1.15
const REENUMERATE_TIMEOUT_MS = 20000
const FIRMWARE_BOOT_TIMEOUT_MS = 30000

export type TransportFactory = (portPath: string) => Transport

interface Job {
  id: string
  abort: AbortController
  steps: FlashStep[]
}

export class FlashOrchestrator {
  private jobs = new Map<string, Job>()
  /** Last event per job so late subscribers (page mounting after fast steps) can catch up. */
  private lastEvents = new Map<string, FlashJobEvent>()

  constructor(
    private readonly watcher: PortWatcher,
    private readonly transportFactory: TransportFactory,
    private readonly emit: (ev: FlashJobEvent) => void
  ) {}

  status(jobId: string): FlashJobEvent | null {
    return this.lastEvents.get(jobId) ?? null
  }

  start(plan: FlashPlan, portPath?: string): string {
    const id = randomUUID()
    const job: Job = {
      id,
      abort: new AbortController(),
      steps: STEP_ORDER.map((stepId) => ({
        id: stepId,
        label: plan.stepLabels[stepId],
        state: 'pending'
      }))
    }
    this.jobs.set(id, job)
    void this.run(job, plan, portPath).finally(() => this.jobs.delete(id))
    return id
  }

  cancel(jobId: string): void {
    this.jobs.get(jobId)?.abort.abort()
  }

  private progress(job: Job, percent = 0, error?: FlashError, done = false): void {
    const event: FlashJobEvent = {
      jobId: job.id,
      steps: job.steps.map((s) => ({ ...s })),
      activeStepPercent: percent,
      error: error ? { message: error.message, retriable: error.retriable } : undefined,
      done
    }
    this.lastEvents.set(job.id, event)
    if (this.lastEvents.size > 20) {
      const oldest = this.lastEvents.keys().next().value
      if (oldest) this.lastEvents.delete(oldest)
    }
    this.emit(event)
  }

  private setStep(job: Job, id: FlashStepId, state: FlashStep['state']): void {
    const step = job.steps.find((s) => s.id === id)
    if (step) step.state = state
  }

  private async run(job: Job, plan: FlashPlan, portPath?: string): Promise<void> {
    let active: FlashStepId = 'connect'
    try {
      if (plan.payloadType === 'uf2') {
        await this.runUf2(job, plan)
        return
      }

      // -- connect ----------------------------------------------------------
      this.setStep(job, 'connect', 'active')
      this.progress(job)
      const repl = await this.connectWithBootstrap(job, portPath)
      try {
        const free = await repl.statvfsFree()
        if (free < plan.totalBytes * FREE_SPACE_MARGIN) {
          throw new FlashError(
            'insufficient-space',
            'There is not enough free space on this Pico for the selected payload.',
            { retriable: false }
          )
        }
        this.setStep(job, 'connect', 'done')

        // -- driver -----------------------------------------------------------
        active = 'driver'
        this.setStep(job, 'driver', 'active')
        this.progress(job)
        await repl.mkdirs(plan.dirs)
        await this.writeStepFiles(job, plan, repl, 'driver')
        this.setStep(job, 'driver', 'done')

        // -- load -------------------------------------------------------------
        active = 'load'
        this.setStep(job, 'load', 'active')
        this.progress(job)
        await this.writeStepFiles(job, plan, repl, 'load')
        this.setStep(job, 'load', 'done')

        // -- reboot -----------------------------------------------------------
        active = 'reboot'
        this.setStep(job, 'reboot', 'active')
        this.progress(job)
        this.throwIfAborted(job)
        // Backup previous main.py for manual rollback, then point it at the payload.
        await repl.exec(
          `try:\n open('main_prev.py','w').write(open('main.py').read())\nexcept OSError:\n pass\n`
        )
        await repl.writeFile(
          '/main.py',
          Buffer.from(`import ${plan.bootstrapImport}  # noqa\n`, 'utf8')
        )
        await repl.hardReset()
        this.setStep(job, 'reboot', 'done')
      } catch (e) {
        await repl.close().catch(() => undefined)
        throw e
      }

      // -- ready --------------------------------------------------------------
      active = 'ready'
      this.setStep(job, 'ready', 'active')
      this.progress(job)
      // Some runtimes hold the display busy at boot; non-reappearance is not failure.
      await waitForSerial(this.watcher, REENUMERATE_TIMEOUT_MS)
      this.setStep(job, 'ready', 'done')
      this.progress(job, 100, undefined, true)
    } catch (e) {
      const err = isFlashError(e)
        ? e
        : new FlashError('internal', e instanceof Error ? e.message : String(e))
      this.setStep(job, active, 'error')
      this.progress(job, 0, err, true)
    }
  }

  /**
   * Resolve a serial Pico, bootstrapping MicroPython over BOOTSEL first when
   * only a bootloader-mode device is present.
   */
  private async connectWithBootstrap(job: Job, portPath?: string): Promise<RawReplClient> {
    this.throwIfAborted(job)
    let device = this.watcher.pickPort(portPath)
    if (!device && this.watcher.bootselVolume()) {
      const volume = await waitForBootsel(this.watcher, 5000, job.abort.signal)
      await flashUf2(volume, firmwareUf2Path(), (p) => this.progress(job, Math.round(p / 2)), job.abort.signal)
      await waitForBootselGone(this.watcher, 15000)
      const newPort = await waitForSerial(this.watcher, FIRMWARE_BOOT_TIMEOUT_MS)
      if (!newPort) throw FlashError.timeout('waiting for the Pico after installing its runtime')
      device = this.watcher.pickPort(newPort)
    }
    if (!device?.portPath) {
      throw new FlashError('no-device', 'No Pico found. Connect one over USB and try again.')
    }
    this.throwIfAborted(job)
    const repl = new RawReplClient(this.transportFactory(device.portPath))
    await repl.connect()
    return repl
  }

  private async writeStepFiles(
    job: Job,
    plan: FlashPlan,
    repl: RawReplClient,
    step: 'driver' | 'load'
  ): Promise<void> {
    const files = plan.files.filter((f) => f.step === step)
    const stepTotal = files.reduce((sum, f) => sum + f.data.length, 0) || 1
    let written = 0
    for (const file of files) {
      this.throwIfAborted(job)
      // Skip identical files (size heuristic) to make re-flashes fast.
      const existing = await repl.statSize(file.devicePath)
      if (existing === file.data.length && step === 'driver') {
        written += file.data.length
        this.progress(job, Math.round((written / stepTotal) * 100))
        continue
      }
      await repl.writeFile(
        file.devicePath,
        file.data,
        (w) => this.progress(job, Math.round(((written + w) / stepTotal) * 100)),
        job.abort.signal
      )
      written += file.data.length
    }
  }

  private async runUf2(job: Job, plan: FlashPlan): Promise<void> {
    this.setStep(job, 'connect', 'active')
    this.progress(job)
    const volume = await waitForBootsel(this.watcher, 120000, job.abort.signal)
    this.setStep(job, 'connect', 'done')

    this.setStep(job, 'driver', 'active')
    this.progress(job)
    if (!plan.uf2Path) throw new FlashError('internal', 'missing UF2 payload')
    await flashUf2(volume, plan.uf2Path, (p) => this.progress(job, p), job.abort.signal)
    this.setStep(job, 'driver', 'done')
    this.setStep(job, 'load', 'done')

    this.setStep(job, 'reboot', 'active')
    this.progress(job)
    await waitForBootselGone(this.watcher, 15000)
    this.setStep(job, 'reboot', 'done')

    this.setStep(job, 'ready', 'done')
    this.progress(job, 100, undefined, true)
  }

  private throwIfAborted(job: Job): void {
    if (job.abort.signal.aborted) throw FlashError.cancelled()
  }
}
