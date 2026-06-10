import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { PanelEntry } from '@shared/types'
import { strings } from '@/strings'
import { useNav } from '@/navigation/nav-store'
import { beginFlash } from '@/navigation/flash-actions'
import { useCatalog, useFlashJob } from '@/hooks/usePicoTool'
import { CircleArrowButton, PillButton } from '@/components/buttons'
import { ABToggle, ColorDots } from '@/components/ColorDots'
import { PanelDiagram } from '@/components/PanelDiagram'

/**
 * The selection screen: four price-tag diagrams at relative physical size.
 * Hovering inverts a diagram and reveals its driver options as color-dot rows;
 * picking colors selects the driver. When two drivers share a size + colors,
 * the anonymous a/b toggle appears beside the selected name.
 */

const DIAGRAM_SIZE: Record<PanelEntry['sizeClass'], { w: number; h: number }> = {
  '4.2': { w: 274, h: 232 },
  '2.06': { w: 95, h: 191 },
  '1.5': { w: 110, h: 130 },
  '7.4': { w: 500, h: 305 }
}

/**
 * Inline status for Test Display: tracks the calibration flash without
 * leaving the selection screen, then dismisses itself.
 */
function TestPopover(props: { jobId: string | null; onDone(): void }): React.JSX.Element {
  const job = useFlashJob(props.jobId)
  const t = strings.select
  const failed = Boolean(job?.error)
  const finished = Boolean(job?.done && !job.error)
  const activeLabel =
    job?.steps.find((s) => s.state === 'active')?.label ?? t.testSending

  useEffect(() => {
    if (!props.jobId || !job?.done) return
    const timer = setTimeout(props.onDone, job.error ? 5200 : 2600)
    return () => clearTimeout(timer)
  }, [props.jobId, job?.done, job?.error])

  return (
    <AnimatePresence>
      {props.jobId ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.22, ease: [0.32, 0, 0.15, 1] }}
          style={{
            position: 'absolute',
            top: 'calc(100% + 14px)',
            left: 0,
            minWidth: 260,
            background: 'var(--white)',
            border: 'var(--stroke) solid var(--black)',
            borderRadius: 18,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            zIndex: 20
          }}
        >
          <span
            className={`checklist__dot ${
              failed
                ? 'checklist__row--error'
                : finished
                  ? 'checklist__row--done'
                  : 'checklist__row--active'
            }`}
            style={{
              width: 20,
              height: 20,
              flex: '0 0 20px',
              borderRadius: '50%',
              border: 'var(--stroke) solid var(--black)',
              borderStyle: finished || failed ? 'solid' : 'dashed',
              background: failed ? 'var(--red)' : finished ? 'var(--black)' : 'var(--white)',
              animation: finished || failed ? 'none' : 'spin 1.4s linear infinite'
            }}
          />
          <span className="meta" style={{ color: failed ? 'var(--red)' : 'var(--black)' }}>
            {failed ? job?.error?.message : finished ? t.testDone : activeLabel}
          </span>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

/** One selectable option: a distinct color ability within a size class. */
interface DriverOption {
  key: string
  colors: PanelEntry['colors']
  panels: PanelEntry[] // 1 normally, 2 for a/b variant groups
}

function optionsForSize(panels: PanelEntry[]): DriverOption[] {
  const byKey = new Map<string, DriverOption>()
  for (const p of panels) {
    const key = p.variantGroup ?? `${p.sizeClass}:${p.colors.join('')}:${p.panelId}`
    const existing = byKey.get(key)
    if (existing) existing.panels.push(p)
    else byKey.set(key, { key, colors: p.colors, panels: [p] })
  }
  for (const opt of byKey.values()) {
    opt.panels.sort((a, b) => (a.variantLabel ?? 'a').localeCompare(b.variantLabel ?? 'a'))
  }
  // Fewest colors first: B/W, then B/W/R, then B/W/R/Y.
  return [...byKey.values()].sort((a, b) => a.colors.length - b.colors.length)
}

export function SelectDriverPage(): React.JSX.Element {
  const catalog = useCatalog()
  const navigate = useNav((s) => s.navigate)
  const selected = useNav((s) => s.panel)
  const setPanel = useNav((s) => s.setPanel)
  const [testJobId, setTestJobId] = useState<string | null>(null)
  const t = strings.select

  const bySize = useMemo(() => {
    const m = new Map<PanelEntry['sizeClass'], PanelEntry[]>()
    for (const p of catalog) {
      m.set(p.sizeClass, [...(m.get(p.sizeClass) ?? []), p])
    }
    return m
  }, [catalog])

  const selectedGroup = selected?.variantGroup
    ? catalog.filter((p) => p.variantGroup === selected.variantGroup)
    : null

  const testDisplay = async (): Promise<void> => {
    if (!selected || testJobId) return
    // Runs in place: no page change, just the popover tracking the job.
    await beginFlash({ panelId: selected.panelId, mode: 'test-display' }, undefined, {
      silent: true
    })
    setTestJobId(useNav.getState().jobId)
  }

  const renderDiagram = (sizeClass: PanelEntry['sizeClass']): React.JSX.Element | null => {
    const panels = bySize.get(sizeClass)
    if (!panels) return null
    const { w, h } = DIAGRAM_SIZE[sizeClass]
    const options = optionsForSize(panels)
    const available = panels.some((p) => p.available)
    const isSelected = selected?.sizeClass === sizeClass

    return (
      <PanelDiagram
        width={w}
        height={h}
        selected={isSelected}
        dimmed={!available}
        overlay={
          <>
            {options.map((opt) => {
              const active = opt.panels.some((p) => p.panelId === selected?.panelId)
              return (
                <button
                  key={opt.key}
                  className={`diagram__option${active ? ' diagram__option--on' : ''}`}
                  disabled={!available}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!available) return
                    setPanel(opt.panels[0])
                  }}
                  aria-label={opt.colors.join(' ')}
                >
                  <ColorDots colors={opt.colors} small={sizeClass === '2.06' || sizeClass === '1.5'} onDark />
                </button>
              )
            })}
            {!available ? (
              <span style={{ color: 'var(--white)', fontWeight: 900, fontSize: 12 }}>
                {t.comingSoon}
              </span>
            ) : null}
          </>
        }
      />
    )
  }

  return (
    <div className="page">
      <div className="left-col">
        {selected ? (
          <motion.div
            key={selected.panelId}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="left-col"
            style={{ flex: 1 }}
          >
            <h1 className="display">{t.selectedTitle}</h1>
            <div className="row" style={{ gap: 18, marginTop: 18 }}>
              <p className="subtitle" style={{ margin: 0 }}>
                {selected.displayName}
              </p>
              {selectedGroup && selectedGroup.length > 1 ? (
                <ABToggle
                  value={selected.variantLabel ?? 'a'}
                  onChange={(v) => {
                    const next = selectedGroup.find((p) => p.variantLabel === v)
                    if (next) setPanel(next)
                  }}
                />
              ) : null}
            </div>
            <hr className="rule" style={{ width: 276 }} />
            <div className="meta">
              {selected.panelId}
              <br />
              {t.display} {selected.resolution[0]}x{selected.resolution[1]}
              <br />
              {t.colors}{' '}
              {selected.colors.map((c) => t.colorNames[c]).join('/')}
              <br />
              {t.refresh} {selected.refreshSeconds} {t.refreshUnit}
            </div>
            <div style={{ marginTop: 56, position: 'relative' }}>
              <PillButton onClick={() => void testDisplay()} disabled={Boolean(testJobId)}>
                {t.testDisplay}
              </PillButton>
              <TestPopover jobId={testJobId} onDone={() => setTestJobId(null)} />
            </div>
            <div className="left-col__bottom">
              <CircleArrowButton
                direction="down"
                label="Choose flash mode"
                onClick={() => navigate('flash-mode', 'y')}
              />
            </div>
          </motion.div>
        ) : (
          <>
            <h1 className="display">{t.title}</h1>
            <p className="meta" style={{ fontSize: 22, marginTop: 10 }}>
              {t.subtitle}
            </p>
          </>
        )}
      </div>

      <div className="stack" style={{ gap: 30, minHeight: 0, justifyContent: 'center' }}>
        <div className="row" style={{ gap: 36, alignItems: 'center' }}>
          {renderDiagram('4.2')}
          {renderDiagram('2.06')}
          {renderDiagram('1.5')}
        </div>
        {renderDiagram('7.4')}
      </div>
    </div>
  )
}
