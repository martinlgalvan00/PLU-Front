import { useEffect, useRef, useState } from 'react'
import { ArrowRight, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  consumeSignedInFlag,
  consumeSignedOutFlag,
  SIGNED_OUT_EVENT,
  SIGNED_IN_EVENT,
} from '../../lib/sessionNotice.js'
import { initials } from '../../lib/format.js'

const DISMISS_MS = 8000
const TICK_MS = 250
const MIN_RESUME_MS = 800

/**
 * Toast de cierre de sesión. El flag vive en sessionStorage para sobrevivir el
 * cambio de layout privado → público; el evento cubre el logout sin remount.
 *
 * Composición editorial compacta: eyebrow dorado, despedida tipográfica y una
 * sola acción de reingreso. El filete superior y el número de esquina marcan
 * la cuenta regresiva; DISMISS_MS viaja a CSS como custom property.
 */
export default function SessionNotice({ onNavigate }) {
  const { t } = useI18n()
  const [notice, setNotice] = useState(() => {
    // El login gana si por lo que sea quedaron los dos flags: significa que
    // el usuario volvió a entrar después del logout que dejó el otro.
    const inFlag = consumeSignedInFlag()
    if (inFlag) return { type: 'in', name: inFlag.name }
    const outFlag = consumeSignedOutFlag()
    return outFlag ? { type: 'out', name: outFlag.name } : false
  })
  const [leaving, setLeaving] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(() => Math.ceil(DISMISS_MS / 1000))
  const cardRef = useRef(null)
  const intervalRef = useRef(null)
  const leaveTimeoutRef = useRef(null)
  const dismissRef = useRef(null)

  useEffect(() => {
    function showOut(event) {
      if (leaveTimeoutRef.current) window.clearTimeout(leaveTimeoutRef.current)
      setLeaving(false)
      setSecondsLeft(Math.ceil(DISMISS_MS / 1000))
      setNotice({ type: 'out', name: String(event?.detail?.name ?? '').trim() })
    }

    function showIn(event) {
      if (leaveTimeoutRef.current) window.clearTimeout(leaveTimeoutRef.current)
      setLeaving(false)
      setSecondsLeft(Math.ceil(DISMISS_MS / 1000))
      setNotice({ type: 'in', name: String(event?.detail?.name ?? '').trim() })
    }

    window.addEventListener(SIGNED_OUT_EVENT, showOut)
    window.addEventListener(SIGNED_IN_EVENT, showIn)
    return () => {
      window.removeEventListener(SIGNED_OUT_EVENT, showOut)
      window.removeEventListener(SIGNED_IN_EVENT, showIn)
    }
  }, [])

  function dismiss() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    setLeaving(true)
    leaveTimeoutRef.current = window.setTimeout(() => setNotice(false), 200)
  }

  dismissRef.current = dismiss

  useEffect(() => {
    if (!notice) return undefined
    const node = cardRef.current
    if (!node) return undefined

    // Pausa al leer: hover o foco congela el cierre y el número; al salir se
    // reanuda con el tiempo restante, no desde cero.
    let remaining = DISMISS_MS
    let deadline = Date.now() + remaining
    let paused = false

    function syncSeconds() {
      setSecondsLeft(Math.max(Math.ceil(remaining / 1000), 0))
    }

    function tick() {
      remaining = deadline - Date.now()
      if (remaining <= 0) {
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
        setSecondsLeft(0)
        dismissRef.current?.()
        return
      }
      syncSeconds()
    }

    function start() {
      if (intervalRef.current) return
      deadline = Date.now() + remaining
      syncSeconds()
      intervalRef.current = setInterval(tick, TICK_MS)
    }

    function pause() {
      if (paused || !intervalRef.current) return
      paused = true
      clearInterval(intervalRef.current)
      intervalRef.current = null
      remaining = Math.max(deadline - Date.now(), 0)
      syncSeconds()
    }

    function resume() {
      if (!paused) return
      paused = false
      remaining = Math.max(remaining, MIN_RESUME_MS)
      start()
    }

    start()

    node.addEventListener('mouseenter', pause)
    node.addEventListener('focusin', pause)
    node.addEventListener('mouseleave', resume)
    node.addEventListener('focusout', resume)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      node.removeEventListener('mouseenter', pause)
      node.removeEventListener('focusin', pause)
      node.removeEventListener('mouseleave', resume)
      node.removeEventListener('focusout', resume)
    }
  }, [notice])

  useEffect(
    () => () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
      if (leaveTimeoutRef.current) window.clearTimeout(leaveTimeoutRef.current)
    },
    [],
  )

  if (!notice) return null

  const isLogin = notice.type === 'in'
  const title = notice.name
    ? t(isLogin ? 'nav.loginWelcomeNamed' : 'nav.logoutByeNamed', { name: notice.name })
    : t(isLogin ? 'nav.loginWelcome' : 'nav.logoutBye')

  return (
    <div
      className={`session-notice${leaving ? ' is-leaving' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div
        className="session-notice__card"
        ref={cardRef}
        style={{ '--session-notice-duration': `${DISMISS_MS}ms` }}
      >
        <span className="session-notice__timer" aria-hidden />
        <div className="session-notice__corner">
          <span className="session-notice__countdown" aria-hidden>
            <span key={secondsLeft} className="session-notice__countdown-digit">
              {secondsLeft}
            </span>
          </span>
          <button
            type="button"
            className="session-notice__close"
            aria-label={t('nav.logoutDismissAria')}
            onClick={dismiss}
          >
            <X size={14} strokeWidth={1.75} aria-hidden />
          </button>
        </div>
        <div className="session-notice__body">
          {notice.name ? (
            <span className="session-notice__avatar" aria-hidden>
              {initials(notice.name)}
            </span>
          ) : null}
          <div className="session-notice__copy">
            <p className="session-notice__eyebrow">
              {t(isLogin ? 'nav.loginEyebrow' : 'nav.logoutEyebrow')}
            </p>
            <p className="session-notice__title">{title}</p>
          </div>
        </div>
        <div className="session-notice__foot">
          <span className="session-notice__meta">
            {t(isLogin ? 'nav.loginHint' : 'nav.logoutHint')}
          </span>
          {onNavigate && !isLogin ? (
            <button
              type="button"
              className="session-notice__login"
              onClick={() => {
                dismiss()
                onNavigate('login')
              }}
            >
              {t('nav.loginAgain')}
              <ArrowRight size={13} strokeWidth={2} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
