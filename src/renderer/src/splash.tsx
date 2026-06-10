import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { strings } from './strings'
import artwork from './assets/art/splash-artwork.png'
import pocaRed from './assets/art/poca-mark-red.svg'
import './styles/fonts.css'
import './styles/tokens.css'

/**
 * Splash card: a transparent frameless window containing the rounded white
 * card from the design — wordmark, edition, loading stage, copyright, POCA
 * mark, and the sage artwork panel on the right.
 */

function Splash(): React.JSX.Element {
  const [stage, setStage] = useState(0)
  useEffect(() => {
    const t = setInterval(
      () => setStage((s) => Math.min(s + 1, strings.splash.stages.length - 1)),
      550
    )
    return () => clearInterval(t)
  }, [])

  return (
    <div
      style={{
        width: 731,
        height: 439,
        margin: '42px auto',
        background: '#FFFFFF',
        borderRadius: 40,
        boxShadow: '0 10px 30px rgba(0,0,0,0.16)',
        display: 'grid',
        gridTemplateColumns: '1fr 275px',
        overflow: 'hidden',
        fontFamily: "'DM Sans', sans-serif",
        animation: 'splash-in 420ms cubic-bezier(0.32,0,0.15,1)'
      }}
    >
      <style>{`
        html, body { margin: 0; background: transparent; }
        @keyframes splash-in { from { opacity: 0; transform: scale(0.97); } to { opacity: 1; transform: none; } }
        @keyframes stage-in { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      <div style={{ padding: '64px 56px', display: 'flex', flexDirection: 'column' }}>
        <h1
          style={{
            margin: 0,
            fontSize: 48,
            fontWeight: 700,
            letterSpacing: 0,
            color: '#FF0000'
          }}
        >
          {strings.appName}
        </h1>
        <div style={{ fontSize: 20, fontWeight: 600, marginTop: 10 }}>{strings.edition}</div>
        <div
          key={stage}
          style={{ fontSize: 13, marginTop: 14, animation: 'stage-in 300ms ease-out' }}
        >
          {strings.splash.stages[stage]}
        </div>
        <div style={{ fontSize: 13, lineHeight: '17px', marginTop: 34, whiteSpace: 'pre-line' }}>
          {strings.splash.copyright}
        </div>
        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between'
          }}
        >
          <img src={pocaRed} width={44} height={46} alt="POCA" draggable={false} />
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              textAlign: 'right',
              whiteSpace: 'pre-line',
              paddingRight: 12
            }}
          >
            {strings.splash.artworkCredit}
          </span>
        </div>
      </div>
      <img
        src={artwork}
        alt=""
        draggable={false}
        style={{ width: 275, height: 439, objectFit: 'cover' }}
      />
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Splash />
  </React.StrictMode>
)
