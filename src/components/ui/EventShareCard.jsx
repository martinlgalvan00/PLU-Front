import { useEffect, useRef, useState } from 'react'
import { BRAND } from '../../lib/brand.js'
import { buildCredentialUrl, generateCredentialQr } from '../../lib/credentialQr.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * EventShareCard — PLU ARG
 *
 * Elemento HTML/CSS 1080×1080 que se captura como PNG para compartir en redes.
 * Se monta fuera del viewport cuando está en modo "capture"; en modo "preview"
 * se escala para entrar en el modal.
 *
 * Props:
 *   athleteName      string  — nombre completo
 *   athleteCode      string? — código de atleta (ej. "PLU-AR-0042"). También se
 *                              usa como identificador para el QR de verificación.
 *   eventTitle       string  — nombre del evento
 *   eventDate        string  — ej. "12-13 Dic 2026"
 *   eventVenue       string  — ej. "Maximal Strength Club"
 *   eventLocation    string  — ej. "Buenos Aires"
 *   category         string? — ej. "Sub-Junior"
 *   division         string? — ej. "Clásico"
 *   eventSlug        string? — slug del evento (variant 'event' | 'ticket'), va en la URL del QR
 *   membershipSeason      string? — ej. "2026" (variant 'membership')
 *   membershipExpiration  string? — ej. "31 dic 2026" (variant 'membership')
 *   attendeeDocument string? — DNI del asistente (variant 'ticket')
 *   dayPassLabel     string? — ej. "Día 1 · 12 Dic" o "Ambos días" (variant 'ticket')
 *   qrCode           string? — código que va DENTRO del QR si es distinto al
 *                              mostrado en pantalla (ej. ticket.qrToken opaco,
 *                              vs. athleteCode/ticketCode humano). Si no se
 *                              pasa, el QR usa athleteCode como antes.
 *   variant          'event' | 'membership' | 'ticket'
 *   format           'square' | 'story' — 'square' es 1080×1080 (feed/post);
 *                     'story' es 1080×1920 (historia de Instagram, con
 *                     márgenes verticales extra para no chocar con la UI
 *                     propia de Instagram — foto de perfil arriba, barra de
 *                     respuesta abajo)
 *   preview          boolean — si es true, aplica escala para el modal
 */
export default function EventShareCard({
  athleteName,
  athleteCode,
  eventTitle,
  eventDate,
  eventVenue,
  eventLocation,
  category,
  division,
  eventSlug,
  membershipSeason = '2026',
  membershipExpiration,
  attendeeDocument,
  dayPassLabel,
  qrCode,
  variant = 'event',
  format = 'square',
  preview = false,
}) {
  const { locale, t } = useI18n()
  const resolvedAthleteName = athleteName ?? t('shareCard.defaultAthlete')
  const resolvedEventTitle = eventTitle ?? t('shareCard.defaultEvent')
  const isMembership = variant === 'membership'
  const isTicket = variant === 'ticket'
  const isStory = format === 'story'
  const wrapRef = useRef(null)
  const [scale, setScale] = useState(1)

  // Nombres largos bajan de tamaño en vez de arriesgar un wrap de 2 líneas feo.
  // La historia tiene más alto disponible, así que el nombre puede ser más grande.
  const nameLength = resolvedAthleteName.trim().length
  const nameSize = isStory
    ? (nameLength > 22 ? 92 : nameLength > 16 ? 116 : 132)
    : (nameLength > 22 ? 72 : nameLength > 16 ? 92 : 108)

  // Iniciales del atleta para el monograma de fondo — el toque personalizado
  // que reemplaza la marca de agua genérica de texto.
  const initials = resolvedAthleteName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()

  const issuedDate = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date())

  // QR de verificación — permite validar la credencial en la puerta del evento
  // o establecimiento escaneando desde cualquier celular, sin apps extra.
  const [qrSrc, setQrSrc] = useState(null)
  // Para entradas, el QR tiene que llevar el qrToken opaco (alta entropía),
  // no el athleteCode/ticketCode humano — ese es secuencial y adivinable.
  // Ver server/modules/ticketing: el qrToken es lo único que el backend
  // acepta para verificar/hacer check-in.
  const codeForQr = qrCode ?? athleteCode

  useEffect(() => {
    if (!codeForQr) {
      setQrSrc(null)
      return undefined
    }
    let cancelled = false
    const url = buildCredentialUrl({
      code: codeForQr,
      eventSlug: isMembership ? undefined : eventSlug,
      type: isTicket ? 'ticket' : undefined,
    })
    generateCredentialQr(url)
      .then((dataUrl) => { if (!cancelled) setQrSrc(dataUrl) })
      .catch(() => { if (!cancelled) setQrSrc(null) })
    return () => { cancelled = true }
  }, [codeForQr, eventSlug, isMembership, isTicket])

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
      className={[
        'share-card',
        preview ? 'share-card--preview' : 'share-card--capture',
        `share-card--${variant}`,
        isStory ? 'share-card--story' : 'share-card--square',
      ].join(' ')}
      style={preview ? { transform: `scale(${scale})` } : undefined}
      aria-hidden={!preview}
    >
      {/* ── Fondo con gradiente ── */}
      <div className="share-card__bg" />

      {/* ── Franja de acento superior ── */}
      <div className="share-card__stripe-top" />

      {/* ── Monograma personalizado (iniciales del atleta) ── */}
      <div className="share-card__monogram" aria-hidden>
        {initials}
      </div>

      {/* ── Header: marca + estado ── */}
      <header className="share-card__header">
        <div className="share-card__brand">
          <img
            src={BRAND.logoArgentinaUrl}
            alt="PLU Argentina"
            className="share-card__logo"
            crossOrigin="anonymous"
          />
          <span className="share-card__brand-name">{t('shareCard.brandName')}</span>
        </div>
        <span className="share-card__status">
          <span className="share-card__status-dot" aria-hidden />
          {isMembership
            ? t('shareCard.statusMembership')
            : isTicket
              ? t('shareCard.statusTicket')
              : t('shareCard.statusEvent')}
        </span>
      </header>

      {/* ── Cuerpo: nombre + datos ── */}
      <main className="share-card__body">
        <div className="share-card__athlete-section">
          <span className="share-card__eyebrow">
            {isMembership
              ? t('shareCard.eyebrowMembership')
              : isTicket
                ? t('shareCard.eyebrowTicket')
                : t('shareCard.eyebrowEvent')}
          </span>
          <h2 className="share-card__athlete-name" style={{ fontSize: nameSize }}>{resolvedAthleteName}</h2>
          {(athleteCode || attendeeDocument) && (
            <span className="share-card__athlete-code">
              {[athleteCode, attendeeDocument ? `DNI ${attendeeDocument}` : null].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>

        <div className="share-card__divider" aria-hidden />

        <div className="share-card__event-section">
          {isMembership ? (
            <>
              <span className="share-card__event-eyebrow">{t('shareCard.membershipAnnual')}</span>
              <p className="share-card__event-title">{t('shareCard.membershipSeason', { season: membershipSeason })}</p>
              <p className="share-card__event-meta">{t('shareCard.membershipOrg')}</p>
              {membershipExpiration && (
                <p className="share-card__event-category">
                  {t('shareCard.membershipValidUntil', { date: membershipExpiration })}
                </p>
              )}
            </>
          ) : (
            <>
              <span className="share-card__event-eyebrow">
                {isTicket ? t('shareCard.ticketValidFor') : t('shareCard.competingIn')}
              </span>
              <p className="share-card__event-title">{resolvedEventTitle}</p>
              {eventDate && eventVenue && (
                <p className="share-card__event-meta">
                  {eventDate} · {eventVenue}
                  {eventLocation ? `, ${eventLocation}` : ''}
                </p>
              )}
              {(category || division || dayPassLabel) && (
                <p className="share-card__event-category">
                  {[category, division, dayPassLabel].filter(Boolean).join(' · ')}
                </p>
              )}
            </>
          )}
        </div>
      </main>

      {/* ── Línea de corte estilo ticket ── */}
      <div className="share-card__stub-line" aria-hidden>
        <span className="share-card__stub-dot share-card__stub-dot--left" />
        <span className="share-card__stub-dot share-card__stub-dot--right" />
      </div>

      {/* ── Footer: QR de verificación + marca (2 zonas, sin duplicar info) ── */}
      <footer className="share-card__footer">
        {qrSrc && (
          <div className="share-card__qr-chip">
            <img src={qrSrc} alt="" className="share-card__qr-img" />
          </div>
        )}

        <div className="share-card__footer-col">
          <span className="share-card__tagline">{t('shareCard.tagline')}</span>
          <span className="share-card__qr-caption">
            {qrSrc ? t('shareCard.qrScan') : t('shareCard.issued', { date: issuedDate })}
          </span>
        </div>

        <span className="share-card__url">
          plu-arg.com{qrSrc ? ` · ${issuedDate}` : ''}
        </span>
      </footer>
    </div>
  )

  if (!preview) return card

  return (
    <div
      className={`share-card-scale-wrap ${isStory ? 'share-card-scale-wrap--story' : ''}`}
      ref={wrapRef}
    >
      {card}
    </div>
  )
}
