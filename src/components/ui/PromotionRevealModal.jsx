import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowRight, KeyRound, X } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { prefersReducedMotion } from '../../motion/useReducedMotion.ts'
import { usePaymentModal } from '../checkout/usePaymentModal.js'
import '../../styles/components/promotion-reveal.css'

/**
 * Ventana de la salida. Espejo de `--motion-fast` (160ms), con 20ms de aire
 * para que el frame final de la animación llegue a pintarse antes de que el
 * padre desmonte la pieza.
 */
const EXIT_MS = 180

/**
 * PromotionRevealModal — PLU ARG
 *
 * El momento en que un código secreto se acepta. Antes ese momento era un
 * renglón que aparecía debajo del input: el nombre de la campaña en negrita, el
 * beneficio en gris, dos `small` con los medios de pago y un botón. Todo cierto
 * y todo del mismo tamaño, así que lo único que decide —qué desbloqueó— no
 * pesaba más que el resto, y las condiciones que cambian la operación (con qué
 * se paga, si puede delegar el pago y por cuánto tiempo, cuánto cupo queda) se
 * leían como notas al pie.
 *
 * La tesis: un código secreto aceptado es una emisión de la federación, no un
 * acuse de formulario. Por eso el resultado se abre en su propia pieza, con el
 * mismo material que la credencial y la banda de canje (`code-band.css`): cara
 * en degradé 158deg, filo de oro, marco interior y grano estático. El beneficio
 * es el titular; las condiciones son el registro reglado debajo; hay una sola
 * acción plena, la que lleva al checkout que lo va a cobrar.
 *
 * No hay ráfaga de papel: el confeti está reservado a los tres momentos que
 * cierran un trámite (afiliación acreditada, credencial emitida, inscripción
 * confirmada). Canjear un código abre uno, no lo cierra.
 *
 * No es una pantalla ni una ruta: no existe una URL pública de canje
 * (`promotionRedemptionSurfaces.test.js` lo fija), así que el reveal vive donde
 * vive el canje —Mi cuenta > Beneficios y los dos checkouts—.
 *
 * Salida: la pieza entraba con una secuencia de cuatro pasos y se iba en un
 * frame. Descartar es la mitad del uso —la X, `Escape`, el click afuera y "Lo
 * uso después"—, y ese corte seco desarmaba lo que la entrada había armado. Por
 * eso el descarte pasa por `requestClose`: marca la pieza como saliente, deja
 * correr los 180ms de la salida y recién entonces avisa al padre. La acción
 * plena NO pasa por ahí: `onContinue` navega o destraba el precio de abajo, y
 * el padre desmonta la pieza en el mismo tick —retrasar eso retrasaría la
 * navegación, que es lo único que el atleta pidió al apretarla—.
 *
 * @param {object} props
 * @param {string} props.code            El código, tal como lo devolvió el servidor.
 * @param {string} [props.headline]      El beneficio, ya resuelto en palabras.
 * @param {string} [props.campaignName]  Nombre de la campaña, si tiene uno propio.
 * @param {string} [props.campaignDescription] Relato de la promo, opcional.
 * @param {object} [props.payment]       Salida de `promotionPaymentPresentation`.
 * @param {number|null} [props.remaining] Cupo restante del código, si tiene tope.
 * @param {string|null} [props.expiresAt] Cierre de la ventana del código.
 * @param {string} [props.continueLabel] Etiqueta de la acción principal.
 * @param {Function} [props.onContinue]  Va al checkout que cobra el código.
 * @param {Function} props.onClose       Cierra el reveal y deja la banda con el registro.
 *                                   Se llama al terminar la salida, no al apretar.
 */
export default function PromotionRevealModal({
  code,
  headline,
  campaignName = '',
  campaignDescription = '',
  payment = null,
  remaining = null,
  expiresAt = null,
  continueLabel = '',
  onContinue,
  onClose,
}) {
  const { locale, t } = useI18n()
  const [closing, setClosing] = useState(false)
  const exitTimerRef = useRef(null)

  // Descartar: se pide la salida, no el desmonte. Con `prefers-reduced-motion`
  // no hay salida que esperar, así que cierra en el acto.
  const requestClose = useCallback(() => {
    if (exitTimerRef.current) return
    if (prefersReducedMotion()) {
      onClose()
      return
    }
    setClosing(true)
    exitTimerRef.current = setTimeout(onClose, EXIT_MS)
  }, [onClose])

  useEffect(
    () => () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current)
    },
    [],
  )

  // Foco atrapado, `Escape` para cerrar y scroll del body bloqueado: el mismo
  // hook que usan los modales de pago, en vez de un tercer trap propio. Lee
  // `onClose` de un ref en cada render, así que recibe la versión que anima.
  const panelRef = usePaymentModal(requestClose)

  // El foco inicial va al panel, no a un control.
  //
  // El hook enfoca el primer control del panel, que es la X de cerrar, y eso
  // dejaba el anillo celeste sobre el botón más chico y menos importante de la
  // pieza, compitiendo con el oro. La corrección anterior lo movió a la acción
  // plena, y en teléfono eso rompió la pieza entera: el panel es el contenedor
  // scrolleable (`max-height: 92vh`, `overflow: hidden auto`) y el navegador
  // trae a la vista lo que se enfoca, así que el reveal abría scrolleado hasta
  // los botones —sin titular, sin código y sin condiciones—. Medido en el render
  // a 390px, no deducido.
  //
  // Enfocar el panel resuelve las dos cosas: es el patrón de diálogo (el lector
  // de pantalla anuncia el nombre por `aria-labelledby`, que es el titular), no
  // hay anillo sobre ninguna acción, y como el panel ya está en scrollTop 0 no
  // se mueve nada. `tabIndex={-1}` lo deja enfocable sin entrar en el ciclo de
  // Tab: el trap que comparten los modales de pago excluye
  // `[tabindex="-1"]`, así que la primera tabulación sigue cayendo en la X.
  //
  // Este efecto corre después del hook (se declara después), así que gana sin
  // tener que cambiar el trap compartido.
  useEffect(() => {
    panelRef.current?.focus()
  }, [panelRef])

  const channels = payment?.channels?.length
    ? payment.channels
        .map((channel) => t(`secretOfferRedeemer.payment.channel.${channel}`))
        .join(' · ')
    : ''

  const terms = [
    channels && {
      key: 'payment',
      label: t('promotionReveal.terms.payment'),
      value: t(
        payment.gatewayClosed ? 'promotionReveal.paymentOnly' : 'promotionReveal.paymentWith',
        { channels },
      ),
    },
    payment?.financed && {
      key: 'financing',
      label: t('promotionReveal.terms.financing'),
      // Singular aparte: "1 días" delata la plantilla, y un plazo de un día es
      // un valor válido del panel (el mínimo es 1).
      value: payment.financingTermDays
        ? t(
            payment.financingTermDays === 1
              ? 'promotionReveal.financingWithTermOne'
              : 'promotionReveal.financingWithTerm',
            { days: payment.financingTermDays },
          )
        : t('secretOfferRedeemer.payment.financed'),
    },
    // Cero disponible no se muestra como "0 lugares": si el cupo se agotó, el
    // canje no habría sido aceptado. Sólo se dice cuando queda algo y hay tope.
    Number.isFinite(remaining) &&
      remaining > 0 && {
        key: 'remaining',
        label: t('promotionReveal.terms.remaining'),
        value: t(
          remaining === 1 ? 'promotionReveal.remainingValueOne' : 'promotionReveal.remainingValue',
          { count: remaining },
        ),
      },
    expiresAt && {
      key: 'window',
      label: t('promotionReveal.terms.window'),
      value: formatWindowDate(expiresAt, locale),
    },
  ].filter(Boolean)

  return (
    <div
      className={`promotion-reveal__overlay${closing ? ' is-closing' : ''}`}
      role="presentation"
      onMouseDown={requestClose}
    >
      <section
        ref={panelRef}
        aria-labelledby="promotion-reveal-title"
        aria-modal="true"
        className="promotion-reveal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        tabIndex={-1}
      >
        <span className="promotion-reveal__grain" aria-hidden />
        <div className="promotion-reveal__frame">
          <header className="promotion-reveal__head">
            <span className="promotion-reveal__mark">{t('promotionReveal.mark')}</span>
            <button
              type="button"
              className="promotion-reveal__close"
              onClick={requestClose}
              aria-label={t('promotionReveal.close')}
            >
              <X size={16} aria-hidden />
            </button>
          </header>

          {campaignName ? <p className="promotion-reveal__eyebrow">{campaignName}</p> : null}
          {/* El beneficio es el titular: es el dato que decide si vale la pena
              seguir al checkout. El nombre de la campaña queda arriba, en
              escala de eyebrow, porque identifica pero no decide. */}
          <h2 className="promotion-reveal__headline" id="promotion-reveal-title">
            {headline || t('secretOfferRedeemer.acceptedTitle')}
          </h2>
          {campaignDescription ? (
            <p className="promotion-reveal__lead">{campaignDescription}</p>
          ) : null}

          {/* La llave, con el tratamiento del número de socio de la credencial:
              mono, tinta de oro, tracking amplio. Es la prueba material de que
              el código es suyo. */}
          <p className="promotion-reveal__key">
            <span className="promotion-reveal__key-seal" aria-hidden>
              <KeyRound size={13} />
            </span>
            <span className="promotion-reveal__key-value">{code}</span>
          </p>

          {terms.length ? (
            <dl className="promotion-reveal__terms">
              {terms.map((term) => (
                <div className="promotion-reveal__term" key={term.key}>
                  <dt>{term.label}</dt>
                  <dd>{term.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <div className="promotion-reveal__actions">
            {onContinue ? (
              <button type="button" className="promotion-reveal__continue" onClick={onContinue}>
                {continueLabel}
                <ArrowRight size={14} aria-hidden />
              </button>
            ) : null}
            <button type="button" className="promotion-reveal__dismiss" onClick={requestClose}>
              {t('promotionReveal.later')}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

/**
 * Cierre de la ventana del código. Mes completo y no abreviado: la fecha va
 * suelta en una fila reglada, y la abreviatura cambia de forma según el ICU del
 * runtime ("sept." acá, "sep" allá).
 */
function formatWindowDate(iso, locale) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
}
