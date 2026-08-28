import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import '../../styles/components/bundle-ticket.css'

/**
 * BundleTicket — el paquete como documento emitido — PLU ARG
 *
 * Un código de combo no es un cupón: es un acuerdo privado entre la federación y
 * una persona, y trae seis condiciones juntas —qué afiliación, qué inscripción,
 * qué precio, con qué se paga, si el pago se puede diferir y por cuánto tiempo—.
 * Contarlas como líneas de un formulario las deja todas al mismo peso, que es
 * exactamente lo que pasaba cuando el paquete se aplicaba adentro del checkout
 * del torneo.
 *
 * El material es el que la app ya usa para lo que emite la federación
 * (`credential-card.css`, `code-band.css`, `promotion-reveal.css`): cara en
 * degradé 158deg, filo de oro, marco interior, grano estático y el código en el
 * mismo mono espaciado que el número de socio. No hay lenguaje visual nuevo.
 *
 * La pieza es sólo el documento. Qué se puede hacer con él —pagarlo, diferirlo,
 * ver la cuenta regresiva— lo decide quien la monta: el mismo ticket vale para
 * el paquete que todavía no se compró y para el que ya está reservado.
 *
 * @param {object} props
 * @param {object} props.offer     Fila de `athlete_list_offer_unlocks`.
 * @param {string} [props.status]  Palabra de estado en la ficha superior.
 * @param {'gateway'|'manual'} [props.channel] Con qué canal se cotiza el importe.
 * @param {import('react').ReactNode} [props.footer] Registro adicional al pie.
 */
export default function BundleTicket({ offer, status = '', channel = 'manual', footer = null }) {
  const { locale, t } = useI18n()
  if (!offer) return null

  const currency = offer.event?.currency ?? offer.membershipPlan?.currency ?? 'ARS'
  const price = bundlePrice(offer, channel)
  const separate = separatePrice(offer, channel)
  // Sólo se anuncia un ahorro cuando existe de verdad. Un paquete que cobra lo
  // mismo que las partes sueltas no tiene nada que tachar, y tachar igual sería
  // inventarle un descuento.
  const savings = separate > price ? separate - price : 0

  const terms = [
    {
      key: 'payment',
      label: t('account.bundle.terms.payment'),
      value: channelsLabel(offer, t),
    },
    offer.financed && {
      key: 'financing',
      label: t('account.bundle.terms.financing'),
      value:
        offer.financingTermDays === 1
          ? t('account.bundle.financingTermOne')
          : t('account.bundle.financingTerm', { days: offer.financingTermDays ?? 7 }),
    },
    // Cero no se muestra: si el cupo se hubiera agotado, el código no estaría
    // desbloqueado. Sólo se dice cuando hay tope y queda algo.
    Number.isFinite(offer.remaining) &&
      offer.remaining > 0 && {
        key: 'remaining',
        label: t('account.bundle.terms.remaining'),
        value:
          offer.remaining === 1
            ? t('account.bundle.remainingOne')
            : t('account.bundle.remaining', { count: offer.remaining }),
      },
    offer.expiresAt && {
      key: 'window',
      label: t('account.bundle.terms.window'),
      value: formatWindowDate(offer.expiresAt, locale),
    },
  ].filter(Boolean)

  return (
    <article className="bundle-ticket">
      <span className="bundle-ticket__grain" aria-hidden />
      <span className="bundle-ticket__frame" aria-hidden />
      <div className="bundle-ticket__body">
        <header className="bundle-ticket__head">
          <span className="bundle-ticket__mark">{t('account.bundle.mark')}</span>
          {status ? <span className="bundle-ticket__status">{status}</span> : null}
        </header>

        <p className="bundle-ticket__code">{offer.code}</p>

        <h3 className="bundle-ticket__headline">
          {t('account.bundle.headline', {
            plan: offer.membershipPlan?.name ?? t('account.bundle.fallbackPlan'),
            event: offer.event?.title ?? t('account.bundle.fallbackEvent'),
          })}
        </h3>

        <p className="bundle-ticket__amount">
          <strong>{money(price, locale, currency)}</strong>
          {savings > 0 ? (
            <>
              <s>{money(separate, locale, currency)}</s>
              <span>{t('account.bundle.savings', { amount: money(savings, locale, currency) })}</span>
            </>
          ) : null}
        </p>

        {offer.description ? (
          <p className="bundle-ticket__lead">{offer.description}</p>
        ) : null}

        <dl className="bundle-ticket__terms">
          {terms.map((term) => (
            <div key={term.key}>
              <dt>{term.label}</dt>
              <dd>{term.value}</dd>
            </div>
          ))}
        </dl>

        {footer ? <div className="bundle-ticket__footer">{footer}</div> : null}
      </div>
    </article>
  )
}

/**
 * Importe del paquete para el canal que se está cotizando.
 *
 * `fixedPriceManual` vacío significa "cobra lo mismo en cualquier canal", que es
 * el caso más común: no es cero. Mismo orden de lectura que
 * `plu_private.effective_fixed_price` en la base, para que la pantalla no
 * anuncie un número distinto del que cobra la orden.
 */
export function bundlePrice(offer, channel = 'manual') {
  const manual = Number(offer?.fixedPriceManual)
  const gateway = Number(offer?.fixedPrice)
  if (channel === 'manual' && Number.isFinite(manual) && manual > 0) return manual
  return Number.isFinite(gateway) && gateway > 0 ? gateway : manual || 0
}

/** Lo que costaría comprar afiliación e inscripción por separado, en ese canal. */
export function separatePrice(offer, channel = 'manual') {
  const plan = offer?.membershipPlan
  const event = offer?.event
  if (!plan || !event) return 0
  const planPart =
    channel === 'manual' ? (Number(plan.manualPrice) || Number(plan.price) || 0) : Number(plan.price) || 0
  const eventPart =
    channel === 'manual'
      ? Number(event.registrationManualPrice) || Number(event.registrationPrice) || 0
      : Number(event.registrationPrice) || 0
  return planPart + eventPart
}

/** Con qué se puede pagar este paquete, en el orden en que lo ve el atleta. */
export function bundleChannels(offer) {
  const manual = Array.isArray(offer?.manualChannels) ? offer.manualChannels : []
  return [...(offer?.mercadoPagoEnabled === false ? [] : ['mercado_pago']), ...manual]
}

function channelsLabel(offer, t) {
  const channels = bundleChannels(offer)
  if (!channels.length) return t('account.bundle.noChannel')
  const names = channels.map((channel) => t(`secretOfferRedeemer.payment.channel.${channel}`))
  return offer.mercadoPagoEnabled === false
    ? t('account.bundle.paymentOnly', { channels: names.join(' · ') })
    : t('account.bundle.paymentWith', { channels: names.join(' · ') })
}

function formatWindowDate(iso, locale) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'long',
  }).format(date)
}
