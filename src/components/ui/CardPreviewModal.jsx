import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Download, Share2, X } from 'lucide-react'
import EventShareCard from './EventShareCard.jsx'
import SegmentedSwitch from './SegmentedSwitch.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  buildCardFilename,
  downloadCard,
  generateEventCard,
  preloadEventCardCapture,
  shareCard,
} from '../../services/eventCardService.js'

function buildShareText(cardData, t) {
  const eventTitle = cardData.eventTitle ?? t('cardModal.defaultEventTitle')
  if (cardData.variant === 'membership') return t('cardModal.shareTextMembership')
  if (cardData.variant === 'ticket') return t('cardModal.shareTextTicket', { event: eventTitle })
  return t('cardModal.shareTextDefault', { event: eventTitle })
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Espera QR asíncrono + decodificación de <img> antes de rasterizar.
 * Evita PNGs sin QR cuando el árbol de captura se monta recién al tap.
 */
async function waitForCaptureReady(root, { timeoutMs = 8000 } = {}) {
  const deadline = performance.now() + timeoutMs

  while (performance.now() < deadline) {
    const card = root.querySelector('.share-card')
    if (card?.getAttribute('data-capture-ready') === '1') {
      const images = [...card.querySelectorAll('img')]
      await Promise.all(
        images.map((img) => {
          if (img.complete) return Promise.resolve()
          return new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true })
            img.addEventListener('error', resolve, { once: true })
          })
        }),
      )
      return
    }
    await sleep(32)
  }
}

/**
 * CardPreviewModal — PLU ARG
 *
 * Modal que muestra un preview de la card de inscripción y permite
 * descargarla como PNG o compartirla via Web Share API.
 *
 * Props:
 *   open           boolean         — visibilidad
 *   onClose        () => void
 *   cardData       {
 *     athleteName, athleteCode?, eventTitle, eventDate?,
 *     eventVenue?, eventLocation?, category?, division?,
 *     eventSlug?, attendeeDocument?, dayPassLabel?, variant?
 *   }
 *   initialFormat  'square' | 'story' — formato preseleccionado al abrir
 *                  (default 'square'). Desde el perfil en mobile se abre en
 *                  'story' porque es el formato que se comparte a Instagram.
 */
export default function CardPreviewModal({
  open,
  onClose,
  cardData = {},
  initialFormat = 'square',
}) {
  const { t } = useI18n()
  const formatOptions = [
    ['square', t('cardModal.formatSquare'), t('cardModal.formatSquareShort')],
    ['story', t('cardModal.formatStory'), t('cardModal.formatStoryShort')],
  ]
  const captureRef = useRef(null)
  const blobRef = useRef(null)
  const captureWaitersRef = useRef([])
  const [status, setStatus] = useState('idle') // 'idle' | 'generating' | 'done' | 'error'
  const [format, setFormat] = useState(initialFormat) // 'square' | 'story'
  /** Árbol 1080×(1080|1920) solo al generar — no al abrir el modal. */
  const [captureMounted, setCaptureMounted] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  function clearGeneratedBlob() {
    blobRef.current = null
  }

  function resolveCaptureWaiters(node) {
    const waiters = captureWaitersRef.current
    captureWaitersRef.current = []
    waiters.forEach((resolve) => resolve(node))
  }

  function requestCaptureNode() {
    if (captureRef.current) return Promise.resolve(captureRef.current)
    return new Promise((resolve) => {
      captureWaitersRef.current.push(resolve)
      setCaptureMounted(true)
    })
  }

  // Resetear estado al abrir + precargar html2canvas para el primer tap.
  useEffect(() => {
    if (open) {
      setStatus('idle')
      clearGeneratedBlob()
      setCaptureMounted(false)
      setFormat(initialFormat)
      preloadEventCardCapture().catch(() => {})
    }
  }, [open, initialFormat])

  // El blob generado corresponde a un solo formato — si el usuario cambia de
  // formato hay que regenerarlo antes de descargar/compartir de nuevo.
  useEffect(() => {
    setStatus('idle')
    clearGeneratedBlob()
  }, [format])

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Cuando el nodo de captura monta, liberar a quien espera el ref.
  useLayoutEffect(() => {
    if (!captureMounted || !captureRef.current) return
    resolveCaptureWaiters(captureRef.current)
  }, [captureMounted, format])

  if (!open) return null

  const isStory = format === 'story'
  const filename = buildCardFilename(
    cardData.athleteName,
    cardData.eventSlug ?? 'evento',
    isStory ? 'historia' : '',
  )

  async function ensureCardBlob() {
    if (blobRef.current) return blobRef.current

    const node = await requestCaptureNode()
    await waitForCaptureReady(node)

    try {
      const generated = await generateEventCard(node)
      blobRef.current = generated
      return generated
    } finally {
      // Liberar el DOM full-size de la memoria (mobile) tras rasterizar.
      setCaptureMounted(false)
    }
  }

  async function handleDownload() {
    setStatus('generating')
    try {
      const generated = await ensureCardBlob()
      downloadCard(generated, filename)
      setStatus('done')
    } catch (err) {
      console.error('CardPreviewModal:', err)
      setStatus('error')
    }
  }

  async function handleShare() {
    setStatus('generating')
    try {
      const generated = await ensureCardBlob()
      await shareCard(generated, buildShareText(cardData, t), filename)
      setStatus('done')
    } catch (err) {
      console.error('CardPreviewModal share:', err)
      setStatus('error')
    }
  }

  const isGenerating = status === 'generating'

  return (
    <>
      {/* ── Elemento oculto a tamaño real para captura (lazy) ──
          html2canvas no rasteriza bien texto/imágenes dentro de nodos
          "position: fixed" ubicados fuera del viewport (offset negativo) —
          por eso acá el nodo capturado queda en flujo normal (sin fixed/offset
          propio) y es el CONTENEDOR el que lo recorta a 0×0 visualmente.
          Solo se monta al descargar/compartir para no pesar el open en mobile. */}
      {captureMounted ? (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: 0,
            height: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
          }}
        >
          <div ref={captureRef} style={{ width: '1080px', height: isStory ? '1920px' : '1080px' }}>
            <EventShareCard {...cardData} preview={false} format={format} />
          </div>
        </div>
      ) : null}

      {/* ── Overlay del modal ── */}
      <div
        className="card-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={t('cardModal.modalAria')}
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose()
        }}
      >
        <div className="card-modal">
          {/* Header */}
          <div className="card-modal__header">
            <span className="card-modal__title">{t('cardModal.title')}</span>
            <button
              type="button"
              className="card-modal__close"
              onClick={onClose}
              aria-label={t('cardModal.close')}
            >
              <X size={16} />
            </button>
          </div>

          {/* Formato: cuadrada (post) o historia */}
          <div className="card-modal__format-switch">
            <SegmentedSwitch
              active={format}
              ariaLabel={t('cardModal.formatSwitchAria')}
              onChange={setFormat}
              options={formatOptions}
            />
          </div>

          {/* Preview escalado */}
          <div className="card-modal__preview-wrap">
            <div
              className={`card-modal__preview-inner ${isStory ? 'card-modal__preview-inner--story' : ''}`}
            >
              <EventShareCard {...cardData} preview={true} format={format} />
            </div>
          </div>

          {/* Hint */}
          <div className="card-modal__hint">
            <span className="card-modal__hint-dot" aria-hidden />
            {isStory ? t('cardModal.hintStory') : t('cardModal.hintSquare')}
          </div>

          {/* Acciones */}
          {isGenerating ? (
            <div className="card-modal__generating">
              <div className="plu-spinner plu-spinner--lg card-modal__spinner" aria-hidden />
              {t('cardModal.generating')}
            </div>
          ) : (
            <div className="card-modal__actions">
              <button type="button" className="btn" onClick={handleDownload} id="card-download-btn">
                <Download size={15} aria-hidden />
                {t('cardModal.download')}
              </button>

              {canShare ? (
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={handleShare}
                  id="card-share-btn"
                >
                  <Share2 size={15} aria-hidden />
                  {t('cardModal.share')}
                </button>
              ) : (
                <button type="button" className="btn btn--outline" onClick={onClose}>
                  {t('cardModal.close')}
                </button>
              )}
            </div>
          )}

          {status === 'error' && (
            <p className="card-modal__feedback card-modal__feedback--error">
              {t('cardModal.errorMessage')}
            </p>
          )}

          {status === 'done' && !isGenerating && (
            <p className="card-modal__feedback card-modal__feedback--done">
              {t('cardModal.doneMessage')}
            </p>
          )}
        </div>
      </div>
    </>
  )
}
