import '../../styles/components/event-share-card.css'
import { useEffect, useRef, useState } from 'react'
import { BRAND } from '../../lib/brand.js'
import {
  buildAthleteCredentialUrl,
  buildCredentialUrl,
  generateCredentialQr,
} from '../../lib/credentialQr.js'
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
 *   athletePhotoUrl  string? — foto de perfil opcional; sin ella, la card sigue
 *                              usando el monograma de iniciales de fondo.
 *   eventTitle       string  — nombre del evento
 *   eventDate        string  — ej. "12-13 Dic 2026"
 *   eventVenue       string  — ej. "Maximal Strength Club"
 *   eventLocation    string  — ej. "Buenos Aires"
 *   category         string? — ej. "Youth"
 *   division         string? — ej. "Clásico"
 *   eventSlug        string? — slug del evento; solo las entradas generales lo incluyen en el QR
 *   membershipSeason      string? — ej. "2026" (variant 'membership')
 *   membershipExpiration  string? — ej. "31 dic 2026" (variant 'membership')
 *   attendeeDocument string? — DNI del asistente (variant 'ticket')
 *   dayPassLabel     string? — ej. "Día 1 · 12 Dic" o "Ambos días" (variant 'ticket')
 *   qrCode           string? — código que va DENTRO del QR si es distinto al
 *                              mostrado en pantalla (ej. ticket.qrToken opaco,
 *                              vs. athleteCode/ticketCode humano). Si no se
 *                              pasa, el QR usa athleteCode como antes.
 *   variant          'event' | 'membership' | 'unified' | 'ticket'
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
  athletePhotoUrl,
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
  const isUnified = variant === 'unified'
  const isTicket = variant === 'ticket'
  const isStory = format === 'story'
  const wrapRef = useRef(null)
  const [scale, setScale] = useState(1)

  // Nombres largos bajan de tamaño en vez de arriesgar un wrap de 2 líneas feo.
  // La historia tiene más alto disponible, así que el nombre puede ser más grande.
  // Con foto de perfil el nombre tiene menos ancho disponible (el avatar se
  // lleva una franja fija a la izquierda), así que baja un escalón más.
  // Con el medallón de iniciales o la foto a la izquierda, el nombre tiene
  // menos ancho disponible: baja un escalón en vez de arriesgar wraps feos.
  const nameLength = resolvedAthleteName.trim().length
  const avatarSizeAdjust = isStory ? 16 : 12
  const nameSize =
    (isStory
      ? (nameLength > 22 ? 100 : nameLength > 16 ? 124 : 144)
      : (nameLength > 22 ? 76 : nameLength > 16 ? 96 : 112)) - avatarSizeAdjust

  // Iniciales del atleta para el medallón cuando no hay foto — la
  // personalización de la pieza sin superponer texto alguno.
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
  const [qrSettled, setQrSettled] = useState(() => !(qrCode ?? athleteCode))
  // Para entradas, el QR tiene que llevar el qrToken opaco (alta entropía),
  // no el athleteCode/ticketCode humano — ese es secuencial y adivinable.
  // Ver server/modules/ticketing: el qrToken es lo único que el backend
  // acepta para verificar/hacer check-in.
  const codeForQr = qrCode ?? athleteCode

  useEffect(() => {
    if (!codeForQr) {
      setQrSrc(null)
      setQrSettled(true)
      return undefined
    }
    let cancelled = false
    setQrSettled(false)
    // La credencial del atleta es una identidad estable: afiliación e
    // inscripciones se consultan en vivo al escanear. Solo las entradas
    // generales son event-scoped y usan un token separado.
    const url = isTicket
      ? buildCredentialUrl({ code: codeForQr, eventSlug, type: 'ticket' })
      : buildAthleteCredentialUrl(codeForQr)
    generateCredentialQr(url)
      .then((dataUrl) => {
        if (cancelled) return
        setQrSrc(dataUrl)
        setQrSettled(true)
      })
      .catch(() => {
        if (cancelled) return
        setQrSrc(null)
        setQrSettled(true)
      })
    return () => { cancelled = true }
  }, [codeForQr, eventSlug, isTicket])

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
        isUnified ? 'share-card--membership' : '',
        isStory ? 'share-card--story' : 'share-card--square',
      ].join(' ')}
      style={preview ? { transform: `scale(${scale})` } : undefined}
      aria-hidden={!preview}
      data-capture-ready={qrSettled ? '1' : '0'}
    >
      {/* ── Fondo con gradiente ── */}
      <div className="share-card__bg" />

      {/* ── Marco interior fino (gesto credencial impresa) ── */}
      <div className="share-card__frame" aria-hidden />

      {/* ── Franja de acento superior ── */}
      <div className="share-card__stripe-top" />

      {/* ── Textura sutil: sheen diagonal + líneas finas, look "foil" ── */}
      <div className="share-card__texture" aria-hidden />

      {/* ── Header: marca + estado ── */}
      <header className="share-card__header">
        <div className="share-card__brand">
          <img
            src={BRAND.logoArgentinaUrl}
            alt="PLU Argentina"
            className="share-card__logo"
            width={152}
            height={152}
            decoding="async"
            crossOrigin="anonymous"
          />
          <span className="share-card__brand-name">{t('shareCard.brandName')}</span>
        </div>
        <span className="share-card__status">
          <span className="share-card__status-dot" aria-hidden />
          {isUnified
            ? t('shareCard.statusUnified')
            : isMembership
            ? t('shareCard.statusMembership')
            : isTicket
              ? t('shareCard.statusTicket')
              : t('shareCard.statusEvent')}
        </span>
      </header>

      {/* ── Cuerpo: nombre + datos ── */}
      <main className="share-card__body">
        <div className="share-card__athlete-section share-card__athlete-section--with-avatar">
          {athletePhotoUrl ? (
            <div className="share-card__avatar">
              <img src={athletePhotoUrl} alt="" className="share-card__avatar-img" crossOrigin="anonymous" />
            </div>
          ) : (
            <div className="share-card__avatar share-card__avatar--initials" aria-hidden>
              {initials}
            </div>
          )}
          <div className="share-card__athlete-text">
            {/* La afiliación no lleva eyebrow: el estado ya vive en el header y
                la ficha de abajo da el contexto. Un tercer rótulo sobre el
                nombre solo repetía "socio" tres veces en la misma pieza. */}
            {!isMembership && (
              <span className="share-card__eyebrow">
                {isUnified
                  ? t('shareCard.eyebrowUnified')
                  : isTicket
                    ? t('shareCard.eyebrowTicket')
                    : t('shareCard.eyebrowEvent')}
              </span>
            )}
            <h2 className="share-card__athlete-name" style={{ fontSize: nameSize }}>{resolvedAthleteName}</h2>
            {(athleteCode || attendeeDocument) && (
              <span className="share-card__athlete-code">
                {isMembership && athleteCode
                  ? `${t('shareCard.memberNumberLabel')} ${athleteCode}`
                  : [athleteCode, attendeeDocument ? `DNI ${attendeeDocument}` : null]
                      .filter(Boolean)
                      .join(' · ')}
              </span>
            )}
          </div>
        </div>

        <div className="share-card__divider" aria-hidden />

        {/* Afiliación: ficha de campos (label + valor), el lenguaje de una
            credencial oficial. Reemplaza al eyebrow + título + nombre de la
            organización, que repetía la marca del header y usaba el peso de un
            titular para un dato administrativo. */}
        {isMembership ? (
          <dl className="share-card__fields">
            <div className="share-card__field">
              <dt className="share-card__field-label">{t('shareCard.membershipAnnual')}</dt>
              <dd className="share-card__field-value">
                {t('shareCard.membershipSeason', { season: membershipSeason })}
              </dd>
            </div>
            {membershipExpiration && (
              <div className="share-card__field">
                <dt className="share-card__field-label">{t('shareCard.membershipValidUntilLabel')}</dt>
                <dd className="share-card__field-value">{membershipExpiration}</dd>
              </div>
            )}
          </dl>
        ) : (
          <div className="share-card__event-section">
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
            {(category || division || dayPassLabel || isUnified) && (
              <p className="share-card__event-category">
                {[
                  isUnified ? t('shareCard.unifiedMembershipActive') : null,
                  category,
                  division,
                  dayPassLabel,
                ].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        )}
      </main>

      {/* ── Footer: QR de verificación + firma de marca ── */}
      <footer className="share-card__footer">
        {qrSrc && (
          <div className="share-card__qr-chip">
            <img src={qrSrc} alt="" className="share-card__qr-img" />
          </div>
        )}

        <div className="share-card__footer-col">
          <span className="share-card__tagline">{t('shareCard.tagline')}</span>
          <span className="share-card__qr-caption">
            {qrSrc
              ? isMembership
                ? t('shareCard.qrScanMembership')
                : t('shareCard.qrScan')
              : t('shareCard.issued', { date: issuedDate })}
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
