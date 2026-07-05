import { useState } from 'react'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { UPCOMING_EVENTS } from '../lib/events.js'
import { formatShortDate } from '../lib/format.js'
import Reveal from '../components/ui/Reveal.jsx'
import CardPreviewModal from '../components/ui/CardPreviewModal.jsx'

function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

/**
 * Tarjeta "Mi card PLU ARG" dentro del perfil del atleta.
 * Permite generar y descargar la card en cualquier momento.
 */
function ProfileShareCardSection({ athlete, membership, nextEvent, registration }) {
  const [cardOpen, setCardOpen] = useState(false)

  const hasEvent = Boolean(registration)
  const hasMembership = membership?.status === 'activa'

  // Preferir card de evento si hay inscripción, sino card de afiliado
  const cardData = hasEvent
    ? {
        athleteName: athlete.fullName,
        athleteCode: membership?.memberCode,
        eventTitle: nextEvent?.title,
        eventDate: nextEvent?.date,
        eventVenue: nextEvent?.venue,
        eventLocation: nextEvent?.location,
        category: athlete.category,
        division: athlete.division,
        eventSlug: nextEvent?.slug,
        variant: 'event',
      }
    : {
        athleteName: athlete.fullName,
        athleteCode: membership?.memberCode,
        membershipExpiration: formatShortDate(membership?.expirationDate),
        variant: 'membership',
        eventSlug: 'afiliacion',
      }

  // Mostrar solo si tiene algún estado relevante
  if (!hasEvent && !hasMembership) return null

  return (
    <article className="account-card-share">
      <span className="account-card-share__label">🎨 Mi card PLU ARG</span>
      <h2>
        {hasEvent ? `Compito en ${nextEvent?.title}` : 'Atleta afiliado PLU ARG'}
      </h2>
      <p>
        {hasEvent
          ? 'Descargá tu card de inscripción y compartila en tus redes sociales.'
          : 'Descargá tu card de atleta afiliado PLU Argentina.'}
      </p>
      <button
        type="button"
        className="card-trigger-btn"
        onClick={() => setCardOpen(true)}
        id="profile-generate-card-btn"
      >
        <span className="card-trigger-btn__emoji">📲</span>
        Generar mi card
      </button>
      <CardPreviewModal
        open={cardOpen}
        onClose={() => setCardOpen(false)}
        cardData={cardData}
      />
    </article>
  )
}


export default function AthleteProfilePage({
  athlete,
  memberships,
  onNavigate,
  onLogout,
  registrations,
}) {
  const { t } = useI18n()

  if (!athlete) return null

  const membership = memberships.find((item) => item.athleteId === athlete.id)
  const nextEvent = UPCOMING_EVENTS.find((event) => event.featured) ?? UPCOMING_EVENTS[0]
  const registration = registrations.find(
    (item) => item.athleteId === athlete.id && item.event === nextEvent?.title,
  )

  return (
    <main className="page page--design">
      <Reveal>
        <section className="account-hero">
          <div className="account-hero__inner">
            <div className="account-hero__avatar" aria-hidden>
              {initials(athlete.fullName)}
            </div>
            <div className="account-hero__copy">
              <span className="account-hero__eyebrow">{t('account.eyebrow')}</span>
              <h1>
                {athlete.fullName}
              </h1>
              <div className="account-hero__badges">
                {membership?.status === 'activa' && (
                  <span className="account-badge account-badge--active">{t('account.membershipActive')}</span>
                )}
                {membership?.memberCode && (
                  <span className="account-badge account-badge--code">{membership.memberCode}</span>
                )}
              </div>
            </div>
            <button type="button" className="account-hero__logout" onClick={onLogout}>
              {t('account.logout')}
            </button>
          </div>
        </section>
      </Reveal>

      <section className="account-cards">
        <Reveal delay={0}>
          <article className="account-card">
            <span className="account-card__label">{t('account.nextCompetition')}</span>
            <h2>{nextEvent?.title ?? '—'}</h2>
            <p>
              {nextEvent?.date} · {athlete.division} · {athlete.category}
              {athlete.estimatedWeight ? ` · ${athlete.estimatedWeight}kg` : ''}
            </p>
            {registration && (
              <span className="account-card__status">{t('account.confirmed')}</span>
            )}
          </article>
        </Reveal>

        <Reveal delay={80}>
          <article className="account-card">
            <span className="account-card__label">{t('account.membership')}</span>
            <h2>
              {membership?.status === 'activa'
                ? `Vigente hasta ${membership.expirationDate ?? 'dic. 2026'}`
                : 'Sin afiliación activa'}
            </h2>
            <p>{membership?.memberCode ? `Código de afiliado ${membership.memberCode}` : 'Completá tu afiliación para competir.'}</p>
            <button type="button" className="account-card__link" onClick={() => onNavigate('members')}>
              {t('account.viewDetails')}
            </button>
          </article>
        </Reveal>

        <Reveal delay={160}>
          <article className="account-card">
            <span className="account-card__label">{t('account.history')}</span>
            <h2>{registrations.length ? `${registrations.length} inscripciones` : 'Sin historial'}</h2>
            <p>
              {registrations.length
                ? 'Competencias registradas en la plataforma PLU ARG.'
                : t('account.historyEmpty')}
            </p>
          </article>
        </Reveal>

        <Reveal delay={240}>
          <ProfileShareCardSection
            athlete={athlete}
            membership={membership}
            nextEvent={nextEvent}
            registration={registration}
          />
        </Reveal>
      </section>
    </main>
  )
}
