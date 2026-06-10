import { useState } from 'react'
import { motion } from 'framer-motion'
import { strings } from '@/strings'
import { useNav } from '@/navigation/nav-store'
import { useSavedConfigs } from '@/hooks/usePicoTool'
import { Checkbox, CircleArrowButton } from '@/components/buttons'

const PRIVACY_URL = 'https://github.com/ProjectPOCA/pico-tool/blob/main/PRIVACY.md'

export function AgreementPage(): React.JSX.Element {
  const [agreed, setAgreed] = useState(false)
  const navigate = useNav((s) => s.navigate)
  const { configs } = useSavedConfigs()
  const t = strings.agreement

  return (
    <div className="page">
      <div className="left-col">
        <motion.h1
          className="display"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.32, 0, 0.15, 1] }}
        >
          {t.titleTop}
          <br />
          <span className="accent">{t.titleAccent}</span>
        </motion.h1>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.18, duration: 0.4 }}
        >
          <p className="body-copy" style={{ marginTop: 40 }}>
            {t.intro}
          </p>
          <p className="body-copy" style={{ fontWeight: 700 }}>
            {t.agreePrompt}
          </p>

          <div style={{ marginTop: 28 }}>
            <Checkbox checked={agreed} onChange={setAgreed}>
              {t.checkboxPrefix}
              <span
                className="link"
                onClick={(e) => {
                  e.stopPropagation()
                  void window.picoTool.openExternal(PRIVACY_URL)
                }}
              >
                {t.privacyLink}
              </span>
              .
            </Checkbox>
          </div>
        </motion.div>

        <div className="left-col__bottom">
          <CircleArrowButton
            direction="right"
            disabled={!agreed}
            label="Continue"
            onClick={() => navigate(configs.length > 0 ? 'my-pico' : 'select-driver', 'x')}
          />
        </div>
      </div>

      <div className="stack" style={{ gap: 12, minHeight: 0 }}>
        <span className="meta">{t.acknowledgeHeader}</span>
        <div className="terms-box">
          {t.terms.map((section) => (
            <div key={section.heading}>
              <h3>{section.heading}</h3>
              <p>{section.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
