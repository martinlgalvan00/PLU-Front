import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { CameraOff, ScanLine, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useQrCodeScan } from '../../hooks/useQrCodeScan.js'
import { extractPromotionCodeFromScan } from '../../services/promotionCodeService.js'
import '../../styles/components/code-scan.css'

/**
 * Botón que abre un panel de cámara chico al lado de cualquier campo de
 * código. Es el destino del QR que se reparte desde Precios: no hay página
 * pública de canje, así que ese QR codifica el código pelado y se escanea
 * acá, dentro del checkout que lo va a cobrar. Lo que lee la cámara pasa por
 * `extractPromotionCodeFromScan` antes de llegar a `onScan`, que además
 * tolera los QR viejos que traían una URL.
 */
export default function CodeScanButton({ onScan, disabled = false, className = '' }) {
  const { t } = useI18n()
  const panelId = useId()
  const [open, setOpen] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const closeButtonRef = useRef(null)
  const toggleButtonRef = useRef(null)

  const handleDecode = useCallback(
    (raw) => {
      const code = extractPromotionCodeFromScan(raw)
      if (!code) {
        setInvalid(true)
        return
      }
      setOpen(false)
      onScan(code)
    },
    [onScan],
  )

  const { videoRef, status, errorReason } = useQrCodeScan({ active: open, onDecode: handleDecode })

  useEffect(() => {
    if (open) {
      setInvalid(false)
      closeButtonRef.current?.focus()
    } else {
      toggleButtonRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        setOpen(false)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  const classes = ['code-scan', className].filter(Boolean).join(' ')

  return (
    <div className={classes}>
      <button
        type="button"
        ref={toggleButtonRef}
        className="code-scan__toggle"
        aria-expanded={open}
        aria-controls={panelId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        <ScanLine size={16} aria-hidden />
        {/* La etiqueta va en su propio span para que un host pueda dejar el
            botón sólo con el ícono sin perder el nombre accesible (lo hace
            `.code-band .code-scan__label`). */}
        <span className="code-scan__label">{t('codeScan.toggle')}</span>
      </button>

      {open ? (
        <div
          id={panelId}
          className="code-scan__panel"
          role="dialog"
          aria-modal="false"
          aria-label={t('codeScan.title')}
        >
          <div className="code-scan__panel-head">
            <span>{t('codeScan.title')}</span>
            <button
              type="button"
              ref={closeButtonRef}
              className="code-scan__close"
              onClick={() => setOpen(false)}
              aria-label={t('codeScan.close')}
            >
              <X size={16} aria-hidden />
            </button>
          </div>

          {errorReason ? (
            <div className="code-scan__error">
              <CameraOff size={20} aria-hidden />
              <p>{t(`codeScan.error.${errorReason}`)}</p>
            </div>
          ) : (
            <div className="code-scan__viewport">
              <video ref={videoRef} className="code-scan__video" muted playsInline aria-hidden />
              <div className="code-scan__reticle" aria-hidden>
                <span />
              </div>
            </div>
          )}

          <p className="code-scan__status" role="status" aria-live="polite">
            {errorReason ? '' : status === 'ready' ? t('codeScan.ready') : t('codeScan.starting')}
          </p>

          {invalid ? (
            <p className="code-scan__invalid" role="alert">
              {t('codeScan.invalid')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
