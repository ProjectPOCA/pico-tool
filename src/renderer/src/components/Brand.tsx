import pocaBlack from '@/assets/art/poca-mark-black.svg'
import pocaRed from '@/assets/art/poca-mark-red.svg'
import { strings } from '@/strings'

/** POCA mark (exported from the design file). */
export function PocaMark(props: { size?: number; red?: boolean }): React.JSX.Element {
  const size = props.size ?? 38
  return (
    <img
      src={props.red ? pocaRed : pocaBlack}
      width={size}
      height={size * 1.04}
      alt="POCA"
      draggable={false}
    />
  )
}

/** Top chrome: POCA mark left, lowercase wordmark centered. */
export function Chrome(): React.JSX.Element {
  return (
    <header className="chrome">
      <div className="chrome__brand">
        <PocaMark />
      </div>
      <span className="chrome__title">{strings.appName}</span>
    </header>
  )
}
