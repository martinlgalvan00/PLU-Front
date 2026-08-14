import { useEffect, useState } from 'react'
import Pill from './Pill.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { consumeSignedOutFlag, SIGNED_OUT_EVENT } from '../../lib/sessionNotice.js'

const DISMISS_MS = 5000

/**
 * Aviso breve al cerrar sesión. El flag vive en sessionStorage para
 * sobrevivir el cambio de layout privado → público; el evento cubre el
 * logout sin remount (home, calendario, etc.).
 */
export default function SessionNotice() {
  const { t } = useI18n()
  const [visible, setVisible] = useState(() => consumeSignedOutFlag())

  useEffect(() => {
    function show() {
      consumeSignedOutFlag()
      setVisible(true)
    }

    window.addEventListener(SIGNED_OUT_EVENT, show)
    return () => window.removeEventListener(SIGNED_OUT_EVENT, show)
  }, [])

  useEffect(() => {
    if (!visible) return undefined
    const timer = setTimeout(() => setVisible(false), DISMISS_MS)
    return () => clearTimeout(timer)
  }, [visible])

  if (!visible) return null

  return (
    <div className="session-notice" role="status" aria-live="polite">
      <Pill tone="info">{t('nav.logoutDone')}</Pill>
    </div>
  )
}
