import type { SavedConfig } from '@shared/types'
import { strings } from '@/strings'
import { useNav } from '@/navigation/nav-store'
import { beginFlash } from '@/navigation/flash-actions'
import { useCatalog, useSavedConfigs } from '@/hooks/usePicoTool'
import { CircleIconButton, PillButton } from '@/components/buttons'
import { ActivityIcon, BadgeIcon, PocaOsIcon, RasterIcon } from '@/components/ModeIcons'

/** The saved config's flash-mode artwork, at row scale. */
function ModeBadge({ mode }: { mode: SavedConfig['mode'] }): React.JSX.Element {
  const px = 2
  if (mode === 'badge') return <BadgeIcon px={px} />
  if (mode === 'activity') return <ActivityIcon px={px} />
  if (mode === 'raster') return <RasterIcon px={px} />
  return <PocaOsIcon px={px} />
}

export function MyPicoPage(): React.JSX.Element {
  const navigate = useNav((s) => s.navigate)
  const setPanel = useNav((s) => s.setPanel)
  const setMode = useNav((s) => s.setMode)
  const catalog = useCatalog()
  const { configs, remove } = useSavedConfigs()
  const t = strings.myPico

  const reflash = async (configId: string): Promise<void> => {
    const config = configs.find((c) => c.id === configId)
    if (!config) return
    setPanel(catalog.find((p) => p.panelId === config.panelId) ?? null)
    setMode(config.mode)
    await beginFlash({ panelId: config.panelId, mode: config.mode }, configId)
  }

  return (
    <div className="page">
      <div className="left-col">
        <h1 className="display">{t.title}</h1>
        <p className="subtitle">{t.freshTitle}</p>
        <p className="body-copy" style={{ marginTop: 14 }}>
          {t.freshBody}
        </p>
        <div className="left-col__bottom">
          <CircleIconButton
            icon="plus"
            label="Start a new flash"
            onClick={() => navigate('select-driver', 'x')}
          />
        </div>
      </div>

      <div className="card" style={{ overflowY: 'auto' }}>
        <p className="subtitle" style={{ margin: '0 0 18px' }}>
          {t.savedHeader}
        </p>
        {configs.length === 0 ? (
          <p className="body-copy" style={{ fontWeight: 400 }}>
            {t.emptyHint}
          </p>
        ) : (
          configs.map((c) => (
            <div key={c.id} className="saved-row">
              <span className="saved-row__icon">
                <ModeBadge mode={c.mode} />
              </span>
              <span>
                <span className="saved-row__name">{c.name}</span>
                <br />
                <span className="saved-row__sub">{c.summary}</span>
              </span>
              <span className="saved-row__actions">
                <PillButton solid onClick={() => void reflash(c.id)}>
                  {t.flashAgain}
                </PillButton>
                <PillButton onClick={() => void remove(c.id)}>{t.delete}</PillButton>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
