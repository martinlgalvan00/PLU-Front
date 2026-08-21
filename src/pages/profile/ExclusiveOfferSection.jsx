import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Check, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { isProfileComplete } from '../../lib/athleteProfile.js'
import { getFormOptions } from '../../lib/formOptions.js'
import { validateCompetitionFields } from '../../lib/validation.js'
import {
  buildOfferResumeOrder,
  checkoutMethodForChannel,
  getOfferState,
  resolveManualSettlement,
  resolveOfferChannels,
  resolveOfferPricing,
} from '../../services/exclusiveOfferService.js'
import { ChoiceField, Field } from '../../components/ui/FormFields.jsx'
import MercadoPagoEmbeddedCheckout from '../../components/ui/MercadoPagoEmbeddedCheckout.jsx'
import TransferReceipt from '../../components/checkout/TransferReceipt.jsx'
import ManualPaymentConfirmation from '../../components/checkout/ManualPaymentConfirmation.jsx'
import MotionContentSwap from '../../motion/MotionContentSwap.tsx'

const COMPETITION_FIELDS = ['division', 'category', 'estimatedWeight']

/** Preferencias competitivas del perfil, con los mismos defaults del checkout. */
function competitionEntryOf(athlete) {
  return {
    division: athlete?.division || 'Open',
    category: athlete?.category || 'Raw',
    estimatedWeight:
      athlete?.estimatedWeight != null && athlete.estimatedWeight !== ''
        ? String(athlete.estimatedWeight)
        : '',
  }
}

/**
 * Ficha "Oferta exclusiva" — sólo existe para quien canjeó un código secreto.
 *
 * Tesis: esta pantalla tiene que sentirse privada y liquidable, porque ayuda al
 * atleta que canjeó un código a confirmar qué desbloqueó y **pagarlo con el
 * medio que su código habilita sin salir de la pestaña que lo desbloqueó**,
 * mediante una liquidación única que se convierte en escritorio de cobro en el
 * mismo lugar.
 *
 * Orden de lectura: (1) qué código canjeó — es lo que vino a confirmar,
 * (2) qué es la oferta y para qué torneo, (3) el precio y contra qué se compara,
 * (4) los datos de su inscripción, (5) con qué paga, (6) el cobro. Un solo
 * acento (oro, que en PLU es distinción/membresía), una sola acción principal
 * por paso, sin cards anidadas: el desglose son filas con reglas.
 *
 * Los medios los decide el código, no esta pantalla: `resolveOfferChannels`
 * cruza lo que el código habilita (`manualChannels`) con lo que cierra
 * (`mercadoPagoEnabled`, 20260908100000). Un código pactado para cobrarse en
 * efectivo no ofrece la pasarela, y el precio se recotiza por canal —
 * transferencia y efectivo pueden tener su propio importe.
 *
 * Dos pasos en el mismo espacio, no dos pantallas: `revisar` y `pagar` se
 * intercambian con `MotionContentSwap` en modo `sync` para que la tarjeta no
 * colapse entre uno y otro. La dirección del swap dice si se avanzó o se
 * volvió. Antes, todo lo que no fuera Mercado Pago mandaba al wizard de
 * inscripción: ese salto perdía la oferta —el wizard no recibía el código— y
 * dejaba al atleta sin forma de pagar por transferencia.
 *
 * La ficha no confirma ningún pago: crea la orden contra la misma RPC que el
 * checkout (que vuelve a validar código, alcance, canal y precio); el cobro lo
 * hace el Brick de Mercado Pago, o lo valida Finanzas contra el comprobante. La
 * acreditación de afiliación e inscripción sigue llegando por el webhook.
 */
export default function ExclusiveOfferSection({
  offer,
  offers = [],
  athlete,
  events = [],
  onSelectEvent,
  onNavigate,
  onNavigateSection,
  onStartOfferPayment,
  onOfferRefresh,
  checkoutAvailability = {},
}) {
  const { locale, t } = useI18n()
  const [profileWarning, setProfileWarning] = useState(false)
  const [step, setStep] = useState('review')
  const [order, setOrder] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')
  const [settled, setSettled] = useState(false)
  // Canal elegido. Nace en null a propósito: el default sale de lo que el
  // código habilita, que se resuelve en el render (`activeChannel`), así no hay
  // un efecto que corrija la selección después de pintarla.
  const [channel, setChannel] = useState(null)
  // Prellenado sincrónico y no por efecto: resuelto después, la ficha ya habría
  // decidido que faltan datos y el formulario quedaría abierto para siempre.
  const [entry, setEntry] = useState(() => competitionEntryOf(athlete))
  const [entryErrors, setEntryErrors] = useState({})
  // Los datos de inscripción llegan del perfil: por defecto se muestran como
  // una línea confirmada y no como dos grillas de radios. En mobile esas grillas
  // ocupaban media pantalla y empujaban el precio y la acción fuera de vista, y
  // acá el atleta viene a confirmar, no a completar un formulario.
  const [editingEntry, setEditingEntry] = useState(false)
  const prefilledRef = useRef(athlete?.id ?? null)
  const payRef = useRef(null)

  // El combo acredita afiliación e inscripción: con cualquiera de los dos
  // conceptos cerrado desde Administración no hay nada que cobrar por ningún
  // canal. Default abierto (`!== false`) para no cerrar la venta por una
  // lectura incompleta; el 409 del backend sigue siendo la última palabra.
  const conceptsOpen =
    checkoutAvailability.membershipEnabled !== false &&
    checkoutAvailability.registrationEnabled !== false
  const channels = useMemo(
    () => resolveOfferChannels(offer, { conceptsOpen }),
    [conceptsOpen, offer],
  )
  const activeChannel = channels.includes(channel) ? channel : (channels[0] ?? null)
  const paymentMethod = checkoutMethodForChannel(activeChannel)
  // Con el cobro cerrado no hay canal activo, pero el copy igual tiene que
  // resolver a una clave existente: la pasarela es el caso por defecto.
  const copyChannel = activeChannel ?? 'mercado_pago'

  const pricing = useMemo(
    () => resolveOfferPricing(offer, { paymentMethod }),
    [offer, paymentMethod],
  )
  const state = useMemo(() => getOfferState(offer), [offer])
  const formOptions = useMemo(() => getFormOptions(t), [t])

  // El evento del catálogo, no el del payload: es el que trae fecha legible,
  // sede y ciudad, y es el objeto que `onSelectEvent` espera para que el wizard
  // no se quede con el `selectedEvent` viejo.
  const catalogEvent = useMemo(
    () => events.find((item) => item.slug === offer?.event?.slug) ?? null,
    [events, offer?.event?.slug],
  )

  // El perfil es la fuente de verdad de las preferencias competitivas: mismo
  // criterio que el checkout de inscripción, para no volver a pedirle datos que
  // el atleta ya confirmó en su cuenta. El efecto sólo cubre el cambio de
  // atleta (el prellenado inicial ya lo hizo el estado).
  useEffect(() => {
    if (!athlete?.id || prefilledRef.current === athlete.id) return
    prefilledRef.current = athlete.id
    setEntry(competitionEntryOf(athlete))
  }, [athlete])

  // Un perfil sin peso declarado no puede confirmarse de un vistazo: ahí el
  // formulario se abre solo, con el campo que falta a la vista.
  const entryComplete = useMemo(
    () => validateCompetitionFields({ ...entry, paymentMethod }, COMPETITION_FIELDS, t).success,
    [entry, paymentMethod, t],
  )
  useEffect(() => {
    if (!entryComplete) setEditingEntry(true)
  }, [entryComplete])

  // Una compra que quedó impaga se retoma acá mismo: es el único lugar donde el
  // atleta entiende qué está pagando. `buildOfferResumeOrder` devuelve null si
  // la orden no se cobra con el brick —transferencia y efectivo se resuelven con
  // comprobante o el día del evento—, y para esas está `manualSettlement`.
  const resumeOrder = useMemo(
    () =>
      buildOfferResumeOrder(offer, {
        athlete,
        concept: offer?.event?.title
          ? t('account.offer.orderConcept', { event: offer.event.title })
          : '',
      }),
    [athlete, offer, t],
  )
  const activeOrder = order ?? resumeOrder
  // La liquidación manual pendiente: la de la orden que se acaba de crear o la
  // que quedó abierta de un intento anterior.
  const manualSettlement = useMemo(() => resolveManualSettlement(offer, order), [offer, order])

  // Al entrar en el paso de pago, el foco va al encabezado del escritorio: sin
  // esto el teclado quedaba en un botón que ya no existe.
  useEffect(() => {
    if (step !== 'pay') return
    payRef.current?.focus()
  }, [step])

  if (!offer) return null

  const eventTitle = catalogEvent?.title ?? offer.event?.title ?? ''
  const planName = offer.membershipPlan?.name ?? t('account.offer.membershipFallback')
  const campaignTitle = offer.campaign?.name || t('account.offer.title')
  const leadText =
    offer.campaign?.description ||
    offer.description ||
    t('account.offer.lead', { code: offer.code })
  // La campaña puede cargar el mismo texto como nombre y como descripción (se
  // vio en ONLY-PITBULL): sin esto la ficha repetía la misma oración dos veces
  // seguidas, título y bajada.
  const showLead = leadText.trim() !== campaignTitle.trim()
  const checkoutEvent = catalogEvent ?? offer.event
  const checkoutOpen = channels.length > 0
  const payDisabled = submitting || !checkoutOpen
  const settleChannel =
    manualSettlement?.channel ?? (step === 'pay' ? 'mercado_pago' : activeChannel)

  function updateEntry(event) {
    const { name, value } = event.target
    setEntry((current) => ({ ...current, [name]: value }))
    setEntryErrors((current) => ({ ...current, [name]: undefined }))
    setCheckoutError('')
  }

  /**
   * Crea la orden del combo con el código de la oferta y abre el escritorio de
   * cobro por el canal elegido. El código viaja en los dos campos porque cumple
   * los dos roles: destraba el combo restringido y fija el importe promocional.
   * Las dos cosas —y el canal— las vuelve a validar el servidor.
   */
  async function payHere() {
    if (payDisabled) return
    if (athlete && !isProfileComplete(athlete).complete) {
      setProfileWarning(true)
      return
    }
    setProfileWarning(false)
    const validation = validateCompetitionFields({ ...entry, paymentMethod }, COMPETITION_FIELDS, t)
    if (!validation.success) {
      setEntryErrors(validation.errors)
      setEditingEntry(true)
      return
    }
    setEntryErrors({})
    setCheckoutError('')
    setSubmitting(true)
    try {
      const result = await onStartOfferPayment?.({
        offer,
        event: checkoutEvent,
        paymentMethod,
        division: entry.division,
        category: entry.category,
        bodyweightKg: Number(String(entry.estimatedWeight).replace(',', '.')),
      })
      if (result?.error) {
        setCheckoutError(result.error)
        return
      }
      if (!result?.createdOrder) {
        setCheckoutError(t('account.offer.checkoutUnavailable'))
        return
      }
      setOrder(result.createdOrder)
      setStep('pay')
      // Una orden manual no se cobra acá: queda esperando comprobante o el día
      // del evento. Se relee la oferta para que, al volver, la ficha ofrezca
      // retomar ESA orden en vez de crear otra.
      if (result.createdOrder.paymentMethod !== 'mercado_pago') void onOfferRefresh?.()
    } catch (error) {
      setCheckoutError(error?.message ?? t('account.offer.checkoutUnavailable'))
    } finally {
      setSubmitting(false)
    }
  }

  /** El pago aprobado convierte la ficha en recibo; el payload se relee. */
  function handlePaymentResult(result) {
    if (result?.status !== 'approved') return
    setSettled(true)
    void onOfferRefresh?.()
  }

  function goToFullCheckout() {
    if (onSelectEvent) {
      onSelectEvent(checkoutEvent)
      return
    }
    onNavigate?.('competition', { eventSlug: offer.event.slug })
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
        {showLead ? <p className="account-offer__lead">{leadText}</p> : null}

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
            {t(
              settled || state.purchase?.paid
                ? 'account.offer.savingsRedeemed'
                : 'account.offer.savings',
              { amount: money(pricing.savings, locale, pricing.currency) },
            )}
          </p>
        ) : null}

        {/* Un solo espacio para la conclusión de la ficha: revisar y pagar se
            reemplazan ahí mismo. `sync` superpone los dos paneles sobre la misma
            celda de grilla, así la tarjeta no salta de alto al cambiar de paso. */}
        <MotionContentSwap
          className="account-offer__stage"
          swapKey={settled ? 'done' : step}
          direction={step === 'pay' ? 1 : -1}
          mode="sync"
        >
          {settled ? (
            <div className="account-offer__settled" role="status">
              <p className="account-offer__settled-title">
                <Check size={16} aria-hidden />
                {t('account.offer.settledTitle')}
              </p>
              <p>{t('account.offer.settledLead')}</p>
              <button
                type="button"
                className="account-offer__notice-action"
                onClick={() => onNavigateSection?.('account-events')}
              >
                {t('account.offer.redeemedAction')}
              </button>
            </div>
          ) : step === 'pay' && (manualSettlement || activeOrder) ? (
            <div className="account-offer__settle">
              <div className="account-offer__settle-head">
                <h3
                  className="account-offer__settle-title"
                  ref={payRef}
                  tabIndex={-1}
                  id="account-offer-pay"
                >
                  {t(`account.offer.payTitle.${settleChannel}`)}
                </h3>
                <p className="account-offer__settle-note">
                  <ShieldCheck size={14} aria-hidden />
                  {t(
                    manualSettlement ? 'account.offer.payManualNote' : 'account.offer.paySafeNote',
                  )}
                </p>
              </div>
              {/* Cada canal se liquida como corresponde: la pasarela con el
                  brick, la transferencia con los datos bancarios y el
                  comprobante, el efectivo con la referencia que el atleta
                  muestra en el evento. Ninguno confirma el pago acá. */}
              {manualSettlement ? (
                manualSettlement.channel === 'cash_pitbull' ? (
                  <div className="account-offer__cash">
                    <p className="account-offer__cash-lead">
                      {t('account.offer.cashLead', {
                        amount: money(manualSettlement.amount, locale, manualSettlement.currency),
                      })}
                    </p>
                    {manualSettlement.reference ? (
                      <p className="account-offer__cash-reference">
                        <span>{t('account.offer.cashReference')}</span>
                        <code>{manualSettlement.reference}</code>
                      </p>
                    ) : null}
                    <p className="account-offer__fine">{t('account.offer.cashFine')}</p>
                    <ManualPaymentConfirmation
                      channel="cash_pitbull"
                      financedEntitlementsAt={manualSettlement.financedEntitlementsAt}
                      financingAllowed={manualSettlement.financingAllowed}
                      manualPaymentDeclaredAt={manualSettlement.manualPaymentDeclaredAt}
                      orderId={manualSettlement.orderId}
                      onConfirmed={() => void onOfferRefresh?.()}
                    />
                  </div>
                ) : (
                  // El recibo comparte los datos bancarios con el modal del
                  // checkout (`TransferReceipt`); `account-offer__manual` es el
                  // alcance con el que esas reglas también aplican en línea.
                  <div className="account-offer__manual">
                    <TransferReceipt
                      athlete={athlete}
                      channel={manualSettlement.channel}
                      orderId={manualSettlement.orderId}
                      purpose="competition"
                      warningId="account-offer-transfer-verify"
                      financingAllowed={manualSettlement.financingAllowed}
                      manualPaymentDeclaredAt={manualSettlement.manualPaymentDeclaredAt}
                      financedEntitlementsAt={manualSettlement.financedEntitlementsAt}
                      onConfirmed={() => void onOfferRefresh?.()}
                    />
                  </div>
                )
              ) : (
                <MercadoPagoEmbeddedCheckout
                  order={activeOrder}
                  presentation="settle"
                  onResult={handlePaymentResult}
                />
              )}
              <button
                type="button"
                className="account-offer__settle-back"
                onClick={() => setStep('review')}
              >
                <ArrowLeft size={15} aria-hidden />
                {t('account.offer.backToDetail')}
              </button>
            </div>
          ) : state.available || state.resumable ? (
            <div className="account-offer__buy">
              {state.resumable ? (
                <p className="account-offer__pending" role="status">
                  {t('account.offer.state.pending_payment')}
                </p>
              ) : (
                <div className="account-offer__entry">
                  <MotionContentSwap swapKey={editingEntry ? 'fields' : 'summary'}>
                    {editingEntry ? (
                      <fieldset className="account-offer__entry-form">
                        <legend className="account-offer__entry-legend">
                          {t('account.offer.entryLegend')}
                        </legend>
                        <p className="account-offer__entry-hint">{t('account.offer.entryHint')}</p>
                        <div className="account-offer__entry-fields">
                          <ChoiceField
                            className="account-offer__entry-choice"
                            error={entryErrors.division}
                            label={t('pages.register.division')}
                            name="division"
                            options={formOptions.division}
                            value={entry.division}
                            onChange={updateEntry}
                          />
                          <ChoiceField
                            className="account-offer__entry-choice"
                            error={entryErrors.category}
                            label={t('pages.register.category')}
                            name="category"
                            options={formOptions.category}
                            value={entry.category}
                            onChange={updateEntry}
                          />
                          <Field
                            className="account-offer__entry-weight"
                            error={entryErrors.estimatedWeight}
                            inputMode="decimal"
                            label={t('pages.register.bodyWeight')}
                            name="estimatedWeight"
                            placeholder={t('pages.register.bodyWeightPlaceholder')}
                            value={entry.estimatedWeight}
                            onChange={updateEntry}
                          />
                        </div>
                      </fieldset>
                    ) : (
                      <div className="account-offer__entry-summary">
                        <span className="account-offer__entry-legend">
                          {t('account.offer.entryLegend')}
                        </span>
                        <p className="account-offer__entry-value">
                          {[entry.division, entry.category, `${entry.estimatedWeight} kg`].join(
                            ' · ',
                          )}
                        </p>
                        <button
                          type="button"
                          className="account-offer__notice-action"
                          onClick={() => setEditingEntry(true)}
                        >
                          {t('account.offer.entryEdit')}
                        </button>
                      </div>
                    )}
                  </MotionContentSwap>
                </div>
              )}

              {/* El selector aparece sólo cuando hay algo que elegir: con un
                  único medio habilitado, un radiogroup de una opción es ruido y
                  la nota de abajo ya dice con qué se paga. */}
              {!state.resumable && channels.length > 1 ? (
                <ChoiceField
                  className="account-offer__channel"
                  label={t('account.offer.channelLegend')}
                  name="offer-payment-channel"
                  options={channels.map((option) => [option, t(`account.offer.channel.${option}`)])}
                  value={activeChannel}
                  onChange={(event) => {
                    setChannel(event.target.value)
                    setCheckoutError('')
                  }}
                />
              ) : null}

              {/* Un solo enunciado por estado: con la compra ya iniciada, el
                  aviso de arriba explica lo mismo y dos reglas doradas seguidas
                  se leen como una repetición. */}
              {checkoutOpen ? (
                state.resumable ? null : (
                  <p className="account-offer__checkout-note">
                    {t(`account.offer.checkoutNote.${copyChannel}`)}
                  </p>
                )
              ) : (
                <p className="account-offer__checkout-note" role="status">
                  {t('account.offer.checkoutClosed')}
                </p>
              )}

              <div className="account-offer__actions">
                {state.resumable ? (
                  manualSettlement || activeOrder ? (
                    <button
                      type="button"
                      className="account-offer__cta"
                      onClick={() => setStep('pay')}
                    >
                      {t('account.offer.resumeAction')}
                      <ArrowRight size={16} aria-hidden />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="account-offer__notice-action"
                      onClick={goToFullCheckout}
                    >
                      {t('account.offer.manualPendingAction')}
                    </button>
                  )
                ) : (
                  <button
                    type="button"
                    className="account-offer__cta"
                    disabled={payDisabled}
                    onClick={payHere}
                  >
                    {submitting ? (
                      <LoaderCircle className="is-spinning" size={16} aria-hidden />
                    ) : null}
                    {submitting ? t('common.loading') : t(`account.offer.cta.${copyChannel}`)}
                    {submitting ? null : <ArrowRight size={16} aria-hidden />}
                  </button>
                )}
              </div>

              {checkoutError ? (
                <p className="account-offer__error" role="alert">
                  {checkoutError}
                </p>
              ) : null}

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
            </div>
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
        </MotionContentSwap>

        {offers.length > 1 ? (
          <p className="account-offer__fine">
            {t('account.offer.more', { count: offers.length - 1 })}
          </p>
        ) : null}
      </div>
    </section>
  )
}
