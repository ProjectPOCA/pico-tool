import { useEffect, useRef, useState } from 'react'
import type { InkColor } from '@shared/binpack'
import { strings } from '@/strings'
import { useNav } from '@/navigation/nav-store'
import { beginFlash } from '@/navigation/flash-actions'
import { CircleArrowButton } from '@/components/buttons'
import { generatePlanes, paintPreview, renderBadge } from '@/imaging/convert'

const SWATCH: Record<InkColor, string> = {
  white: '#FFFFFF',
  black: '#000000',
  red: '#FF0000',
  yellow: '#FFD700'
}

export function BadgeEditorPage(): React.JSX.Element {
  const navigate = useNav((s) => s.navigate)
  const panel = useNav((s) => s.panel)
  const setPlanes = useNav((s) => s.setPlanes)
  const [text, setText] = useState('')
  const [bg, setBg] = useState<InkColor>('white')
  const [fg, setFg] = useState<InkColor>('black')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const t = strings.badge

  const inks = (panel?.colors ?? ['black', 'white']) as InkColor[]

  useEffect(() => {
    if (!panel || !canvasRef.current) return
    const image = renderBadge(text, bg, fg, panel)
    const planes = generatePlanes(image, panel, 0)
    paintPreview(canvasRef.current, planes)
  }, [text, bg, fg, panel])

  const go = async (): Promise<void> => {
    if (!panel) return
    const image = renderBadge(text, bg, fg, panel)
    const planes = generatePlanes(image, panel, 0)
    setPlanes(planes)
    await beginFlash({
      panelId: panel.panelId,
      mode: 'badge',
      inputs: {
        planes: { black: planes.black, red: planes.red, yellow: planes.yellow, quad: planes.quad }
      }
    })
  }

  if (!panel) return <div className="page" />

  const [pw, ph] = panel.resolution
  const previewScale = Math.min(440 / pw, 360 / ph)

  return (
    <div className="page">
      <div className="left-col">
        <h1 className="display" style={{ whiteSpace: 'pre-line' }}>
          {t.title}
        </h1>
        <div className="stack" style={{ gap: 22, marginTop: 44, width: 280 }}>
          <input
            className="text-input"
            placeholder={t.namePlaceholder}
            value={text}
            maxLength={48}
            onChange={(e) => setText(e.target.value)}
          />
          <ColorPicker label={t.background} value={bg} options={inks} onChange={setBg} />
          <ColorPicker label={t.textColor} value={fg} options={inks} onChange={setFg} />
        </div>
        <div className="left-col__bottom">
          <CircleArrowButton
            direction="left"
            label="Back"
            onClick={() => navigate('flash-mode', 'x')}
          />
          <CircleArrowButton
            direction="right"
            label="Flash badge"
            disabled={text.trim().length === 0}
            onClick={() => void go()}
          />
        </div>
      </div>

      <div className="stack" style={{ alignItems: 'center', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          style={{
            width: pw * previewScale,
            height: ph * previewScale,
            border: 'var(--stroke) solid var(--black)',
            borderRadius: 8,
            imageRendering: 'pixelated'
          }}
        />
      </div>
    </div>
  )
}

function ColorPicker(props: {
  label: string
  value: InkColor
  options: InkColor[]
  onChange(v: InkColor): void
}): React.JSX.Element {
  return (
    <div className="row" style={{ gap: 14 }}>
      <span className="meta" style={{ width: 90 }}>
        {props.label}
      </span>
      <span className="row" style={{ gap: 9 }}>
        {props.options.map((c) => (
          <button
            key={c}
            onClick={() => props.onChange(c)}
            aria-label={c}
            style={{
              width: 25,
              height: 25,
              borderRadius: '50%',
              background: SWATCH[c],
              border:
                props.value === c
                  ? '2px solid var(--red)'
                  : c === 'white'
                    ? '2px solid var(--black)'
                    : '2px solid transparent',
              outline: props.value === c && c === 'red' ? '2px solid var(--black)' : 'none'
            }}
          />
        ))}
      </span>
    </div>
  )
}
