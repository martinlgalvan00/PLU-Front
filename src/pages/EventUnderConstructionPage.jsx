import { ArrowLeft, ArrowRight } from 'lucide-react'
import { eventLandingFromEvent } from '../lib/eventLanding.js'
import { normalizeLandingMotion } from '../lib/eventLandingMotion.js'
import { landingPaletteStyle } from '../lib/eventLandingPalette.js'
import { resolveEventLogo } from '../lib/eventMark.js'
import { isEventRegistrationOpen } from '../lib/eventPublicActions.js'
import {
  eventPublicTitle,
  eventShowsPublicRecentRegistrants,
} from '../lib/eventPublicSurface.js'
import { describePublicCapacity } from '../lib/eventCapacityPublic.js'
import { formatRelativeTime } from '../lib/format.js'
import { useEventRegistrationCapacity } from '../hooks/useEventRegistrationCapacity.js'
import { hiddenLandingTakesRegistrations } from '../../shared/registrationSaleState.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import '../styles/pages/event-landing-themes.css'
import '../styles/pages/event-under-construction.css'

const DAY_MS = 86_400_000
const MAX_RECENT = 6

function toDate(value) {
  const date = value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date : null
}

function formatDate(value, locale, withTime = false) {
  const date = toDate(value)
  if (!date) return ''
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date)
}

/** Días enteros hasta el evento; `null` si ya pasó o no hay fecha. */
function daysUntil(value, now = new Date()) {
  const date = toDate(value)
  if (!date) return null
  const days = Math.ceil((date.getTime() - now.getTime()) / DAY_MS)
  return days >= 0 ? days : null
}

/**
 * Lo que ve el público de una landing con el interruptor apagado: el nombre del
 * evento y el aviso de que la página oficial se está preparando.
 *
 * Ocultar la página no cierra la venta: con la inscripción abierta la portada
 * lleva "Inscribirme" (y la fecha y sede, que el catálogo entrega solo en ese
 * caso); programada, dice cuándo abre. Cerrada, no revela nada más.
 *
 * Composición: el nombre del evento a gran escala con su logo como emblema, y
 * una banda reglada con los datos que deciden la inscripción. Un solo estado
 * ("Inscripción abierta" o "Próximamente"): antes decía las dos cosas a la vez.
 */
export default function EventUnderConstructionPage({
  event = null,
  // A dónde lleva "Volver": la portada si se llegó desde su carril.
  backView = 'events',
  onNavigate,
  onSelectEvent,
  registrationEnabled = true,
}) {
  const { t, locale } = useI18n()
  const text = (key, params) => t(`pages.eventUnderConstruction.${key}`, params)
  const landing = eventLandingFromEvent(event)
  const title = landing.slots.heroTitle || eventPublicTitle(event) || event?.title || ''
  // La bajada propia del evento ("Clasificatorio al nacional 2027") es el dato
  // que mejor lo presenta: va debajo del nombre, antes del estado.
  const kicker = String(landing.slots.heroLead || event?.description || '').trim()
  const logoUrl = resolveEventLogo(event)
  const motion = normalizeLandingMotion(landing.layout?.motion)
  const takesRegistrations = hiddenLandingTakesRegistrations(event)
  const canRegister =
    takesRegistrations &&
    Boolean(onSelectEvent) &&
    isEventRegistrationOpen(event, { registrationEnabled })
  const opensAt =
    takesRegistrations && !canRegister ? formatDate(event?.registrationOpensAt, locale, true) : ''
  const registration = canRegister ? 'open' : opensAt ? 'scheduled' : 'closed'
  const date = takesRegistrations ? formatDate(event?.startsAt, locale) : ''
  // Sede arriba y ciudad debajo: en una sola línea la banda se partía en tres.
  const place = takesRegistrations ? [event?.venue, event?.location].filter(Boolean) : []
  const remaining = takesRegistrations ? daysUntil(event?.startsAt) : null
  const countdown =
    remaining == null
      ? ''
      : remaining === 0
        ? text('countdownToday')
        : text(remaining === 1 ? 'countdownDays_one' : 'countdownDays', { count: remaining })

  // Cupo e inscriptos en vivo (el mismo resumen que la portada y Pitbull). Solo
  // con la venta abierta: cerrada, la página no revela nada más.
  const live = useEventRegistrationCapacity(event?.slug, { enabled: canRegister })
  const capacityLabel = (() => {
    if (!canRegister || live.status !== 'live' || !live.slots) return ''
    const view = describePublicCapacity({
      progressPublic: live.progressPublic,
      totalPublic: live.totalPublic,
      registered: live.registered,
      slots: live.slots,
      remaining: live.remaining,
    })
    if (view.mode === 'hidden') return text('capacityLimited')
    return view.showTotal
      ? text('capacityRemaining', { remaining: view.remaining, slots: view.slots })
      : text(view.registered === 1 ? 'capacityRegistered_one' : 'capacityRegistered', {
          count: view.registered,
        })
  })()
  const recent =
    canRegister && eventShowsPublicRecentRegistrants(event) ? live.recent.slice(0, MAX_RECENT) : []

  const status = {
    open: text('statusOpen'),
    scheduled: text('statusScheduled'),
    closed: text('title'),
  }[registration]

  return (
    <main
      className="page event-under-construction event-landing-theme"
      data-event-theme={landing.themeId}
      data-motion={motion}
      data-registration={registration}
      data-emblem={logoUrl ? 'logo' : undefined}
      style={landingPaletteStyle(landing.layout, { withBackground: false })}
    >
      <div className="event-under-construction__inner">
        <button
          className="event-under-construction__back"
          type="button"
          onClick={() => onNavigate?.(backView)}
        >
          <ArrowLeft aria-hidden size={16} />
          {backView === 'home' ? text('backHome') : text('back')}
        </button>

        <section className="event-under-construction__stage" aria-labelledby="euc-title">
          <div className="event-under-construction__body">
            <p className="event-under-construction__eyebrow">{text('eyebrow')}</p>

            <h1 className="event-under-construction__event" id="euc-title">
              <span className="event-under-construction__event-line">{title}</span>
            </h1>

            {kicker ? <p className="event-under-construction__kicker">{kicker}</p> : null}

            <p className="event-under-construction__status" role="status">
              <span className="event-under-construction__status-dot" aria-hidden />
              {status}
            </p>

            <p className="event-under-construction__lead">
              {title ? text('leadNamed', { event: title }) : text('lead')}
              {opensAt ? ` ${text('registrationScheduled', { date: opensAt })}` : ''}
            </p>

            <div className="event-under-construction__actions">
              {canRegister ? (
                <button
                  className="event-under-construction__cta"
                  type="button"
                  onClick={() => onSelectEvent(event)}
                >
                  {text('register')}
                  <ArrowRight aria-hidden size={17} strokeWidth={1.75} />
                </button>
              ) : null}
              <button
                className={
                  canRegister
                    ? 'event-under-construction__secondary'
                    : 'event-under-construction__cta event-under-construction__cta--quiet'
                }
                type="button"
                onClick={() => onNavigate?.('events')}
              >
                {text('cta')}
              </button>
            </div>
          </div>

          {logoUrl ? (
            <figure className="event-under-construction__emblem" aria-hidden>
              <svg
                className="event-under-construction__ring"
                viewBox="0 0 200 200"
                focusable="false"
              >
                <circle className="event-under-construction__ring-track" cx="100" cy="100" r="96" />
                <circle className="event-under-construction__ring-draw" cx="100" cy="100" r="96" />
              </svg>
              <img
                alt=""
                className="event-under-construction__logo"
                decoding="async"
                height={320}
                src={logoUrl}
                width={320}
              />
            </figure>
          ) : null}
        </section>

        {date || place.length || countdown || capacityLabel ? (
          <dl className="event-under-construction__facts">
            {date ? (
              <div>
                <dt>{text('date')}</dt>
                <dd>{date}</dd>
              </div>
            ) : null}
            {place.length ? (
              <div>
                <dt>{text('venue')}</dt>
                <dd>
                  <span>{place[0]}</span>
                  {place[1] ? <small>{place[1]}</small> : null}
                </dd>
              </div>
            ) : null}
            {countdown ? (
              <div>
                <dt>{text('countdownLabel')}</dt>
                <dd>{countdown}</dd>
              </div>
            ) : null}
            {capacityLabel ? (
              <div>
                <dt>{text('capacityLabel')}</dt>
                <dd>{capacityLabel}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {recent.length > 0 ? (
          <section className="event-under-construction__recent" aria-labelledby="euc-recent-title">
            <header>
              <h2 id="euc-recent-title">{t('pages.events.recentRegistrantsTitle')}</h2>
              <span className="event-under-construction__live">
                <span aria-hidden />
                {t('pages.events.recentRegistrantsLive')}
              </span>
            </header>
            <ol>
              {recent.map((item, index) => (
                <li key={`${item.displayName}-${item.registeredAt ?? index}`}>
                  <strong>{item.displayName}</strong>
                  {item.gym ? <span>{item.gym}</span> : <span />}
                  {item.registeredAt ? (
                    <time dateTime={item.registeredAt}>
                      {formatRelativeTime(item.registeredAt, locale)}
                    </time>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </main>
  )
}
