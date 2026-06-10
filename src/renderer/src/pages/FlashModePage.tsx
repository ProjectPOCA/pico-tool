import { useState } from 'react'
import type { FlashMode } from '@shared/types'
import { strings } from '@/strings'
import { useNav } from '@/navigation/nav-store'
import { beginFlash } from '@/navigation/flash-actions'
import { CircleArrowButton } from '@/components/buttons'
import {
  ActivityIcon,
  BadgeIcon,
  PocaOsIcon,
  RasterIcon,
  type ModeIconProps
} from '@/components/ModeIcons'

const MODES: { mode: FlashMode; label: string; Icon: (p: ModeIconProps) => React.JSX.Element }[] =
  [
    { mode: 'poca-os', label: strings.flashMode.pocaOs, Icon: PocaOsIcon },
    { mode: 'badge', label: strings.flashMode.badge, Icon: BadgeIcon },
    { mode: 'activity', label: strings.flashMode.activity, Icon: ActivityIcon },
    { mode: 'raster', label: strings.flashMode.raster, Icon: RasterIcon }
  ]

export function FlashModePage(): React.JSX.Element {
  const navigate = useNav((s) => s.navigate)
  const panel = useNav((s) => s.panel)
  const setMode = useNav((s) => s.setMode)
  const [hovered, setHovered] = useState<FlashMode>('poca-os')
  const t = strings.flashMode

  const choose = async (mode: FlashMode): Promise<void> => {
    if (!panel) return
    setMode(mode)
    if (mode === 'poca-os') {
      await beginFlash({ panelId: panel.panelId, mode })
    } else if (mode === 'badge') {
      navigate('badge-editor', 'x')
    } else {
      navigate('file-pick', 'x')
    }
  }

  return (
    <div className="page">
      <div className="left-col">
        <h1 className="display" style={{ whiteSpace: 'pre-line' }}>
          {t.title}
        </h1>
        <p className="meta" style={{ marginTop: 48, whiteSpace: 'pre-line', maxWidth: 300 }}>
          {t.descriptions[hovered]}
        </p>
        <div className="left-col__bottom">
          <CircleArrowButton
            direction="up"
            label="Back to display selection"
            onClick={() => navigate('select-driver', 'y')}
          />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 156px)',
          gap: '56px 90px',
          alignContent: 'center',
          justifyContent: 'center'
        }}
      >
        {MODES.map(({ mode, label, Icon }) => {
          const active = hovered === mode
          return (
            <button
              key={mode}
              className="tile"
              onClick={() => void choose(mode)}
              onMouseEnter={() => setHovered(mode)}
            >
              <span className="tile__frame">
                <span className={`tile__inner${active ? ' tile__inner--active' : ''}`}>
                  <Icon active={active} />
                </span>
              </span>
              <span className="tile__label">{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
