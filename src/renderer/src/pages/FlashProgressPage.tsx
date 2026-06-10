import { useEffect } from 'react'
import { strings } from '@/strings'
import { useNav } from '@/navigation/nav-store'
import { beginFlash } from '@/navigation/flash-actions'
import { useFlashJob } from '@/hooks/usePicoTool'
import { PillButton } from '@/components/buttons'
import { ProgressChecklist } from '@/components/ProgressChecklist'

export function FlashProgressPage(): React.JSX.Element {
  const navigate = useNav((s) => s.navigate)
  const jobId = useNav((s) => s.jobId)
  const panel = useNav((s) => s.panel)
  const mode = useNav((s) => s.mode)
  const savedConfigId = useNav((s) => s.savedConfigId)
  const planes = useNav((s) => s.planes)
  const scriptName = useNav((s) => s.scriptName)
  const scriptSource = useNav((s) => s.scriptSource)
  const job = useFlashJob(jobId)
  const t = strings.progress

  const failed = Boolean(job?.error)
  const succeeded = Boolean(job?.done && !job.error)

  useEffect(() => {
    if (!succeeded) return
    const timer = setTimeout(() => navigate('all-done', 'x'), 700)
    return () => clearTimeout(timer)
  }, [succeeded, navigate])

  const retry = async (): Promise<void> => {
    if (!panel || !mode) return
    await beginFlash(
      {
        panelId: panel.panelId,
        mode,
        inputs: planes
          ? { planes: { black: planes.black, red: planes.red, yellow: planes.yellow, quad: planes.quad } }
          : scriptSource
            ? { scriptName: scriptName ?? 'activity.py', scriptSource }
            : undefined
      },
      savedConfigId ?? undefined
    )
  }

  const cancel = async (): Promise<void> => {
    if (jobId) await window.picoTool.flashCancel(jobId)
    navigate('flash-mode', 'x')
  }

  return (
    <div className="page">
      <div className="left-col">
        <h1 className="display" style={{ whiteSpace: 'pre-line' }}>
          {t.title}
        </h1>
        <p className="body-copy" style={{ marginTop: 44, fontWeight: 700 }}>
          {t.body}
        </p>
        {failed ? (
          <p className="meta" style={{ color: 'var(--red)', maxWidth: 300 }}>
            {job?.error?.message}
          </p>
        ) : null}
        <div className="left-col__bottom">
          {failed && job?.error?.retriable ? (
            <PillButton solid onClick={() => void retry()}>
              {t.retry}
            </PillButton>
          ) : null}
          {!job?.done ? <PillButton onClick={() => void cancel()}>{t.cancel}</PillButton> : null}
        </div>
      </div>

      <div className="stack" style={{ justifyContent: 'center', paddingLeft: 40 }}>
        {job ? (
          <ProgressChecklist steps={job.steps} />
        ) : (
          <ProgressChecklist
            steps={[
              { id: 'connect', label: 'Connect to Pico', state: 'active' },
              { id: 'driver', label: 'Install the display driver', state: 'pending' },
              { id: 'load', label: 'Load', state: 'pending' },
              { id: 'reboot', label: 'Reboot', state: 'pending' },
              { id: 'ready', label: 'Pico ready for use', state: 'pending' }
            ]}
          />
        )}
      </div>
    </div>
  )
}
