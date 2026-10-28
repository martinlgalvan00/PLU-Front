import { ArrowUpRight, CheckCircle2, Clock, Navigation, ShieldAlert } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildExternalMapUrl } from '../../lib/eventMap.js'

const STATE_ICON = {
  checked_in: CheckCircle2,
  ready: CheckCircle2,
  needs_membership: ShieldAlert,
  payment_pending: Clock,
  observed: Clock,
}

function formatDay(value, locale) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function formatDateTime(value, locale) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

/**
 * "Tus accesos": un renglón por evento con lo que va a decir la puerta.
 * El QR es uno solo (el del perfil); cada renglón dice si ese evento ya lo
 * acepta y, si no, qué falta y dónde resolverlo.
 */
export default function EventPassList({ passes, events = [], onNavigateSection }) {
  const { t, locale } = useI18n()
  if (!passes.length) return null

  return (
    <section className="account-passes" aria-labelledby="account-passes-title">
      <header className="account-passes__head">
        <h3 id="account-passes-title">{t('account.qr.passesTitle')}</h3>
        <p>{t('account.qr.passesLead')}</p>
      </header>
      <ol className="account-passes__list">
        {passes.map(({ state, registration }) => {
          const Icon = STATE_ICON[state]
          const event = events.find((item) => item.slug === registration.eventSlug) ?? null
          const place = [event?.venue, event?.location].filter(Boolean).join(' · ')
          const date = formatDay(registration.eventStartsAt, locale)
          const directions = state === 'ready' && event ? buildExternalMapUrl(event) : ''
          return (
            <li
              className="account-passes__item"
              data-state={state}
              key={registration.id ?? registration.eventSlug}
            >
              <div className="account-passes__event">
                <strong>{registration.event}</strong>
                {date || place ? <span>{[date, place].filter(Boolean).join(' · ')}</span> : null}
              </div>
              <p className="account-passes__state">
                <Icon aria-hidden size={15} strokeWidth={1.9} />
                {t(`account.qr.passState.${state}`)}
              </p>
              <p className="account-passes__detail">
                {t(`account.qr.passDetail.${state}`, {
                  date: formatDateTime(registration.checkedInAt, locale),
                })}
              </p>
              {state === 'payment_pending' ? (
                <button
                  className="account-passes__action"
                  type="button"
                  onClick={() => onNavigateSection?.('account-payments')}
                >
                  {t('account.qr.passPay')}
                  <ArrowUpRight aria-hidden size={14} />
                </button>
              ) : state === 'needs_membership' ? (
                <button
                  className="account-passes__action"
                  type="button"
                  onClick={() => onNavigateSection?.('account-membership')}
                >
                  {t('account.qr.passMembership')}
                  <ArrowUpRight aria-hidden size={14} />
                </button>
              ) : directions ? (
                <a
                  className="account-passes__action"
                  href={directions}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  <Navigation aria-hidden size={14} />
                  {t('account.qr.passDirections')}
                </a>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
