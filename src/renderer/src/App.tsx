import { useEffect, useState } from 'react'
import { strings } from '@/strings'
import { useNav, type Route } from '@/navigation/nav-store'
import { PageTransition } from '@/navigation/PageTransition'
import { Chrome } from '@/components/Brand'
import { DevicePickerModal } from '@/components/DevicePickerModal'
import { WindowButtons } from '@/components/WindowButtons'
import { useUpdateStatus } from '@/hooks/usePicoTool'
import { AgreementPage } from '@/pages/AgreementPage'
import { MyPicoPage } from '@/pages/MyPicoPage'
import { SelectDriverPage } from '@/pages/SelectDriverPage'
import { FlashModePage } from '@/pages/FlashModePage'
import { BadgeEditorPage } from '@/pages/BadgeEditorPage'
import { FilePickPage } from '@/pages/FilePickPage'
import { FlashProgressPage } from '@/pages/FlashProgressPage'
import { AllDonePage } from '@/pages/AllDonePage'

const PAGES: Record<Route, () => React.JSX.Element> = {
  agreement: AgreementPage,
  'my-pico': MyPicoPage,
  'select-driver': SelectDriverPage,
  'flash-mode': FlashModePage,
  'badge-editor': BadgeEditorPage,
  'file-pick': FilePickPage,
  'flash-progress': FlashProgressPage,
  'all-done': AllDonePage
}

export function App(): React.JSX.Element {
  const route = useNav((s) => s.route)
  const transition = useNav((s) => s.transition)
  const updates = useUpdateStatus()
  const [platform, setPlatform] = useState('darwin')
  useEffect(() => {
    void window.picoTool.appInfo().then((info) => setPlatform(info.platform))
  }, [])
  const Page = PAGES[route]

  // Frameless window; on macOS the shell draws the rounded card on a
  // transparent window, elsewhere the OS shapes the opaque window itself.
  const shellClass = ['app-shell', platform === 'darwin' && 'app-shell--mac']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={shellClass}>
      <Chrome />
      {platform !== 'darwin' ? <WindowButtons /> : null}
      <PageTransition routeKey={route} transition={transition}>
        <Page />
      </PageTransition>
      <DevicePickerModal />
      {updates.state === 'available' && updates.version ? (
        <div className="update-banner">
          {strings.updates.available(updates.version)}{' '}
          <span
            className="link"
            onClick={() =>
              void window.picoTool.openExternal(
                updates.manualUrl ?? 'https://github.com/ProjectPOCA/pico-tool/releases'
              )
            }
          >
            {strings.updates.download}
          </span>
        </div>
      ) : null}
    </div>
  )
}
