import { useEffect, useRef, useState } from 'react'
import { BRAND } from '../../lib/brand.js'

/**
 * EventShareCard — PLU ARG
 *
 * Elemento HTML/CSS 1080×1080 que se captura como PNG para compartir en redes.
 * Se monta fuera del viewport cuando está en modo "capture"; en modo "preview"
 * se escala para entrar en el modal.
 *
 * Props:
 *   athleteName      string  — nombre completo
 *   athleteCode      string? — código de atleta (ej. "PLU-AR-0042")
 *   eventTitle       string  — nombre del evento
 *   eventDate        string  — ej. "12-13 Dic 2026"
 *   eventVenue       string  — ej. "Maximal Strength Club"
 *   eventLocation    string  — ej. "Buenos Aires"
 *   category         string? — ej. "Sub-Junior"
 *   division         string? — ej. "Clásico"
 *   membershipSeason      string? — ej. "2026" (variant 'membership')
 *   membershipExpiration  string? — ej. "31 dic 2026" (variant 'membership')
 *   variant          'event' | 'membership'
 *   preview          boolean — si es true, aplica escala para el modal
 */
export default function EventShareCard({
  athleteName = 'Atleta PLU',
  athleteCode,
  eventTitle = 'Evento PLU ARG',
  eventDate,
  eventVenue,
  eventLocation,
  category,
  division,
  membershipSeason = '2026',
  membershipExpiration,
  variant = 'event',
  preview = false,
}) {
  const isMembership = variant === 'membership'
  const wrapRef = useRef(null)
  const [scale, setScale] = useState(1)

  // Nombres largos bajan de tamaño en vez de arriesgar un wrap de 2 líneas feo.
  const nameLength = athleteName.trim().length
  const nameSize = nameLength > 22 ? 64 : nameLength > 16 ? 76 : 88

  // En preview, la card se renderiza siempre a su tamaño real (1080×1080) y se
  // reduce con transform: scale() — así el preview es un espejo fiel de lo que
  // termina en el PNG descargado, en vez de recalcular tipografía/paddings.
  useEffect(() => {
    if (!preview || !wrapRef.current) return undefined
    const el = wrapRef.current
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) setScale(width / 1080)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [preview])

  const card = (
    <div
      className={`share-card ${preview ? 'share-card--preview' : 'share-card--capture'} ${isMembership ? 'share-card--membership' : 'share-card--event'}`}
      style={preview ? { transform: `scale(${scale})` } : undefined}
      aria-hidden={!preview}
    >
      {/* ── Fondo con gradiente y noise ── */}
      <div className="share-card__bg" />

      {/* ── Franja de acento superior ── */}
      <div className="share-card__stripe-top" />

      {/* ── Marca de agua diagonal (texto PLU) ── */}
      <div className="share-card__watermark" aria-hidden>
        POWERLIFTING UNITED
      </div>

      {/* ── Header: logo + badge de estado ── */}
      <header className="share-card__header">
        <img
          src={BRAND.logoArgentinaUrl}
          alt="PLU Argentina"
          className="share-card__logo"
          crossOrigin="anonymous"
        />
        <span className={`share-card__badge ${isMembership ? 'share-card__badge--gold' : 'share-card__badge--celeste'}`}>
          {isMembership ? 'AFILIADO PLU ARG' : 'INSCRIPTO ✓'}
        </span>
      </header>

      {/* ── Cuerpo: nombre + datos ── */}
      <main className="share-card__body">
        <div className="share-card__athlete-section">
          <span className="share-card__eyebrow">
            {isMembership ? 'Nuevo miembro' : 'Competidor'}
          </span>
          <h2 className="share-card__athlete-name" style={{ fontSize: nameSize }}>{athleteName}</h2>
          {athleteCode && (
            <span className="share-card__athlete-code">{athleteCode}</span>
          )}
        </div>

        <div className="share-card__divider" aria-hidden />

        <div className="share-card__event-section">
          {isMembership ? (
            <>
              <span className="share-card__event-eyebrow">Afiliación anual</span>
              <p className="share-card__event-title">Temporada {membershipSeason}</p>
              <p className="share-card__event-meta">Powerlifting United Argentina</p>
              {membershipExpiration && (
                <p className="share-card__event-category">Vigente hasta {membershipExpiration}</p>
              )}
            </>
          ) : (
            <>
              <span className="share-card__event-eyebrow">Compito en</span>
              <p className="share-card__event-title">{eventTitle}</p>
              {eventDate && eventVenue && (
                <p className="share-card__event-meta">
                  {eventDate} · {eventVenue}
                  {eventLocation ? `, ${eventLocation}` : ''}
                </p>
              )}
              {(category || division) && (
                <p className="share-card__event-category">
                  {[category, division].filter(Boolean).join(' · ')}
                </p>
              )}
            </>
          )}
        </div>
      </main>

      {/* ── Footer: tagline + franja ── */}
      <footer className="share-card__footer">
        <span className="share-card__tagline">powerlifting united argentina</span>
        <span className="share-card__url">plu-arg.com</span>
      </footer>

      {/* ── Franja de acento inferior (tricolor) ── */}
      <div className="share-card__stripe-bottom" />
    </div>
  )

  if (!preview) return card

  return (
    <div className="share-card-scale-wrap" ref={wrapRef}>
      {card}
    </div>
  )
}
