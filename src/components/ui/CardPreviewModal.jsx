import { useEffect, useRef, useState } from 'react'
import { Download, Share2, X } from 'lucide-react'
import EventShareCard from './EventShareCard.jsx'
import SegmentedSwitch from './SegmentedSwitch.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  buildCardFilename,
  downloadCard,
  generateEventCard,
  shareCard,
} from '../../services/eventCardService.js'

function buildShareText(cardData, t) {
  const eventTitle = cardData.eventTitle ?? t('cardModal.defaultEventTitle')
  if (cardData.variant === 'membership') return t('cardModal.shareTextMembership')
  if (cardData.variant === 'ticket') return t('cardModal.shareTextTicket', { event: eventTitle })
  return t('cardModal.shareTextDefault', { event: eventTitle })
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
 */
export default function CardPreviewModal({ open, onClose, cardData = {} }) {
  const { t } = useI18n()
  const formatOptions = [
    ['square', t('cardModal.formatSquare'), t('cardModal.formatSquareShort')],
    ['story', t('cardModal.formatStory'), t('cardModal.formatStoryShort')],
  ]
  const captureRef = useRef(null)
  const [status, setStatus] = useState('idle') // 'idle' | 'generating' | 'done' | 'error'
  const [blob, setBlob] = useState(null)
  const [format, setFormat] = useState('square') // 'square' | 'story'
  const canShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'

  // Resetear estado al abrir
  useEffect(() => {
    if (open) {
      setStatus('idle')
      setBlob(null)
      setFormat('square')
    }
  }, [open])

  // El blob generado corresponde a un solo formato — si el usuario cambia de
  // formato hay que regenerarlo antes de descargar/compartir de nuevo.
  useEffect(() => {
    setStatus('idle')
    setBlob(null)
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

  if (!open) return null

  const isStory = format === 'story'
  const filename = buildCardFilename(cardData.athleteName, cardData.eventSlug ?? 'evento', isStory ? 'historia' : '')

  async function handleDownload() {
    setStatus('generating')
    try {
      const generated = await generateEventCard(captureRef.current)
      setBlob(generated)
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
      const generated = blob ?? (await generateEventCard(captureRef.current))
      setBlob(generated)
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
      {/* ── Elemento oculto a tamaño real para captura ──
          html2canvas no rasteriza bien texto/imágenes dentro de nodos
          "position: fixed" ubicados fuera del viewport (offset negativo) —
          por eso acá el nodo capturado queda en flujo normal (sin fixed/offset
          propio) y es el CONTENEDOR el que lo recorta a 0×0 visualmente. */}
      <div style={{ position: 'fixed', top: 0, left: 0, width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <div ref={captureRef} style={{ width: '1080px', height: isStory ? '1920px' : '1080px' }}>
          <EventShareCard {...cardData} preview={false} format={format} />
        </div>
      </div>

      {/* ── Overlay del modal ── */}
      <div
        className="card-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label={t('cardModal.modalAria')}
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="card-modal">

          {/* Header */}
          <div className="card-modal__header">
            <span className="card-modal__title">
              {t('cardModal.title')}
            </span>
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
            <div className={`card-modal__preview-inner ${isStory ? 'card-modal__preview-inner--story' : ''}`}>
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
              <div className="card-modal__spinner" aria-hidden />
              {t('cardModal.generating')}
            </div>
          ) : (
            <div className="card-modal__actions">
              <button
                type="button"
                className="btn"
                onClick={handleDownload}
                id="card-download-btn"
              >
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
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={onClose}
                >
                  {t('cardModal.close')}
                </button>
              )}
            </div>
          )}

          {status === 'error' && (
            <p style={{ color: '#ff3b36', fontSize: 13, textAlign: 'center', padding: '0 20px 16px', margin: 0 }}>
              {t('cardModal.errorMessage')}
            </p>
          )}

          {status === 'done' && !isGenerating && (
            <p style={{ color: '#8fd4a8', fontSize: 13, textAlign: 'center', padding: '0 20px 16px', margin: 0 }}>
              {t('cardModal.doneMessage')}
            </p>
          )}
        </div>
      </div>
    </>
  )
}
