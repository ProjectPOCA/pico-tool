/** Error taxonomy for device communication. `retriable` drives the UI retry affordance. */

export type FlashErrorCode =
  | 'port-busy'
  | 'protocol-timeout'
  | 'device-disconnected'
  | 'exec-error'
  | 'no-device'
  | 'insufficient-space'
  | 'cancelled'
  | 'internal'

export class FlashError extends Error {
  readonly code: FlashErrorCode
  readonly retriable: boolean
  /** Device-side stderr for exec errors. */
  readonly detail?: string

  constructor(code: FlashErrorCode, message: string, opts?: { retriable?: boolean; detail?: string }) {
    super(message)
    this.name = 'FlashError'
    this.code = code
    this.retriable = opts?.retriable ?? true
    this.detail = opts?.detail
  }

  static portBusy(path: string): FlashError {
    return new FlashError(
      'port-busy',
      `The Pico at ${path} is in use by another application. Close anything else talking to it and try again.`
    )
  }

  static timeout(stage: string): FlashError {
    return new FlashError('protocol-timeout', `Timed out while ${stage}.`)
  }

  static disconnected(): FlashError {
    return new FlashError('device-disconnected', 'The Pico was disconnected.')
  }

  static exec(detail: string): FlashError {
    return new FlashError('exec-error', 'The Pico reported an error while running a setup step.', {
      detail
    })
  }

  static cancelled(): FlashError {
    return new FlashError('cancelled', 'Flash cancelled.', { retriable: true })
  }
}

export function isFlashError(e: unknown): e is FlashError {
  return e instanceof FlashError
}
