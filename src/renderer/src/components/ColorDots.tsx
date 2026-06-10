import type { InkColorName } from '@shared/types'

const FILL: Record<InkColorName, string> = {
  black: 'var(--black)',
  white: 'var(--white)',
  red: 'var(--red)',
  yellow: 'var(--yellow)'
}

/**
 * A panel's printable colors as a row of dots — the only way driver variants
 * are described to the user. `onDark` draws the outline ring in white so black
 * dots survive on inverted diagrams.
 */
export function ColorDots(props: {
  colors: InkColorName[]
  small?: boolean
  onDark?: boolean
}): React.JSX.Element {
  const ring = props.onDark ? 'var(--white)' : 'var(--black)'
  return (
    <span className={`color-dots${props.small ? ' color-dots--small' : ''}`}>
      {props.colors.map((c) => (
        <span
          key={c}
          className="color-dots__dot"
          style={{
            background: FILL[c],
            border:
              c === 'white' || (c === 'black' && props.onDark)
                ? `var(--stroke) solid ${ring}`
                : 'none'
          }}
        />
      ))}
    </span>
  )
}

export function ABToggle(props: {
  value: 'a' | 'b'
  onChange(v: 'a' | 'b'): void
}): React.JSX.Element {
  return (
    <span className="ab-toggle">
      {(['a', 'b'] as const).map((v) => (
        <button
          key={v}
          className={`ab-toggle__chip${props.value === v ? ' ab-toggle__chip--on' : ''}`}
          onClick={() => props.onChange(v)}
          aria-label={`option ${v}`}
        >
          {v}
        </button>
      ))}
    </span>
  )
}
