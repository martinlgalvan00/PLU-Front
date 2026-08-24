import { useState } from 'react'
import { CheckCircle2, LoaderCircle } from 'lucide-react'
import { confirmAthleteManualPayment } from '../../services/athleteApi.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import ConfirmationSeal from '../ui/ConfirmationSeal.jsx'
import MotionContentSwap from '../../motion/MotionContentSwap.tsx'
import '../../styles/components/transfer-pay-modal.css'

/**
 * Cuánto se retiene el aviso al resto de la app cuando hubo habilitación.
 *
 * `plu:payment-updated` refresca al atleta y sus pagos, y ese refresh retira la
 * ficha de la oferta —una compra ya habilitada deja de ser una promoción
 * activa—, así que disparado en el acto desmontaba el sello a mitad de la
 * ráfaga: la persona confirmaba y aparecía en otra pestaña sin haber leído qué
 * pasó. Cubre el sello estampado (560 ms) más la ráfaga (~1,2 s). No demora
 * nada cuando no hay nada que festejar. La navegación al perfil (más abajo)
 * reusa el mismo margen: es la misma razón, aplicada a dejar la pantalla.
 */
const CELEBRATION_HOLD_MS = 2200

/**
 * `financed_payment_due_at` es un timestamptz completo, no una fecha suelta
 * como la que espera `formatShortDate` — se formatea acá en vez de forzarlo
 * por esa función.
 */
function formatDueDate(iso, locale) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date
    .toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .replace('.', '')
}

/**
 * Declaracion del atleta: deja la acreditacion exclusivamente en Finanzas.
 *
 * Con un codigo que permite delegar el pago, el aviso no es un acuse
 * administrativo: es el momento en que la persona queda afiliada e inscripta.
 * Por eso el panel no se convierte en una linea de texto sino en el mismo sello
 * que la federacion usa en sus otros cierres de tramite (`ConfirmationSeal`),
 * con la rafaga aprobada y la deuda dicha en la misma pieza — habilitar no es
 * acreditar, y el sello no puede prometer lo que no paso. Que la deuda siga
 * abierta no lo resuelve un segundo paso de "ya pagué de verdad": lo resuelve
 * el plazo (`financed_payment_due_at`) y la baja automatica si vence sin que
 * Finanzas acredite (20260922100000) — declarar sigue siendo un solo toque.
 *
 * Sin financiamiento no hay nada que cerrar: la orden queda en validacion y el
 * acuse sigue siendo la linea fria de siempre. Festejar ahi seria festejar un
 * pago que Finanzas todavia puede rechazar.
 */
export default function ManualPaymentConfirmation({
  orderId,
  channel = 'bank_transfer',
  financingAllowed = false,
  manualPaymentDeclaredAt = null,
  financedEntitlementsAt = null,
  financedPaymentDueAt = null,
  onConfirmed,
  onNavigate,
  profileTab,
}) {
  const { locale, t } = useI18n()
  const [state, setState] = useState(manualPaymentDeclaredAt ? 'confirmed' : 'idle')
  const [granted, setGranted] = useState(Boolean(financedEntitlementsAt))
  // El festejo es del hecho recien ocurrido, no del estado. Al volver a la
  // pantalla el sello sigue estampado pero el papel no vuelve a salir: una
  // rafaga que se repite en cada visita deja de ser un festejo.
  const [justHappened, setJustHappened] = useState(false)
  const [error, setError] = useState('')
  const isCash = channel === 'cash_pitbull'

  async function handleConfirm() {
    if (!orderId || state === 'loading' || state === 'confirmed') return
    setState('loading')
    setError('')
    try {
      const result = await confirmAthleteManualPayment(orderId)
      const entitlementsGranted =
        result.entitlementsGranted || Boolean(result.order?.financedEntitlementsAt)
      setGranted(entitlementsGranted)
      setJustHappened(entitlementsGranted)
      setState('confirmed')
      const notifyApp = () =>
        window.dispatchEvent(
          new CustomEvent('plu:payment-updated', {
            detail: {
              orderId,
              status: result.order?.status ?? 'validacion_manual',
              financingAllowed: result.order?.financingAllowed === true,
              manualPaymentDeclaredAt:
                result.order?.manualPaymentDeclaredAt ?? new Date().toISOString(),
              financedEntitlementsAt: result.order?.financedEntitlementsAt ?? null,
            },
          }),
        )
      // El efectivo se declara en Pitbull, no frente a la pantalla: una vez
      // habilitado no hay nada más que hacer acá, así que vuelve solo al
      // perfil — leyendo antes el sello, con el mismo margen que ya usa el
      // refresco de arriba. La transferencia se queda: ese recibo sigue
      // ofreciendo subir el comprobante en la misma pantalla.
      const goToProfile = () => {
        if (isCash) onNavigate?.('profile', profileTab ? { tab: profileTab } : undefined)
      }
      if (entitlementsGranted) {
        // El timer no se cancela al desmontar a propósito: si la persona
        // navega antes, el refresco sigue siendo necesario.
        window.setTimeout(() => {
          notifyApp()
          goToProfile()
        }, CELEBRATION_HOLD_MS)
      } else {
        notifyApp()
      }
      onConfirmed?.(result)
    } catch (confirmationError) {
      setState('error')
      setError(confirmationError?.message ?? t('payments.manualConfirmation.error'))
    }
  }

  if (!orderId) return null

  /* El paso a acuse es una transicion, no un reemplazo: lo que estaba pidiendo
     una accion pasa a estar resuelto, y el swap lo cuenta. */
  return (
    <MotionContentSwap swapKey={state === 'confirmed' ? 'settled' : 'action'}>
      {state === 'confirmed' ? (
        granted ? (
          <ConfirmationSeal
            className="manual-payment-confirmation__seal"
            variant="membership"
            eyebrow={t('payments.manualConfirmation.financedEyebrow')}
            title={t('payments.manualConfirmation.financedTitle')}
            detail={
              formatDueDate(financedPaymentDueAt, locale)
                ? t('payments.manualConfirmation.financedGrantedWithDeadline', {
                    date: formatDueDate(financedPaymentDueAt, locale),
                  })
                : t('payments.manualConfirmation.financedGranted')
            }
            celebrate={justHappened}
            celebrateKey={`financed-order-${orderId}`}
            haptic={justHappened}
          />
        ) : (
          <div
            className="manual-payment-confirmation manual-payment-confirmation--done"
            role="status"
          >
            <CheckCircle2 size={19} aria-hidden />
            <div>
              <strong>{t('payments.manualConfirmation.received')}</strong>
              <p>{t('payments.manualConfirmation.pendingReview')}</p>
            </div>
          </div>
        )
      ) : (
        <div className="manual-payment-confirmation">
          {isCash ? (
            <p className="manual-payment-confirmation__financing">
              {financingAllowed
                ? t('payments.manualConfirmation.financingHint')
                : t('payments.manualConfirmation.noFinancingHint')}
            </p>
          ) : financingAllowed ? (
            <p className="manual-payment-confirmation__financing">
              {t('payments.manualConfirmation.financingHint')}
            </p>
          ) : null}
          <button
            type="button"
            className="manual-payment-confirmation__action"
            disabled={state === 'loading'}
            onClick={() => void handleConfirm()}
          >
            {state === 'loading' ? (
              <LoaderCircle className="manual-payment-confirmation__spinner" size={18} aria-hidden />
            ) : (
              <CheckCircle2 size={18} aria-hidden />
            )}
            {t(isCash ? 'payments.manualConfirmation.cashAction' : 'payments.manualConfirmation.transferAction')}
          </button>
          <p className="manual-payment-confirmation__legal">
            {t('payments.manualConfirmation.notApproval')}
          </p>
          {error ? (
            <p className="manual-payment-confirmation__error" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </MotionContentSwap>
  )
}
