/** Circular icon buttons (2px ring + glyph) and pill buttons from the design system. */

type Direction = 'right' | 'down' | 'left' | 'up'

const ROTATION: Record<Direction, number> = { right: 0, down: 90, left: 180, up: -90 }

export function CircleArrowButton(props: {
  direction: Direction
  onClick(): void
  disabled?: boolean
  label: string
}): React.JSX.Element {
  return (
    <button
      className="circle-btn"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      title={props.label}
    >
      <svg
        width="30"
        height="24"
        viewBox="0 0 30 24"
        style={{ transform: `rotate(${ROTATION[props.direction]}deg)` }}
      >
        <g stroke="#000" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 12h25" />
          <path d="M17 2.5 27 12 17 21.5" />
        </g>
      </svg>
    </button>
  )
}

export function CircleIconButton(props: {
  icon: 'save' | 'restart' | 'plus' | 'copy'
  onClick(): void
  disabled?: boolean
  label: string
}): React.JSX.Element {
  return (
    <button
      className="circle-btn"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      title={props.label}
    >
      {props.icon === 'copy' ? (
        <svg width="30" height="30" viewBox="0 0 30 30">
          <g stroke="#000" strokeWidth="2.4" fill="none" strokeLinejoin="round">
            <rect x="10" y="10" width="16" height="16" rx="2" />
            <path d="M6 20a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2" />
          </g>
        </svg>
      ) : props.icon === 'plus' ? (
        <svg width="26" height="26" viewBox="0 0 26 26">
          <g stroke="#000" strokeWidth="3.4" fill="none" strokeLinecap="round">
            <path d="M13 2v22" />
            <path d="M2 13h22" />
          </g>
        </svg>
      ) : props.icon === 'save' ? (
        <svg width="30" height="30" viewBox="0 0 30 30">
          <g stroke="#000" strokeWidth="2.4" fill="none" strokeLinejoin="round">
            <path d="M4 4h17l5 5v17H4z" />
            <path d="M9 4v7h11V4" />
            <rect x="9" y="17" width="12" height="9" />
            <circle cx="15" cy="21.5" r="1.6" fill="#000" stroke="none" />
          </g>
        </svg>
      ) : (
        <svg width="30" height="30" viewBox="0 0 30 30">
          <g stroke="#000" strokeWidth="2.6" fill="none" strokeLinecap="round">
            <path d="M24.5 8.5A11 11 0 1 0 26 15" />
            <path d="M25 2v7h-7" strokeLinejoin="round" />
          </g>
        </svg>
      )}
    </button>
  )
}

export function PillButton(props: {
  children: React.ReactNode
  onClick(): void
  solid?: boolean
  disabled?: boolean
}): React.JSX.Element {
  return (
    <button
      className={`pill-btn${props.solid ? ' pill-btn--solid' : ''}`}
      onClick={props.onClick}
      disabled={props.disabled}
    >
      {props.children}
    </button>
  )
}

export function Checkbox(props: {
  checked: boolean
  onChange(next: boolean): void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div
      className={`checkbox${props.checked ? ' checkbox--checked' : ''}`}
      onClick={() => props.onChange(!props.checked)}
      role="checkbox"
      aria-checked={props.checked}
    >
      <span className="checkbox__box" />
      <span className="checkbox__label">{props.children}</span>
    </div>
  )
}
