import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { CameraOff, Smartphone, Volume2, VolumeX } from 'lucide-react'
import SegmentedSwitch from '../ui/SegmentedSwitch.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

// Frame de trabajo para el decoder de respaldo (jsQR) -- más chico que la
// resolución real de la cámara para no cargar la CPU en celulares de gama
// media, suficiente para leer un QR a distancia de escaneo normal.
const FALLBACK_SCAN_WIDTH = 480

const SCAN_COOLDOWN_MS = 2200
const FEEDBACK_STORAGE_KEY = 'plu-checkin-feedback'

function readFeedbackPrefs() {
  if (typeof window === 'undefined') {
    return { soundEnabled: true, vibrateEnabled: true }
  }

  try {
    const stored = window.sessionStorage.getItem(FEEDBACK_STORAGE_KEY)
    if (!stored) return { soundEnabled: true, vibrateEnabled: true }
    return JSON.parse(stored)
  } catch {
    return { soundEnabled: true, vibrateEnabled: true }
  }
}

export default function AdminQrScanner({
  busy = false,
  disabled = false,
  feedbackPrefs,
  onFeedbackPrefsChange,
  onScan,
}) {
  const { t } = useI18n()
  const videoRef = useRef(null)
  const cooldownRef = useRef(false)
  const [mode, setMode] = useState('camera')
  const [manualValue, setManualValue] = useState('')
  const [cameraError, setCameraError] = useState(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [localFeedbackPrefs, setLocalFeedbackPrefs] = useState(readFeedbackPrefs)

  const activeFeedbackPrefs = feedbackPrefs ?? localFeedbackPrefs

  const modeOptions = useMemo(
    () => [
      ['camera', t('admin.checkin.scanner.modeCamera'), t('admin.checkin.scanner.modeCameraShort')],
      ['manual', t('admin.checkin.scanner.modeManual'), t('admin.checkin.scanner.modeManualShort')],
    ],
    [t],
  )

  function updateFeedbackPrefs(next) {
    if (onFeedbackPrefsChange) {
      onFeedbackPrefsChange(next)
      return
    }

    setLocalFeedbackPrefs(next)
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(next))
    }
  }

  function toggleSound() {
    updateFeedbackPrefs({ ...activeFeedbackPrefs, soundEnabled: !activeFeedbackPrefs.soundEnabled })
  }

  function toggleVibrate() {
    updateFeedbackPrefs({
      ...activeFeedbackPrefs,
      vibrateEnabled: !activeFeedbackPrefs.vibrateEnabled,
    })
  }

  const emitScan = useCallback(
    (raw) => {
      const value = raw?.trim()
      if (!value || disabled || busy || cooldownRef.current) return

      cooldownRef.current = true
      onScan?.(value)
      window.setTimeout(() => {
        cooldownRef.current = false
      }, SCAN_COOLDOWN_MS)
    },
    [busy, disabled, onScan],
  )

  useEffect(() => {
    if (cameraError === 'unsupported') {
      setMode('manual')
    }
  }, [cameraError])

  useEffect(() => {
    if (mode !== 'camera' || disabled) {
      setCameraReady(false)
      return undefined
    }

    let stream
    let raf
    let detector
    let cancelled = false
    // Canvas fuera de pantalla para el decoder de respaldo (jsQR) -- no
    // necesita estar en el DOM, solo sirve para extraer ImageData del frame.
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })

    function scanFrameWithFallback(video) {
      const scale = FALLBACK_SCAN_WIDTH / video.videoWidth
      canvas.width = FALLBACK_SCAN_WIDTH
      canvas.height = Math.round(video.videoHeight * scale)
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const frame = ctx.getImageData(0, 0, canvas.width, canvas.height)
      return jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })
    }

    async function scanLoop() {
      if (cancelled || !videoRef.current || videoRef.current.readyState < 2) {
        raf = requestAnimationFrame(scanLoop)
        return
      }

      try {
        if (detector) {
          const codes = await detector.detect(videoRef.current)
          if (codes.length > 0) emitScan(codes[0].rawValue)
        } else {
          const result = scanFrameWithFallback(videoRef.current)
          if (result?.data) emitScan(result.data)
        }
      } catch {
        // Frame inválido — seguimos en el próximo tick.
      }

      raf = requestAnimationFrame(scanLoop)
    }

    async function startCamera() {
      setCameraError(null)
      setCameraReady(false)

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setCameraError('unsupported')
        return
      }

      // BarcodeDetector nativo cuando está disponible (más liviano, usa
      // aceleración del navegador); si no (ej. Safari/iOS), jsQR en JS puro
      // cubre el resto de los navegadores en vez de forzar el modo manual.
      if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        detector = new window.BarcodeDetector({ formats: ['qr_code'] })
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) return

        const video = videoRef.current
        if (!video) return

        video.srcObject = stream
        await video.play()
        setCameraReady(true)
        scanLoop()
      } catch {
        setCameraError('permission')
      }
    }

    startCamera()

    const currentVideo = videoRef.current
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((track) => track.stop())
      if (currentVideo) {
        currentVideo.srcObject = null
      }
    }
  }, [disabled, emitScan, mode])

  function handleManualSubmit(event) {
    event.preventDefault()
    emitScan(manualValue)
    setManualValue('')
  }

  const cameraBlocked = mode === 'camera' && cameraError === 'permission'
  const showUnsupportedNote = cameraError === 'unsupported' && mode === 'manual'

  return (
    <section className="admin-checkin-scanner" aria-label={t('admin.checkin.scanner.title')}>
      <div className="admin-checkin-scanner__top">
        <div className="admin-checkin-scanner__intro">
          <h2 className="admin-checkin-scanner__title">{t('admin.checkin.scanner.title')}</h2>
          <p className="admin-checkin-scanner__hint">{t('admin.checkin.scanner.hint')}</p>
        </div>

        <div className="admin-checkin-scanner__toolbar">
          <div className="admin-checkin-scanner__mode-switch">
            <SegmentedSwitch
              active={mode}
              ariaLabel={t('admin.checkin.scanner.modeLabel')}
              className="segmented-switch--checkin"
              onChange={setMode}
              options={modeOptions}
            />
          </div>

          <div
            className="admin-checkin-scanner__feedback"
            aria-label={t('admin.checkin.scanner.feedbackLabel')}
          >
            <button
              type="button"
              className={`admin-checkin-scanner__feedback-btn${activeFeedbackPrefs.soundEnabled ? ' is-active' : ''}`}
              aria-pressed={activeFeedbackPrefs.soundEnabled}
              aria-label={t('admin.checkin.scanner.soundToggle')}
              title={t('admin.checkin.scanner.soundToggle')}
              onClick={toggleSound}
            >
              {activeFeedbackPrefs.soundEnabled ? (
                <Volume2 size={14} aria-hidden />
              ) : (
                <VolumeX size={14} aria-hidden />
              )}
            </button>
            <button
              type="button"
              className={`admin-checkin-scanner__feedback-btn${activeFeedbackPrefs.vibrateEnabled ? ' is-active' : ''}`}
              aria-pressed={activeFeedbackPrefs.vibrateEnabled}
              aria-label={t('admin.checkin.scanner.vibrateToggle')}
              title={t('admin.checkin.scanner.vibrateToggle')}
              onClick={toggleVibrate}
            >
              <Smartphone size={14} aria-hidden />
            </button>
          </div>
        </div>
      </div>

      {showUnsupportedNote ? (
        <p className="admin-checkin-scanner__note" role="status">
          {t('admin.checkin.scanner.unsupported')}
        </p>
      ) : null}

      {mode === 'camera' ? (
        <div className="admin-checkin-scanner__viewport-wrap">
          <div
            className={`admin-checkin-scanner__viewport${cameraBlocked ? ' admin-checkin-scanner__viewport--error' : ''}`}
          >
            {!cameraBlocked && (
              <video
                ref={videoRef}
                className="admin-checkin-scanner__video"
                muted
                playsInline
                aria-hidden
              />
            )}

            {!cameraBlocked && (
              <div className="admin-checkin-scanner__reticle" aria-hidden>
                <span />
              </div>
            )}

            {cameraBlocked && (
              <div className="admin-checkin-scanner__camera-fallback">
                <CameraOff size={22} aria-hidden />
                <p>{t('admin.checkin.scanner.permission')}</p>
                <button
                  type="button"
                  className="admin-checkin-scanner__fallback-link"
                  onClick={() => setMode('manual')}
                >
                  {t('admin.checkin.scanner.useManual')}
                </button>
              </div>
            )}

            {busy && (
              <div className="admin-checkin-scanner__busy" aria-live="polite">
                <span className="plu-spinner plu-spinner--lg" aria-hidden="true" />
                <span>{t('admin.checkin.scanner.verifying')}</span>
              </div>
            )}
          </div>

          {!cameraBlocked && (
            <p className="admin-checkin-scanner__status" aria-live="polite">
              {cameraReady ? t('admin.checkin.scanner.ready') : t('admin.checkin.scanner.starting')}
            </p>
          )}
        </div>
      ) : (
        <form className="admin-checkin-scanner__manual" onSubmit={handleManualSubmit}>
          <label className="admin-checkin-scanner__manual-label" htmlFor="admin-checkin-manual">
            {t('admin.checkin.scanner.manualLabel')}
          </label>
          <div className="admin-checkin-scanner__manual-row">
            <input
              id="admin-checkin-manual"
              className="admin-checkin-scanner__manual-input"
              disabled={disabled || busy}
              placeholder={t('admin.checkin.scanner.manualPlaceholder')}
              value={manualValue}
              onChange={(event) => setManualValue(event.target.value)}
            />
            <button
              type="submit"
              className="btn btn--primary btn--sm"
              disabled={disabled || busy || !manualValue.trim()}
            >
              {t('admin.checkin.scanner.verify')}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
