import { useMemo, useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { isProfileComplete } from '../../lib/athleteProfile.js'
import { getOfferState, resolveOfferPricing } from '../../services/exclusiveOfferService.js'

/**
 * Ficha "Oferta exclusiva" — sólo existe para quien canjeó un código secreto.
 *
 * Tesis: esta pantalla tiene que sentirse distinguida y verificable, porque
 * ayuda al atleta que canjeó un código a confirmar qué desbloqueó y comprarlo
 * sin dudar, mediante una portada de una sola oferta con el cálculo desglosado.
 *
 * Orden de lectura: (1) qué código canjeó — es lo que vino a confirmar,
 * (2) qué es la oferta y para qué torneo, (3) el precio y contra qué se compara,
 * (4) la acción. Un solo acento (oro, que en PLU es distinción/membresía), una
 * sola acción principal, sin cards anidadas: el desglose son filas con reglas.
 *
 * No cobra nada. El importe definitivo lo resuelve el checkout del combo, que
 * vuelve a validar el código y su alcance del lado del servidor.
 */
export default function ExclusiveOfferSection({
  offer,
  offers = [],
  athlete,
  events = [],
  onSelectEvent,
  onNavigate,
  onNavigateSection,
}) {
  const { locale, t } = useI18n()
  const [profileWarning, setProfileWarning] = useState(false)

  const pricing = useMemo(() => resolveOfferPricing(offer), [offer])
  const state = useMemo(() => getOfferState(offer), [offer])

  // El evento del catálogo, no el del payload: es el que trae fecha legible,
  // sede y ciudad, y es el objeto que `onSelectEvent` espera para que el wizard
  // no se quede con el `selectedEvent` viejo.
  const catalogEvent = useMemo(
    () => events.find((item) => item.slug === offer?.event?.slug) ?? null,
    [events, offer?.event?.slug],
  )

  if (!offer) return null

  const eventTitle = catalogEvent?.title ?? offer.event?.title ?? ''
  const planName = offer.membershipPlan?.name ?? t('account.offer.membershipFallback')
  const campaignTitle = offer.campaign?.name || t('account.offer.title')

  function goToCheckout() {
    if (!state.available) return
    if (athlete && !isProfileComplete(athlete).complete) {
      setProfileWarning(true)
      return
    }
    setProfileWarning(false)
    // El código NO se pasa por acá: el checkout lee las ofertas desbloqueadas
    // del atleta y aplica la que corresponde a este evento. Así también funciona
    // si el atleta entra por un link directo o recarga la página.
    if (catalogEvent && onSelectEvent) {
      onSelectEvent(catalogEvent)
      return
    }
    onNavigate?.('competition')
  }

  return (
    <section id="account-offer" className="account-section account-section--gold">
      <div className="account-section__heading">
        <div className="account-section__icon account-section__icon--gold">
          <Sparkles size={21} />
        </div>
        <div className="account-section__heading-copy">
          <span className="account-section__eyebrow">{t('account.offer.eyebrow')}</span>
          <h2 className="account-offer__title">{campaignTitle}</h2>
        </div>
      </div>

      <div className="account-offer">
        <p className="account-offer__key">
          <span>{t('account.offer.codeLabel')}</span>
          <code>{offer.code}</code>
        </p>
        <p className="account-offer__lead">
          {offer.campaign?.description ||
            offer.description ||
            t('account.offer.lead', { code: offer.code })}
        </p>

        <div className="account-offer__package">
          <span className="account-offer__package-label">{t('account.offer.packageLabel')}</span>
          <strong className="account-offer__package-event">{eventTitle}</strong>
          {catalogEvent ? (
            <span className="account-offer__package-meta">
              {[catalogEvent.date, catalogEvent.venue, catalogEvent.location]
                .filter(Boolean)
                .join(' · ')}
            </span>
          ) : null}
        </div>

        <dl className="account-offer__ledger">
          <div className="account-offer__ledger-row">
            <dt>{planName}</dt>
            <dd>{money(pricing.membershipPrice, locale, pricing.currency)}</dd>
          </div>
          <div className="account-offer__ledger-row">
            <dt>{t('account.offer.registrationLine', { event: eventTitle })}</dt>
            <dd>{money(pricing.registrationPrice, locale, pricing.currency)}</dd>
          </div>
          <div className="account-offer__ledger-row account-offer__ledger-row--total">
            <dt>{t('account.offer.yourPrice')}</dt>
            <dd>{money(pricing.offerPrice, locale, pricing.currency)}</dd>
          </div>
        </dl>

        {pricing.savings > 0 ? (
          <p className="account-offer__savings">
            {/* Ya comprada, el desglose es un recibo: "ahorrás" en presente
                sonaría a una oferta todavía abierta. */}
            {t(offer.redeemed ? 'account.offer.savingsRedeemed' : 'account.offer.savings', {
              amount: money(pricing.savings, locale, pricing.currency),
            })}
          </p>
        ) : null}

        {state.available ? (
          <>
            <p className="account-offer__checkout-note">{t('account.offer.checkoutNote')}</p>
            <div className="account-offer__actions">
              <button type="button" className="account-offer__cta" onClick={goToCheckout}>
                {t('account.offer.cta')}
                <ArrowRight size={16} aria-hidden />
              </button>
            </div>
            {profileWarning ? (
              <div className="account-offer__notice" role="alert">
                <p>{t('account.offer.profileIncomplete')}</p>
                <button
                  type="button"
                  className="account-offer__notice-action"
                  onClick={() => onNavigateSection?.('account-personal-data')}
                >
                  {t('account.offer.profileIncompleteAction')}
                </button>
              </div>
            ) : null}
            {offer.expiresAt ? (
              <p className="account-offer__fine">
                {t('account.offer.expires', {
                  date: new Date(offer.expiresAt).toLocaleDateString(
                    locale === 'en' ? 'en-US' : 'es-AR',
                    { day: 'numeric', month: 'long' },
                  ),
                })}
              </p>
            ) : null}
            {offer.remaining != null ? (
              <p className="account-offer__fine">
                {t('account.offer.remaining', { count: offer.remaining })}
              </p>
            ) : null}
          </>
        ) : (
          <div className="account-offer__notice" role="status">
            <p>{t(`account.offer.state.${state.reason}`)}</p>
            {state.reason === 'redeemed' ? (
              <button
                type="button"
                className="account-offer__notice-action"
                onClick={() => onNavigateSection?.('account-events')}
              >
                {t('account.offer.redeemedAction')}
              </button>
            ) : null}
          </div>
        )}

        {offers.length > 1 ? (
          <p className="account-offer__fine">
            {t('account.offer.more', { count: offers.length - 1 })}
          </p>
        ) : null}
      </div>
    </section>
  )
}
