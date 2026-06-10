import { useEffect, useRef, useState } from 'react'
import { strings } from '@/strings'
import { useNav } from '@/navigation/nav-store'
import { beginFlash } from '@/navigation/flash-actions'
import { CircleArrowButton, PillButton } from '@/components/buttons'
import {
  generatePlanes,
  paintPreview,
  rasterizeImage,
  type FitMode,
  type GeneratedPlanes
} from '@/imaging/convert'

/** Shared picker page for MicroPython Activity (.py) and Raster Image modes. */
export function FilePickPage(): React.JSX.Element {
  const navigate = useNav((s) => s.navigate)
  const panel = useNav((s) => s.panel)
  const mode = useNav((s) => s.mode)
  const setPlanes = useNav((s) => s.setPlanes)
  const setScript = useNav((s) => s.setScript)

  const [fileName, setFileName] = useState<string | null>(null)
  const [scriptText, setScriptText] = useState<string | null>(null)
  const [imageBytes, setImageBytes] = useState<Uint8Array | null>(null)
  const [dither, setDither] = useState(1)
  const [fit, setFit] = useState<FitMode>('cover')
  const [generated, setGenerated] = useState<GeneratedPlanes | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const t = strings.filePick

  const isRaster = mode === 'raster'

  useEffect(() => {
    let stale = false
    const run = async (): Promise<void> => {
      if (!panel || !imageBytes || !canvasRef.current) return
      const image = await rasterizeImage(imageBytes, panel, fit)
      if (stale) return
      const planes = generatePlanes(image, panel, dither)
      setGenerated(planes)
      if (canvasRef.current) paintPreview(canvasRef.current, planes)
    }
    void run()
    return () => {
      stale = true
    }
  }, [imageBytes, dither, fit, panel])

  const pick = async (): Promise<void> => {
    const picked = await window.picoTool.pickFile(isRaster ? 'image' : 'python')
    if (!picked) return
    setFileName(picked.name)
    if (isRaster && picked.bytes) setImageBytes(picked.bytes)
    if (!isRaster && picked.text != null) setScriptText(picked.text)
  }

  const go = async (): Promise<void> => {
    if (!panel) return
    if (isRaster) {
      if (!generated) return
      setPlanes(generated)
      await beginFlash({
        panelId: panel.panelId,
        mode: 'raster',
        inputs: {
          planes: {
            black: generated.black,
            red: generated.red,
            yellow: generated.yellow,
            quad: generated.quad
          }
        }
      })
    } else {
      if (!scriptText || !fileName) return
      setScript(fileName, scriptText)
      await beginFlash({
        panelId: panel.panelId,
        mode: 'activity',
        inputs: { scriptName: fileName, scriptSource: scriptText }
      })
    }
  }

  if (!panel) return <div className="page" />
  const [pw, ph] = panel.resolution
  const previewScale = Math.min(440 / pw, 360 / ph)
  const ready = isRaster ? generated != null : scriptText != null

  return (
    <div className="page">
      <div className="left-col">
        <h1 className="display" style={{ whiteSpace: 'pre-line' }}>
          {isRaster ? t.rasterTitle : t.activityTitle}
        </h1>
        <p className="body-copy" style={{ marginTop: 40 }}>
          {isRaster ? t.rasterHint : t.activityHint}
        </p>
        <div className="stack" style={{ gap: 18, marginTop: 16 }}>
          <div>
            <PillButton onClick={() => void pick()}>{t.choose}</PillButton>
          </div>
          {fileName ? (
            <span className="meta" style={{ color: 'var(--red)' }}>
              {fileName}
            </span>
          ) : null}
          {isRaster && imageBytes ? (
            <>
              <label className="slider-row">
                <span className="slider-row__label">{t.dither}</span>
                <input
                  type="range"
                  className="slider"
                  min={0}
                  max={1}
                  step={0.05}
                  value={dither}
                  onChange={(e) => setDither(Number(e.target.value))}
                  aria-label={t.dither}
                />
              </label>
              <div className="row" style={{ gap: 10 }}>
                <PillButton solid={fit === 'cover'} onClick={() => setFit('cover')}>
                  {t.fitCover}
                </PillButton>
                <PillButton solid={fit === 'contain'} onClick={() => setFit('contain')}>
                  {t.fitContain}
                </PillButton>
              </div>
            </>
          ) : null}
        </div>
        <div className="left-col__bottom">
          <CircleArrowButton
            direction="left"
            label="Back"
            onClick={() => navigate('flash-mode', 'x')}
          />
          <CircleArrowButton
            direction="right"
            label="Flash"
            disabled={!ready}
            onClick={() => void go()}
          />
        </div>
      </div>

      <div className="stack" style={{ alignItems: 'center', justifyContent: 'center' }}>
        {isRaster ? (
          <canvas
            ref={canvasRef}
            style={{
              width: pw * previewScale,
              height: ph * previewScale,
              border: 'var(--stroke) solid var(--black)',
              borderRadius: 8,
              imageRendering: 'pixelated',
              opacity: generated ? 1 : 0.15
            }}
          />
        ) : (
          <pre
            style={{
              width: '100%',
              maxWidth: 480,
              maxHeight: 420,
              overflow: 'auto',
              border: 'var(--stroke) solid var(--black)',
              borderRadius: 12,
              padding: 18,
              fontSize: 12,
              lineHeight: 1.5,
              opacity: scriptText ? 1 : 0.3,
              userSelect: 'text'
            }}
          >
            {scriptText ?? '# your script preview'}
          </pre>
        )}
      </div>
    </div>
  )
}
