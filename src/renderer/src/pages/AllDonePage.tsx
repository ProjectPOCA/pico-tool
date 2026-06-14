import { useState } from 'react'
import { motion } from 'framer-motion'
import type { PanelEntry } from '@shared/types'
import { strings } from '@/strings'
import { useNav } from '@/navigation/nav-store'
import { beginFlash } from '@/navigation/flash-actions'
import { CircleIconButton } from '@/components/buttons'
import { PanelDiagram } from '@/components/PanelDiagram'
import { ActivityIcon, BadgeIcon, PocaOsIcon, RasterIcon } from '@/components/ModeIcons'

/**
 * Completion screen. The flashed panel is rendered at enlarged diagram scale,
 * vertically centered and left-aligned to the window midpoint; only the 7.4
 * is allowed to clip at the window's right edge.
 */
export function AllDonePage(): React.JSX.Element {
  const navigate = useNav((s) => s.navigate)
  // Snapshot the flashed config at mount: Restart clears the nav store while
  // this page is still on screen for its exit transition, and the diagram
  // must keep showing what was flashed (not fall back to another mode).
  const [{ panel, mode, planes, scriptName, scriptSource }] = useState(() => {
    const s = useNav.getState()
    return {
      panel: s.panel,
      mode: s.mode,
      planes: s.planes,
      scriptName: s.scriptName,
      scriptSource: s.scriptSource
    }
  })
  const setPanel = useNav((s) => s.setPanel)
  const setMode = useNav((s) => s.setMode)
  const setPlanes = useNav((s) => s.setPlanes)
  const setScript = useNav((s) => s.setScript)
  const [saved, setSaved] = useState(false)
  const t = strings.done

  const modeLabel =
    mode === 'poca-os'
      ? strings.flashMode.pocaOs
      : mode === 'badge'
        ? strings.flashMode.badge
        : mode === 'activity'
          ? strings.flashMode.activity
          : mode === 'raster'
            ? strings.flashMode.raster
            : strings.select.testDisplay

  const save = async (): Promise<void> => {
    if (!panel || !mode || saved) return
    await window.picoTool.configsSave({
      name: t.savedName(panel.panelId),
      panelId: panel.panelId,
      mode,
      summary: `${modeLabel} · ${panel.displayName}`,
      scriptName: scriptName ?? undefined,
      scriptSource: scriptSource ?? undefined,
      planes: planes
        ? { black: planes.black, red: planes.red, yellow: planes.yellow, quad: planes.quad }
        : undefined
    })
    setSaved(true)
  }

  // Re-run the identical flash (same panel, mode, payload) on another Pico.
  const flashCopy = async (): Promise<void> => {
    if (!panel || !mode) return
    await beginFlash({
      panelId: panel.panelId,
      mode,
      inputs: {
        planes: planes
          ? { black: planes.black, red: planes.red, yellow: planes.yellow, quad: planes.quad }
          : undefined,
        scriptName: scriptName ?? undefined,
        scriptSource: scriptSource ?? undefined
      }
    })
  }

  const restart = (): void => {
    setPanel(null)
    setMode(null)
    setPlanes(null)
    setScript(null, null)
    navigate('select-driver', 'x')
  }

  // Select-page diagram geometry at 2x, clamped to the page height so every
  // size fits vertically; only the 7.4 ends up wider than the half-window
  // and clips at the east edge.
  const BASE: Record<PanelEntry['sizeClass'], { w: number; h: number }> = {
    '4.2': { w: 274, h: 232 },
    '2.06': { w: 95, h: 191 },
    '1.5': { w: 110, h: 130 },
    '7.4': { w: 500, h: 305 }
  }
  const MAX_H = 520
  const MAX_W = 500 // half-window minus breathing room; 7.4 is exempt
  const sizeClass = panel?.sizeClass ?? '2.06'
  const base = BASE[sizeClass]
  const scale =
    sizeClass === '7.4'
      ? MAX_H / base.h
      : Math.min(2, MAX_H / base.h, MAX_W / base.w)
  const diagramW = Math.round(base.w * scale)
  const diagramH = Math.round(base.h * scale)

  const onRed = mode === 'poca-os' || mode === 'test-display'
  const modeIcon =
    mode === 'badge' ? (
      <BadgeIcon />
    ) : mode === 'activity' ? (
      <ActivityIcon />
    ) : mode === 'raster' ? (
      <RasterIcon />
    ) : (
      <PocaOsIcon active={onRed} />
    )

  return (
    <div className="page" style={{ overflow: 'hidden' }}>
      <div className="left-col">
        <motion.h1
          className="display"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.32, 0, 0.15, 1] }}
        >
          {t.title}
        </motion.h1>
        <p className="body-copy" style={{ marginTop: 40, fontWeight: 700 }}>
          {t.body1}
        </p>
        <p className="body-copy" style={{ fontWeight: 700 }}>
          {t.body2}
        </p>
        <div className="left-col__bottom">
          <CircleIconButton
            icon="save"
            label={t.saveTooltip}
            disabled={saved || mode === 'test-display'}
            onClick={() => void save()}
          />
          <CircleIconButton icon="copy" label={t.copyTooltip} onClick={() => void flashCopy()} />
          <CircleIconButton icon="restart" label={t.restartTooltip} onClick={restart} />
        </div>
      </div>

      {/* Anchored to the page, not the grid column: left edge = window midpoint. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translateY(-50%)'
        }}
      >
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.15, duration: 0.45, ease: [0.32, 0, 0.15, 1] }}
        >
          <div style={{ position: 'relative' }}>
            <PanelDiagram width={diagramW} height={diagramH} strokeScale={1} />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 14
              }}
            >
              <span
                style={{
                  width: 120,
                  height: 120,
                  borderRadius: 34,
                  border: 'var(--stroke) solid var(--black)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: mode === 'poca-os' || mode === 'test-display' ? 'var(--red)' : 'var(--white)'
                }}
              >
                {modeIcon}
              </span>
              <span className="tile__label">{modeLabel}</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
