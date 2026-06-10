import { strings } from '@/strings'

/**
 * Minimize/close controls for frameless windows on platforms without native
 * buttons (Windows, Linux). macOS keeps its inset traffic lights instead.
 */
export function WindowButtons(): React.JSX.Element {
  return (
    <div className="window-buttons">
      <button
        className="window-btn"
        aria-label={strings.window.minimize}
        title={strings.window.minimize}
        onClick={() => void window.picoTool.windowControl('minimize')}
      >
        <svg width="11" height="11" viewBox="0 0 11 11">
          <line x1="1" y1="5.5" x2="10" y2="5.5" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
      <button
        className="window-btn"
        aria-label={strings.window.close}
        title={strings.window.close}
        onClick={() => void window.picoTool.windowControl('close')}
      >
        <svg width="11" height="11" viewBox="0 0 11 11">
          <line x1="1.5" y1="1.5" x2="9.5" y2="9.5" stroke="currentColor" strokeWidth="2" />
          <line x1="9.5" y1="1.5" x2="1.5" y2="9.5" stroke="currentColor" strokeWidth="2" />
        </svg>
      </button>
    </div>
  )
}
