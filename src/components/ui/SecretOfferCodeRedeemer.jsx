import { useEffect, useId, useState } from 'react'
import { ArrowRight, Check, KeyRound, LoaderCircle, Sparkles } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  clearPendingPromotionCode,
  normalizePromotionCode,
  promotionBenefitPresentation,
  promotionDestination,
  promotionDestinationType,
  promotionPaymentPresentation,
  promotionScarcityPresentation,
  redeemPromotionCode,
  savePendingPromotionCode,
} from '../../services/promotionCodeService.js'
import CodeScanButton from './CodeScanButton.jsx'
import PromotionRevealModal from './PromotionRevealModal.jsx'
import '../../styles/components/secret-code-redeemer.css'
import '../../styles/components/code-band.css'

/**
 * Canje universal de códigos. La UI general vive en Mi cuenta > Beneficios;
 * los checkouts de afiliación e inscripción conservan sus campos contextuales.
 *
 * Se presenta con el registro de la credencial (ver `code-band.css`): sello,
 * filo de oro, y el código en el mismo mono espaciado que el número de socio. El
 * estado del canje se dice en palabras en la ficha superior de la banda —igual
 * que un documento emitido— en vez de pintarse con color.
 *
 * El resultado aceptado NO se cuenta acá abajo. Un código secreto que se acepta
 * es el momento del canje, y como renglón bajo el input tenía el beneficio, la
 * campaña, los medios de pago y la acción todos al mismo peso: lo único que
 * decide no pesaba más que las notas al pie. Ese momento se abre en
 * `PromotionRevealModal`; al cerrarlo, la banda queda como registro —el código
 * aceptado y la acción que lleva al checkout—, con `Ver el beneficio` para
 * volver a abrirlo. Una sola instancia de cada control: nunca se ven a la vez.
 *
 * La lógica es la de siempre: el servidor resuelve qué es el código y a dónde
 * lleva (`redeemPromotionCode`), y acá sólo se refleja.
 */
export default function SecretOfferCodeRedeemer({
  session = null,
  onNavigate,
  className = '',
  defaultOpen = false,
  initialCode = '',
}) {
  const { t } = useI18n()
  const inputId = useId()
  const normalizedInitialCode = normalizePromotionCode(initialCode)
  const [open, setOpen] = useState(defaultOpen || Boolean(normalizedInitialCode))
  const [code, setCode] = useState(normalizedInitialCode)
  const [state, setState] = useState('idle')
  const [reason, setReason] = useState('')
  const [resolvedPromotion, setResolvedPromotion] = useState(null)
  // El reveal se abre solo al aceptarse el código y se puede volver a abrir
  // desde la banda: es un momento, no un estado del formulario.
  const [revealOpen, setRevealOpen] = useState(false)

  useEffect(() => {
    const nextCode = normalizePromotionCode(initialCode)
    if (!nextCode) return
    setCode(nextCode)
    setOpen(true)
  }, [initialCode])

  async function redeem(event) {
    event.preventDefault()
    await attemptRedeem(code)
  }

  async function attemptRedeem(rawCode) {
    const normalized = normalizePromotionCode(rawCode)
    if (!normalized || state === 'checking' || state === 'redirecting') return
    if (session?.role !== 'athlete_plu') {
      savePendingPromotionCode(normalized, { surface: 'global' })
      setState('login')
      setReason('')
      return
    }

    setState('checking')
    setReason('')
    try {
      const result = await redeemPromotionCode(normalized, { surface: 'global' })
      if (!result.accepted) {
        setReason(result.reason ?? 'not_found')
        setState('error')
        return
      }
      setCode(result.code)
      setResolvedPromotion(result)
      savePendingPromotionCode(result.code, {
        surface: 'global',
        destination: result.destination ?? null,
      })
      setState('accepted')
      setRevealOpen(true)
    } catch (error) {
      if (error?.status === 401) {
        setState('login')
        return
      }
      setReason('service_unavailable')
      setState('error')
    }
  }

  const classes = ['secret-code-redeemer', className].filter(Boolean).join(' ')
  const checking = state === 'checking'
  const settled = state === 'accepted'
  // El estado se dice, no se pinta: es la misma ficha de una credencial emitida.
  const status = checking
    ? t('codeBand.statusChecking')
    : settled
      ? t('codeBand.statusDone')
      : state === 'error'
        ? t('codeBand.statusError')
        : t('codeBand.statusIdle')
  const benefit = resolvedPromotion ? promotionBenefitPresentation(resolvedPromotion) : null
  // Con qué se paga el código que se acaba de canjear. Es parte del canje, no
  // del checkout: un código que sólo se cobra en efectivo, o que deja avisar el
  // pago, cambia lo que el atleta tiene que hacer a continuación.
  const payment = resolvedPromotion ? promotionPaymentPresentation(resolvedPromotion) : null
  const destination = resolvedPromotion ? promotionDestination(resolvedPromotion) : null
  const destinationType = resolvedPromotion ? promotionDestinationType(resolvedPromotion) : null
  const scarcity = resolvedPromotion ? promotionScarcityPresentation(resolvedPromotion) : null
  // El titular del reveal es el beneficio, que es el dato que decide si vale
  // la pena seguir al checkout. Mismo texto que ya decía la banda.
  const benefitLine = benefit
    ? t(`secretOfferRedeemer.benefit.${benefit.type}`, benefit)
    : t('secretOfferRedeemer.acceptedLead')
  const continueLabel = t(`secretOfferRedeemer.continue.${destinationType ?? 'checkout'}`)

  function resetRedeemer() {
    clearPendingPromotionCode()
    setRevealOpen(false)
    setCode('')
    setState('idle')
    setReason('')
    setResolvedPromotion(null)
  }

  return (
    <aside className={classes} aria-label={t('secretOfferRedeemer.ariaLabel')}>
      {!open ? (
        <button
          type="button"
          className="code-band-toggle secret-code-redeemer__toggle"
          aria-expanded="false"
          onClick={() => setOpen(true)}
        >
          <span className="code-band-toggle__seal" aria-hidden>
            <KeyRound size={13} />
          </span>
          {t('secretOfferRedeemer.toggle')}
        </button>
      ) : (
        <form className="secret-code-redeemer__form" onSubmit={redeem} noValidate>
          {/* Sin campo no hay label: con la llave aceptada el código es un
              registro y `htmlFor` apuntaría a un id que ya no existe. */}
          {settled ? null : (
            <label className="visually-hidden" htmlFor={inputId}>
              {t('secretOfferRedeemer.label')}
            </label>
          )}
          <div
            className={`code-band${state === 'error' ? ' code-band--error' : ''}`}
            data-state={state}
          >
            <span className="code-band__grain" aria-hidden />
            <div className="code-band__frame">
              <div className="code-band__head">
                <span className="code-band__mark">{t('codeBand.markKey')}</span>
                <span
                  className={`code-band__status${
                    settled
                      ? ' code-band__status--done'
                      : state === 'error'
                        ? ' code-band__status--error'
                        : ''
                  }`}
                  role="status"
                >
                  {status}
                </span>
              </div>
              <div className="code-band__row">
                {/* Aceptada la llave, el campo deja de ser un campo: pasa a ser
                    el registro del código. No es sólo semántica — un `<input>`
                    no envuelve, así que un código largo (`COMBO-PITBULL-INVIERNO`)
                    quedaba cortado a media palabra en un teléfono, y no hay
                    forma de leerlo. El span usa el `.code-band__code` que la
                    hoja ya tenía para este caso, con `overflow-wrap: anywhere`. */}
                {settled ? (
                  <span className="code-band__code">{code}</span>
                ) : (
                  <input
                    id={inputId}
                    className="code-band__input"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={code}
                    placeholder={t('secretOfferRedeemer.placeholder')}
                    disabled={checking}
                    onChange={(event) => {
                      setCode(event.target.value.toUpperCase())
                      if (state !== 'idle') setState('idle')
                      setReason('')
                      setResolvedPromotion(null)
                    }}
                  />
                )}
                {settled ? (
                  <Check size={18} aria-hidden className="secret-code-redeemer__seal-check" />
                ) : (
                  <>
                    <CodeScanButton
                      className="secret-code-redeemer__scan"
                      disabled={checking}
                      onScan={(scanned) => {
                        setCode(scanned)
                        void attemptRedeem(scanned)
                      }}
                    />
                    <button
                      type="submit"
                      className="code-band__chip"
                      disabled={checking || !code.trim()}
                    >
                      {checking ? (
                        <LoaderCircle className="code-band__spin" size={15} aria-hidden />
                      ) : null}
                      {checking
                        ? t('secretOfferRedeemer.checking')
                        : t('secretOfferRedeemer.apply')}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Con el reveal abierto la banda no repite nada: el detalle vive en
              la pieza de arriba y acá quedaría escondido detrás del overlay,
              duplicando controles en el DOM. */}
          {settled ? null : <p className="code-band-hint">{t('secretOfferRedeemer.hint')}</p>}

          {settled && !revealOpen ? (
            <>
              {/* Sin disco de estado: la banda de arriba ya dice "Aceptada" y
                  lleva su tilde de oro. Un círculo verde acá era un segundo
                  acento repitiendo lo mismo dos renglones más abajo. */}
              <div
                className="secret-code-redeemer__resolved code-band-record"
                role="status"
                aria-live="polite"
              >
                <span className="code-band-done">
                  <strong>
                    {resolvedPromotion?.campaign?.name || t('secretOfferRedeemer.acceptedTitle')}
                  </strong>
                  <span>{benefitLine}</span>
                  {/* Volver a abrir el detalle: los medios de pago, el plazo del
                      financiamiento y el cupo se cuentan una sola vez, en el
                      reveal, en vez de repetirse acá como notas al pie. */}
                  <button
                    type="button"
                    className="code-band-detail"
                    onClick={() => setRevealOpen(true)}
                  >
                    <Sparkles size={12} aria-hidden />
                    {t('promotionReveal.reopen')}
                  </button>
                </span>
              </div>

              <div className="secret-code-redeemer__resolved-actions code-band-record">
                {destination ? (
                  <button
                    type="button"
                    className="secret-code-redeemer__continue"
                    onClick={() => onNavigate?.(destination.view, destination.options)}
                  >
                    {continueLabel}
                    <ArrowRight size={14} aria-hidden />
                  </button>
                ) : null}
                <button type="button" className="code-band-drop" onClick={resetRedeemer}>
                  {t('secretOfferRedeemer.anotherCode')}
                </button>
              </div>
            </>
          ) : null}

          {state === 'login' ? (
            <p className="secret-code-redeemer__message" role="status">
              {t('secretOfferRedeemer.loginRequired')}{' '}
              <button type="button" onClick={() => onNavigate?.('login')}>
                {t('secretOfferRedeemer.loginAction')}
              </button>
            </p>
          ) : null}
          {state === 'error' ? (
            <p className="code-band-error secret-code-redeemer__message is-error" role="alert">
              {t(`secretOfferRedeemer.error.${reason}`)}
            </p>
          ) : null}

          {/* El momento del canje. Fuera del `form` no puede ir: el reveal no
              tiene inputs y su acción principal navega, así que no hay submit
              que se pueda disparar por accidente. */}
          {settled && revealOpen ? (
            <PromotionRevealModal
              campaignDescription={resolvedPromotion?.campaign?.description ?? ''}
              campaignName={resolvedPromotion?.campaign?.name ?? ''}
              code={code}
              continueLabel={continueLabel}
              expiresAt={scarcity?.expiresAt ?? null}
              headline={benefitLine}
              onClose={() => setRevealOpen(false)}
              onContinue={
                destination
                  ? () => {
                      setRevealOpen(false)
                      onNavigate?.(destination.view, destination.options)
                    }
                  : undefined
              }
              payment={payment}
              remaining={scarcity?.remaining ?? null}
            />
          ) : null}
        </form>
      )}
    </aside>
  )
}
