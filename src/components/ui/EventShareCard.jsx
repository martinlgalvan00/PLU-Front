import '../../styles/components/event-share-card.css'
import { useEffect, useRef, useState } from 'react'
import { BRAND } from '../../lib/brand.js'
import {
  buildAthleteCredentialUrl,
  buildCredentialUrl,
  generateCredentialQr,
} from '../../lib/credentialQr.js'
import { inlineImageAsDataUrl } from '../../services/eventCardService.js'
import { formatShortDate } from '../../lib/format.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * La fecha del evento llega en dos formas distintas según quién arme la card:
 * ya escrita para humanos ("12-13 Dic 2026", un rango de dos días que no se
 * puede derivar de una sola fecha) o cruda desde la base — `event.date`
 * ("2026-12-12", inscripción a meet) o `starts_at` con hora
 * ("2026-12-12T20:00:00Z", entradas de espectador).
 *
 * Los dos llamadores crudos estaban imprimiendo el ISO tal cual en la pieza que
 * el atleta sube a redes. No se veía porque la card sólo existía detrás de un
 * botón: al ponerla a la vista en la confirmación quedó a la vista el
 * "2026-12-12".
 *
 * Se normaliza acá y no en cada llamador para que ninguna superficie nueva
 * pueda volver a filtrar un ISO, y respetando el string ya humano: cualquier
 * valor que no empiece con `YYYY-MM-DD` se imprime sin tocar.
 */
function humanEventDate(value, locale) {
  if (!value) return value
  const isoDay = /^(\d{4}-\d{2}-\d{2})/.exec(String(value))
  if (!isoDay) return value
  return formatShortDate(isoDay[1], locale)
}

/**
 * EventShareCard — PLU ARG
 *
 * Elemento HTML/CSS 1080×1080 (o 1080×1920) que se captura como PNG para
 * compartir en redes. Se monta fuera del viewport cuando está en modo
 * "capture"; en modo "preview" se escala para entrar en el modal.
 *
 * Composición: póster personal, no comprobante. Una sola familia con dos
 * materiales según el atleta tenga foto o no —
 *
 *   · Con foto  → retrato a sangre en todo el lienzo, velo vertical que lo
 *                 funde al grafito y bloque de identidad anclado abajo.
 *   · Sin foto  → sello de iniciales arriba y el mismo bloque anclado abajo;
 *                 el aire superior queda ocupado, no vacío.
 *
 * Anclar el contenido al pie (en vez de centrarlo) es lo que elimina los
 * huecos muertos que tenía la versión anterior en los dos formatos.
 *
 * Props:
 *   athleteName      string  — nombre completo
 *   athleteCode      string? — código de atleta (ej. "PLU-AR-0042"). También se
 *                              usa como identificador para el QR de verificación.
 *   athletePhotoUrl  string? — foto de perfil opcional; sin ella, la card usa
 *                              el sello de iniciales.
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

  // Retrato: se inlinea a data: URL antes de pintarlo. Ver
  // inlineImageAsDataUrl — sin eso, la foto firmada de Storage se ve en el
  // preview y desaparece del PNG. Mientras no esté resuelta se muestra el
  // sello de iniciales, así el preview y el PNG nunca difieren.
  const [photoData, setPhotoData] = useState(null)
  const [photoSettled, setPhotoSettled] = useState(() => !athletePhotoUrl)

  useEffect(() => {
    if (!athletePhotoUrl) {
      setPhotoData(null)
      setPhotoSettled(true)
      return undefined
    }
    let cancelled = false
    setPhotoSettled(false)
    inlineImageAsDataUrl(athletePhotoUrl)
      .then((dataUrl) => {
        if (cancelled) return
        setPhotoData(dataUrl)
        setPhotoSettled(true)
      })
      .catch(() => {
        if (cancelled) return
        setPhotoData(null)
        setPhotoSettled(true)
      })
    return () => {
      cancelled = true
    }
  }, [athletePhotoUrl])

  const hasPhoto = Boolean(photoData)

  // Nombres largos bajan de tamaño en vez de arriesgar un wrap feo. El nombre
  // ocupa el ancho útil completo (ya no comparte franja con un avatar), así
  // que la escala es más generosa que antes; la historia tiene más alto y
  // sube otro escalón.
  const nameLength = resolvedAthleteName.trim().length
  // El escalón de >30 existe para que un nombre completo largo entre en tres
  // líneas en vez de perder el apellido en el line-clamp.
  const nameSize = isStory
    ? nameLength > 30
      ? 98
      : nameLength > 22
        ? 118
        : nameLength > 16
          ? 142
          : 166
    : nameLength > 30
      ? 76
      : nameLength > 22
        ? 90
        : nameLength > 16
          ? 112
          : 128

  // Iniciales del atleta para el sello cuando no hay foto — la
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
    return () => {
      cancelled = true
    }
  }, [codeForQr, eventSlug, isTicket])

  // En preview, la card se renderiza siempre a su tamaño real (1080×1080) y se
  // reduce con transform: scale() — así el preview es un espejo fiel de lo que
  // termina en el PNG descargado, en vez de recalcular tipografía/paddings.
  useEffect(() => {
    if (!preview || !wrapRef.current) return undefined
    const el = wrapRef.current

    // Sin ResizeObserver (jsdom, browsers viejos) la card seguía a 1080px y
    // desbordaba su contenedor. Una medición puntual alcanza para el caso
    // estático; lo que se pierde es el reescalado al cambiar el viewport.
    if (typeof ResizeObserver === 'undefined') {
      const width = el.clientWidth
      if (width) setScale(width / 1080)
      return undefined
    }

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
        hasPhoto ? 'share-card--portrait' : 'share-card--seal',
      ].join(' ')}
      style={preview ? { transform: `scale(${scale})` } : undefined}
      aria-hidden={!preview}
      data-capture-ready={qrSettled && photoSettled ? '1' : '0'}
    >
      {/* ── Fondo con gradiente ── */}
      <div className="share-card__bg" />

      {/* ── Retrato a sangre + velo que lo funde al grafito ──
          El velo va como capa aparte (no como mask-image): html2canvas
          rasteriza gradientes de fondo, pero ignora las máscaras CSS. */}
      {hasPhoto && (
        <>
          <div className="share-card__photo" aria-hidden>
            <img src={photoData} alt="" className="share-card__photo-img" />
          </div>
          <div className="share-card__veil" aria-hidden />
        </>
      )}

      {/* ── Firma: barra oro grabada al canto, la misma de la credencial
             digital. Reemplaza al marco interior + franja superior: dos
             firmas de marca en la misma pieza se anulaban entre sí. ── */}
      <div className="share-card__signature" aria-hidden />

      {/* ── Textura sutil: líneas finas, look "foil". Sobre un retrato
             sobra material, así que solo entra en la variante con sello. ── */}
      {!hasPhoto && <div className="share-card__texture" aria-hidden />}

      {/* ── Header: solo la marca. El estado bajó al plinto, pegado al
             nombre: arriba competía con el escudo y obligaba a un segundo
             acento en la franja superior. ── */}
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
      </header>

      {/* ── Cuerpo: sello (sin foto) + identidad + datos, anclado al pie ── */}
      <main className="share-card__body">
        {!hasPhoto && (
          <div className="share-card__seal-mark" aria-hidden>
            {initials}
          </div>
        )}

        {/* Plinto: identidad + datos sobre su propio fondo. Con retrato, el
            velo global no alcanza — cuánto ocupa este bloque depende de la
            variante y del largo del nombre, así que un velo calibrado a mano
            dejaba el nombre a caballo de la transición sobre fotos claras.
            El plinto arrastra su degradado con él y siempre cierra opaco
            debajo del texto, sin importar cuánto crezca. */}
        <div className="share-card__plate">
          {hasPhoto && <div className="share-card__plate-veil" aria-hidden />}

          <div className="share-card__identity">
            {/* Un solo rótulo sobre el nombre, con el dot del estado: es a la
                vez el estado (que antes vivía en un pill arriba) y el contexto
                de la pieza. */}
            <span className="share-card__eyebrow">
              <span className="share-card__eyebrow-dot" aria-hidden />
              {isMembership
                ? t('shareCard.statusMembership')
                : isUnified
                  ? t('shareCard.eyebrowUnified')
                  : isTicket
                    ? t('shareCard.eyebrowTicket')
                    : t('shareCard.eyebrowEvent')}
            </span>
            <h2 className="share-card__athlete-name" style={{ fontSize: nameSize }}>
              {resolvedAthleteName}
            </h2>
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

          <div className="share-card__divider" aria-hidden />

          {/* Afiliación: ficha de campos (label + valor), el lenguaje de una
              credencial oficial. Reemplaza al eyebrow + título + nombre de la
              organización, que repetía la marca del header y usaba el peso de
              un titular para un dato administrativo. */}
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
                  <dt className="share-card__field-label">
                    {t('shareCard.membershipValidUntilLabel')}
                  </dt>
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
                  {humanEventDate(eventDate, locale)} · {eventVenue}
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
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── Footer: QR de verificación + firma de marca ── */}
      <footer className="share-card__footer">
        {qrSrc && (
          /* Marcas de visor alrededor del chip (no encima): el gesto de "esto
             se escanea". Van por fuera del papel blanco a propósito — dentro
             comerían la quiet zone del código, que es lo que garantiza el
             escaneo. Bordes planos, que html2canvas rasteriza sin sorpresas. */
          <div className="share-card__qr-block">
            <div className="share-card__qr-chip">
              <img src={qrSrc} alt="" className="share-card__qr-img" />
            </div>
            <span className="share-card__qr-mark share-card__qr-mark--tl" aria-hidden />
            <span className="share-card__qr-mark share-card__qr-mark--tr" aria-hidden />
            <span className="share-card__qr-mark share-card__qr-mark--bl" aria-hidden />
            <span className="share-card__qr-mark share-card__qr-mark--br" aria-hidden />
          </div>
        )}

        <div className="share-card__footer-col">
          <span className="share-card__qr-caption">
            {qrSrc
              ? isMembership
                ? t('shareCard.qrScanMembership')
                : t('shareCard.qrScan')
              : t('shareCard.issued', { date: issuedDate })}
          </span>
          <span className="share-card__issued">{t('shareCard.issued', { date: issuedDate })}</span>
        </div>

        {/* Firma de marca: el handle es lo que hace que la pieza vuelva a la
            federación cuando alguien la sube. */}
        <span className="share-card__url">
          <span className="share-card__tagline">{t('shareCard.tagline')}</span>
          {/* En la afiliación el pie invita: es la pieza que alguien sube a su
              historia y la que hace que el que la ve quiera afiliarse. */}
          {isMembership || isUnified ? t('shareCard.joinCta') : 'plu-arg.com'}
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
