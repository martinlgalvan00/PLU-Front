import { useMemo, useState } from 'react'
import { ArrowRight, KeyRound, LoaderCircle } from 'lucide-react'
import BundleTicket, { bundleChannels, bundlePrice } from '../../components/ui/BundleTicket.jsx'
import TransferReceipt from '../../components/checkout/TransferReceipt.jsx'
import ManualPaymentConfirmation from '../../components/checkout/ManualPaymentConfirmation.jsx'
import { FORM_OPTIONS } from '../../lib/constants.js'
import { money } from '../../lib/format.js'
import { computeFinancingRemaining, formatFinancingCountdown } from '../../lib/financingCountdown.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { clearPendingPromotionCode } from '../../services/promotionCodeService.js'
import '../../styles/components/bundle-section.css'

/**
 * SecretBundleSection — la ficha del código-paquete — PLU ARG
 *
 * Un código de combo se canjea y aterriza acá (20260926100000:
 * `action = 'open_bundle'`). La ficha es la única superficie del producto donde
 * el paquete se lee entero y se termina de pagar sin salir: antes se aplicaba
 * dentro del checkout del torneo, mezclado con el formulario competitivo y el
 * selector de medio de pago, y sus condiciones quedaban como notas al pie.
 *
 * El trámite está escalonado y cada paso muestra sólo lo suyo:
 *
 *   1. `ready`    — el paquete todavía no se compró: documento, datos para
 *                   competir (precargados del perfil) y con qué se paga.
 *   2. `manual`   — la orden existe y se cobra a mano: los datos de la
 *                   transferencia o la instrucción de efectivo, y las dos
 *                   maneras de cerrarla (pagué / voy a pagar dentro del plazo).
 *   3. `granted`  — habilitado con la deuda abierta: la cuenta regresiva manda.
 *   4. `settled`  — Finanzas acreditó: queda el registro.
 *
 * Mercado Pago no se cobra acá a propósito. El brick embebido vive en el
 * checkout del torneo con todo su ciclo (preferencia, reintentos, settle), y
 * traerlo a esta ficha sería mantener dos veces la parte más delicada del
 * sistema. Cuando el código lo habilita, la pasarela se ofrece como lo que es:
 * un desvío a esa pantalla, con el paquete ya aplicado.
 */
export default function SecretBundleSection({
  athlete,
  offers = [],
  onStartOfferPayment,
  onNavigate,
  onSelectEvent,
}) {
  const { locale, t } = useI18n()
  // Una sola oferta por vez: son acuerdos privados y tener dos abiertas es un
  // caso que el producto no admite hoy. Si llegaran varias, manda la más
  // reciente — `athlete_list_offer_unlocks` ya las ordena por canje.
  const offer = offers[0] ?? null

  const channels = useMemo(() => (offer ? bundleChannels(offer) : []), [offer])
  const manualChannels = useMemo(
    () => channels.filter((channel) => channel !== 'mercado_pago'),
    [channels],
  )

  const [division, setDivision] = useState(athlete?.division ?? '')
  const [category, setCategory] = useState(athlete?.category ?? '')
  const [weight, setWeight] = useState(
    athlete?.estimatedWeight ? String(athlete.estimatedWeight) : '',
  )
  const [method, setMethod] = useState(manualChannels[0] ?? channels[0] ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  if (!offer) return null

  const purchase = offer.purchase ?? null
  const state = bundleState(purchase)
  const channel = method === 'mercado_pago' ? 'gateway' : 'manual'
  const price = bundlePrice(offer, state === 'ready' ? channel : 'manual')

  const remaining = purchase?.financedPaymentDueAt
    ? computeFinancingRemaining(purchase.financedPaymentDueAt)
    : null
  const countdown = remaining ? formatFinancingCountdown(remaining, t) : ''

  const statusWord = {
    ready: t('account.bundle.status.ready'),
    manual: t('account.bundle.status.reserved'),
    granted: t('account.bundle.status.granted'),
    settled: t('account.bundle.status.settled'),
  }[state]

  async function submit(submitEvent) {
    submitEvent.preventDefault()
    if (submitting || !onStartOfferPayment) return
    if (!division || !category || !weight) {
      setError(t('account.bundle.form.incomplete'))
      return
    }
    // La pasarela se cobra donde vive su brick. Se manda al checkout del torneo
    // con el paquete ya destrabado en vez de montar un segundo ciclo de pago.
    if (method === 'mercado_pago') {
      if (offer.event?.slug) onSelectEvent?.({ slug: offer.event.slug })
      onNavigate?.('competition', { eventSlug: offer.event?.slug })
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const result = await onStartOfferPayment({
        offer,
        event: offer.event,
        paymentMethod: apiPaymentMethod(method),
        division,
        category,
        bodyweightKg: Number(String(weight).replace(',', '.')),
      })
      if (result?.error) {
        setError(result.error)
        return
      }
      // El código dejó de estar pendiente: la compra ya lo consumió.
      clearPendingPromotionCode()
    } catch (submitError) {
      setError(submitError?.message ?? t('common.errorMessage'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="account-section bundle-section" id="account-offer">
      <header className="account-section__heading">
        <span className="account-section__icon account-section__icon--gold" aria-hidden>
          <KeyRound size={19} />
        </span>
        <span className="account-section__heading-copy">
          <span className="account-section__eyebrow">{t('account.bundle.eyebrow')}</span>
          <h2>{t('account.bundle.title')}</h2>
        </span>
      </header>
      <p className="account-section__lead">{t(`account.bundle.lead.${state}`)}</p>

      <BundleTicket
        offer={offer}
        status={statusWord}
        channel={channel}
        footer={
          state === 'granted' && countdown
            ? t('account.bundle.dueIn', { countdown })
            : null
        }
      />

      {/* `noValidate`: la validación nativa cortaba el submit antes que la
          propia, y el mensaje del formulario —en el idioma del resto de la
          app— no llegaba nunca. Los campos conservan `required` para las
          tecnologías de asistencia. */}
      {state === 'ready' ? (
        <form className="bundle-section__form" onSubmit={submit} noValidate>
          <fieldset className="bundle-section__fieldset">
            <legend>{t('account.bundle.form.competitionLegend')}</legend>
            <p className="bundle-section__hint">{t('account.bundle.form.competitionHint')}</p>
            <div className="bundle-section__grid">
              <label>
                <span>{t('account.bundle.form.division')}</span>
                <select value={division} onChange={(event) => setDivision(event.target.value)} required>
                  <option value="">{t('account.bundle.form.choose')}</option>
                  {FORM_OPTIONS.division.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('account.bundle.form.category')}</span>
                <select value={category} onChange={(event) => setCategory(event.target.value)} required>
                  <option value="">{t('account.bundle.form.choose')}</option>
                  {FORM_OPTIONS.category.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('account.bundle.form.weight')}</span>
                <input
                  type="number"
                  min="30"
                  max="250"
                  step="0.1"
                  inputMode="decimal"
                  value={weight}
                  onChange={(event) => setWeight(event.target.value)}
                  required
                />
              </label>
            </div>
          </fieldset>

          <fieldset className="bundle-section__fieldset">
            <legend>{t('account.bundle.form.paymentLegend')}</legend>
            {/* La condición del financiamiento vale para los dos canales, así
                que vive en el bloque: repetida en cada fila era la misma frase
                dos veces, una debajo de la otra. */}
            {offer.financed ? (
              <p className="bundle-section__hint">{t('account.bundle.form.financedHint')}</p>
            ) : null}
            <div className="bundle-section__methods" role="radiogroup">
              {channels.map((item) => (
                <label key={item} className="bundle-section__method">
                  <input
                    type="radio"
                    name="bundle-payment-method"
                    value={item}
                    checked={method === item}
                    onChange={() => setMethod(item)}
                  />
                  <span>
                    <strong>{channelName(item, t)}</strong>
                    <small>{t(CHANNEL_NOTES[item] ?? 'account.bundle.form.transferNote')}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {error ? (
            <p className="bundle-section__error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" className="bundle-section__action" disabled={submitting || !method}>
            {submitting ? (
              <LoaderCircle className="bundle-section__spinner" size={18} aria-hidden />
            ) : null}
            {method === 'mercado_pago'
              ? t('account.bundle.form.goToGateway')
              : t('account.bundle.form.submit', {
                  amount: money(price, locale, offer.event?.currency ?? 'ARS'),
                })}
            <ArrowRight size={16} aria-hidden />
          </button>
        </form>
      ) : null}

      {state === 'manual' || state === 'granted' ? (
        <div className="bundle-section__settle">
          {purchase?.manualPaymentChannel === 'bank_transfer' ? (
            <TransferReceipt
              athlete={athlete}
              orderId={purchase.orderId}
              channel="bank_transfer"
              purpose="competition"
              warningId="bundle-transfer-verify"
              financingAllowed={purchase.financingAllowed === true}
              manualPaymentDeclaredAt={purchase.manualPaymentDeclaredAt}
              financedEntitlementsAt={purchase.financedEntitlementsAt}
            />
          ) : (
            <ManualPaymentConfirmation
              channel="cash_pitbull"
              orderId={purchase?.orderId}
              financingAllowed={purchase?.financingAllowed === true}
              manualPaymentDeclaredAt={purchase?.manualPaymentDeclaredAt}
              financedEntitlementsAt={purchase?.financedEntitlementsAt}
              financedPaymentDueAt={purchase?.financedPaymentDueAt}
              onNavigate={onNavigate}
              profileTab="account-offer"
            />
          )}
        </div>
      ) : null}

      {state === 'settled' ? (
        <p className="bundle-section__settled" role="status">
          {t('account.bundle.settled')}
        </p>
      ) : null}
    </section>
  )
}

/**
 * En qué paso del trámite está el paquete, leído de la compra y no de un estado
 * local: quien vuelve a la ficha después de cerrar el navegador tiene que
 * encontrar exactamente lo mismo.
 *
 * Una orden cerrada (rechazada, cancelada o vencida) devuelve al principio: el
 * canje se libera con la orden (20260906100000), así que el código vuelve a
 * estar disponible y la ficha tiene que volver a ofrecerlo.
 */
/**
 * El canal como lo guarda el código no es el método que acepta la API.
 * `discount_codes.manual_channels` habla de canales ('bank_transfer'), y el
 * checkout habla de métodos ('manual_link'); `manualPaymentChannel` en
 * checkoutPricePolicy.js hace la traducción del otro lado. Sin esto la orden se
 * creaba con un método que el schema rechaza.
 */
/**
 * Qué dice cada canal de sí mismo. Distinto por canal a propósito: lo que
 * comparten —que el pago se puede diferir— vale para los dos y por eso se dice
 * una sola vez, arriba del grupo.
 */
const CHANNEL_NOTES = {
  mercado_pago: 'account.bundle.form.gatewayNote',
  bank_transfer: 'account.bundle.form.transferNote',
  cash_pitbull: 'account.bundle.form.cashNote',
}

/**
 * El nombre del canal cuando encabeza una opción.
 *
 * Las etiquetas de `secretOfferRedeemer.payment.channel` están en minúscula
 * porque se insertan dentro de una oración ("Sólo con transferencia · efectivo").
 * Acá titulan una fila seleccionable. Se capitaliza en vez de duplicar la
 * traducción de cada canal: dos juegos de nombres para lo mismo se desincronizan.
 */
function channelName(channel, t) {
  const label = t(`secretOfferRedeemer.payment.channel.${channel}`)
  return label.charAt(0).toUpperCase() + label.slice(1)
}

export function apiPaymentMethod(channel) {
  return channel === 'bank_transfer' ? 'manual_link' : channel
}

export function bundleState(purchase) {
  if (!purchase) return 'ready'
  if (purchase.status === 'aprobado') return 'settled'
  if (['cancelado', 'rechazado', 'reembolsado'].includes(purchase.status)) return 'ready'
  if (purchase.financedEntitlementsAt && !purchase.financedEntitlementsRevokedAt) return 'granted'
  return 'manual'
}
