import type { ReactNode } from 'react'

/**
 * Outline drawing of a recycled price-tag display, matching the Figma
 * diagrams: 2px frame, screen area with connector tab, screw heads and a
 * label dash in the bottom strip. Hover/selection inverts the drawing
 * (CSS-driven) and reveals the driver options overlay.
 */
export function PanelDiagram(props: {
  width: number
  height: number
  selected?: boolean
  dimmed?: boolean
  overlay?: ReactNode
  onClick?(): void
  /** scale factor for stroke compensation on the 2x All Done render */
  strokeScale?: number
}): React.JSX.Element {
  const { width: w, height: h } = props
  const s = 2 / (props.strokeScale ?? 1)
  const m = Math.max(5, Math.round(Math.min(w, h) * 0.045)) // frame inset
  const strip = Math.max(16, Math.round(h * 0.13)) // bottom plastic strip
  const screenBottom = h - m - strip
  const tabW = Math.max(28, Math.round(w * 0.22))
  const tabH = Math.min(9, strip - 7)
  const screwR = Math.max(2.5, Math.min(4, w * 0.012))
  const dashW = Math.max(20, Math.round(w * 0.12))

  const screenPath = [
    `M ${m} ${m}`,
    `H ${w - m}`,
    `V ${screenBottom}`,
    `H ${w / 2 + tabW / 2}`,
    `v ${tabH}`,
    `h ${-tabW}`,
    `v ${-tabH}`,
    `H ${m}`,
    'Z'
  ].join(' ')

  return (
    <div
      className={`diagram${props.selected ? ' diagram--selected' : ''}`}
      style={{ width: w, height: h, opacity: props.dimmed ? 0.3 : 1 }}
      onClick={props.onClick}
    >
      <svg className="diagram__svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        {/* tag body — fills black on hover/selection */}
        <rect
          className="ink tag-bg"
          x={s / 2}
          y={s / 2}
          width={w - s}
          height={h - s}
          rx={4}
          strokeWidth={s}
        />
        {/* screen + connector tab */}
        <path className="ink tag-line" d={screenPath} fill="none" strokeWidth={s} />
        {/* screws */}
        <circle className="tag-screw" cx={m + screwR * 3} cy={h - m - strip / 2 + tabH / 2} r={screwR} />
        <circle
          className="tag-screw"
          cx={w - m - screwR * 3}
          cy={h - m - strip / 2 + tabH / 2}
          r={screwR}
        />
        {/* label dash */}
        <line
          className="ink tag-line"
          x1={w / 2 - dashW / 2}
          x2={w / 2 + dashW / 2}
          y1={h - m - strip / 2 + tabH / 2 + 1}
          y2={h - m - strip / 2 + tabH / 2 + 1}
          strokeWidth={s}
        />
      </svg>
      {props.overlay ? <div className="diagram__options">{props.overlay}</div> : null}
    </div>
  )
}
