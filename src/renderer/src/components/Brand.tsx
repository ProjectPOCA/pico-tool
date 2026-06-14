import pocaBlack from '@/assets/art/poca-mark-black.svg'
import pocaRed from '@/assets/art/poca-mark-red.svg'
import { strings } from '@/strings'
import { useNav } from '@/navigation/nav-store'

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

/**
 * Top chrome: POCA mark left, lowercase wordmark centered. The mark is a
 * home button back to My Pico — inert on the agreement page (terms must be
 * accepted first) and on My Pico itself.
 */
export function Chrome(): React.JSX.Element {
  const route = useNav((s) => s.route)
  const navigate = useNav((s) => s.navigate)
  const home = route !== 'agreement' && route !== 'my-pico'
  return (
    <header className="chrome">
      <button
        className="chrome__brand"
        disabled={!home}
        aria-label="Back to My Pico"
        title={home ? 'Back to My Pico' : undefined}
        onClick={() => navigate('my-pico', 'x')}
      >
        <PocaMark />
      </button>
      <span className="chrome__title">{strings.appName}</span>
    </header>
  )
}
