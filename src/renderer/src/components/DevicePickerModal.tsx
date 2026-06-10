import { strings } from '@/strings'
import { useNav } from '@/navigation/nav-store'
import { cancelPendingFlash, launch } from '@/navigation/flash-actions'
import { useDevices } from '@/hooks/usePicoTool'
import { PillButton } from './buttons'

/** Shown when a flash starts while more than one Pico is connected. */
export function DevicePickerModal(): React.JSX.Element | null {
  const pending = useNav((s) => s.pendingFlash)
  const devices = useDevices().filter((d) => d.kind === 'micropython')
  const t = strings.devices

  if (!pending) return null

  return (
    <div className="modal-backdrop" onClick={cancelPendingFlash}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <p className="subtitle" style={{ margin: '0 0 8px' }}>
          {t.pickerTitle}
        </p>
        <p className="body-copy">{t.pickerBody}</p>
        <div className="stack" style={{ gap: 12, marginTop: 18 }}>
          {devices.map((d) => (
            <PillButton key={d.portPath} onClick={() => void launch(pending, d.portPath)}>
              {d.label} — {d.portPath}
            </PillButton>
          ))}
        </div>
      </div>
    </div>
  )
}
