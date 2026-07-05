import { useEffect, useRef, useState } from 'react'
import { Download, Share2, X } from 'lucide-react'
import EventShareCard from './EventShareCard.jsx'
import {
  buildCardFilename,
  downloadCard,
  generateEventCard,
  shareCard,
} from '../../services/eventCardService.js'

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
 *     eventSlug?, variant?
 *   }
 */
export default function CardPreviewModal({ open, onClose, cardData = {} }) {
  const captureRef = useRef(null)
  const [status, setStatus] = useState('idle') // 'idle' | 'generating' | 'done' | 'error'
  const [blob, setBlob] = useState(null)
  const canShare =
    typeof navigator !== 'undefined' &&
    typeof navigator.share === 'function'

  // Resetear estado al abrir
  useEffect(() => {
    if (open) {
      setStatus('idle')
      setBlob(null)
    }
  }, [open])

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

  const filename = buildCardFilename(cardData.athleteName, cardData.eventSlug ?? 'evento')

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
      await shareCard(generated, `¡Compito en ${cardData.eventTitle ?? 'PLU ARG'}! 🏋️`, filename)
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
        <div ref={captureRef} style={{ width: '1080px', height: '1080px' }}>
          <EventShareCard {...cardData} preview={false} />
        </div>
      </div>

      {/* ── Overlay del modal ── */}
      <div
        className="card-modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Card de inscripción"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="card-modal">

          {/* Header */}
          <div className="card-modal__header">
            <span className="card-modal__title">
              🎉 Tu card PLU ARG
            </span>
            <button
              type="button"
              className="card-modal__close"
              onClick={onClose}
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>

          {/* Preview escalado */}
          <div className="card-modal__preview-wrap">
            <div className="card-modal__preview-inner">
              <EventShareCard {...cardData} preview={true} />
            </div>
          </div>

          {/* Hint */}
          <div className="card-modal__hint">
            <span className="card-modal__hint-dot" aria-hidden />
            PNG 1080×1080 · Listo para Instagram y redes sociales
          </div>

          {/* Acciones */}
          {isGenerating ? (
            <div className="card-modal__generating">
              <div className="card-modal__spinner" aria-hidden />
              Generando imagen…
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
                Descargar PNG
              </button>

              {canShare ? (
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={handleShare}
                  id="card-share-btn"
                >
                  <Share2 size={15} aria-hidden />
                  Compartir
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--outline"
                  onClick={onClose}
                >
                  Cerrar
                </button>
              )}
            </div>
          )}

          {status === 'error' && (
            <p style={{ color: '#ff3b36', fontSize: 13, textAlign: 'center', padding: '0 20px 16px', margin: 0 }}>
              Ocurrió un error al generar la imagen. Intentá de nuevo.
            </p>
          )}

          {status === 'done' && !isGenerating && (
            <p style={{ color: '#8fd4a8', fontSize: 13, textAlign: 'center', padding: '0 20px 16px', margin: 0 }}>
              ✓ ¡Imagen lista! Subila a tus redes como atleta PLU ARG 🇦🇷
            </p>
          )}
        </div>
      </div>
    </>
  )
}
