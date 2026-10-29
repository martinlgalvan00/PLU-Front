import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { RotateCw, X } from 'lucide-react'
import { useI18n } from '../../../i18n/I18nProvider.jsx'
import useModalDialog from '../../../hooks/useModalDialog.js'
import '../../../styles/components/credential-3d.css'

function cssVar(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

/**
 * La credencial en 3D, a pantalla completa. Se carga aparte (Three.js viaja en
 * su propio chunk y solo se pide al abrir). Arrastrar o usar las flechas la
 * gira; "Dar vuelta" muestra el dorso con el QR, que se puede escanear desde
 * la pantalla. Escape o "Cerrar" vuelven al perfil con el foco donde estaba.
 */
export default function Credential3DViewer({ card, onClose }) {
  const { t } = useI18n()
  const { panelRef, initialFocusRef, onKeyDown } = useModalDialog({ onClose })
  const stageRef = useRef(null)
  const sceneRef = useRef(null)
  const dragRef = useRef(null)
  const [status, setStatus] = useState('loading')
  const [side, setSide] = useState('front')

  useEffect(() => {
    let cancelled = false
    import('./credentialScene.js')
      .then(({ createCredentialScene }) =>
        createCredentialScene(stageRef.current, card, {
          palette: { gold: cssVar('--color-brand-gold', '#f2b705') },
          family: cssVar('--font-display', 'system-ui, sans-serif'),
          onSide: setSide,
        }),
      )
      .then((scene) => {
        if (cancelled) {
          scene.dispose()
          return
        }
        sceneRef.current = scene
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [card])

  function onPointerDown(event) {
    dragRef.current = { x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function onPointerMove(event) {
    if (!dragRef.current) return
    const dx = event.clientX - dragRef.current.x
    const dy = event.clientY - dragRef.current.y
    dragRef.current = { x: event.clientX, y: event.clientY }
    sceneRef.current?.drag(dx * 0.012, dy * 0.006)
  }

  function onPointerUp() {
    dragRef.current = null
  }

  function onStageKeyDown(event) {
    const step = { ArrowLeft: -0.12, ArrowRight: 0.12 }[event.key]
    if (step != null) {
      event.preventDefault()
      sceneRef.current?.nudge(step)
    }
  }

  return createPortal(
    <div className="credential-3d" role="presentation" onClick={onClose}>
      <div
        ref={panelRef}
        aria-labelledby="credential-3d-title"
        aria-modal="true"
        className="credential-3d__panel"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <header className="credential-3d__head">
          <h2 id="credential-3d-title">{t('account.qr.view3dTitle')}</h2>
          <button
            ref={initialFocusRef}
            aria-label={t('account.qr.view3dClose')}
            className="credential-3d__close"
            type="button"
            onClick={onClose}
          >
            <X aria-hidden size={18} />
          </button>
        </header>

        <div
          ref={stageRef}
          aria-label={t('account.qr.view3dStage', {
            side: side === 'front' ? t('account.qr.view3dFront') : t('account.qr.view3dBack'),
          })}
          aria-roledescription={t('account.qr.view3dRole')}
          className="credential-3d__stage"
          data-status={status}
          role="img"
          tabIndex={0}
          onKeyDown={onStageKeyDown}
          onPointerCancel={onPointerUp}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {status === 'loading' ? (
            <p className="credential-3d__message" role="status">
              {t('account.qr.view3dLoading')}
            </p>
          ) : null}
          {status === 'error' ? (
            <p className="credential-3d__message" role="alert">
              {t('account.qr.view3dError')}
            </p>
          ) : null}
        </div>

        <footer className="credential-3d__foot">
          <p>{t('account.qr.view3dHint')}</p>
          <button
            className="credential-3d__flip"
            disabled={status !== 'ready'}
            type="button"
            onClick={() => sceneRef.current?.flip()}
          >
            <RotateCw aria-hidden size={15} />
            {t('account.qr.view3dFlip')}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
