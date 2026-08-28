import { ArrowRight, Clock3 } from 'lucide-react'
import { computeFinancingRemaining, formatFinancingCountdown } from '../../lib/financingCountdown.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import '../../styles/components/financed-debt-notice.css'

/**
 * FinancedDebtNotice — la deuda dicha donde se ve el derecho — PLU ARG
 *
 * PLU financia: la afiliación queda activa y la inscripción confirmada antes de
 * cobrar. El problema de eso no es contable, es de pantalla — el atleta ve
 * "Afiliado" y "Inscripto" y no hay nada que le recuerde que el plazo corre y
 * que, vencido, la plataforma da de baja las dos cosas
 * (`expire_financed_payment_orders`).
 *
 * Por eso el aviso no vive en la ficha de Pagos, donde habría que ir a
 * buscarlo: vive pegado al derecho que puede perder, debajo del estado de la
 * afiliación y debajo de la inscripción. Es el mismo hecho contado dos veces
 * porque son dos derechos distintos y cada uno se mira en su propia pantalla.
 *
 * No es un error ni una alarma: mientras el plazo corra es una condición del
 * acuerdo, y el color lo dice —la nota ámbar de los pagos manuales, no el rojo,
 * que en este sistema significa peligro real—. Recién cuando el plazo venció
 * pasa a `--overdue`.
 *
 * @param {object} props
 * @param {object|null} props.payment  Orden financiada abierta, ya filtrada por
 *                                     quien la monta (habilitada y sin revocar).
 * @param {'membership'|'registration'} [props.scope] Qué derecho está sosteniendo.
 * @param {Function} [props.onSettle]  Lleva a terminar de pagar.
 */
export default function FinancedDebtNotice({ payment, scope = 'membership', onSettle }) {
  const { t } = useI18n()
  if (!payment) return null

  const remaining = computeFinancingRemaining(payment.financedPaymentDueAt)
  const countdown = remaining ? formatFinancingCountdown(remaining, t) : ''
  const overdue = remaining?.expired === true

  return (
    <div
      className={`financed-debt${overdue ? ' financed-debt--overdue' : ''}`}
      role={overdue ? 'alert' : 'status'}
    >
      <span className="financed-debt__icon" aria-hidden>
        <Clock3 size={16} />
      </span>
      <div className="financed-debt__copy">
        <strong>{t(`financedDebt.${scope}.title`)}</strong>
        <p>
          {overdue
            ? t('financedDebt.overdue')
            : countdown
              ? t('financedDebt.remaining', { countdown })
              : t('financedDebt.noDeadline')}
        </p>
      </div>
      {onSettle ? (
        <button type="button" className="financed-debt__action" onClick={onSettle}>
          {t('financedDebt.settle')}
          <ArrowRight size={14} aria-hidden />
        </button>
      ) : null}
    </div>
  )
}

/**
 * La orden financiada abierta de una lista de pagos, si hay alguna.
 *
 * Vive acá y no en cada pantalla porque las tres que lo necesitan —credencial,
 * afiliación e inscripciones— tienen que coincidir en cuál es: la más próxima a
 * vencer. Con dos abiertas, la que más urge es la que manda.
 *
 * Una orden ya aprobada no cuenta: cuando Finanzas acredita, el derecho deja de
 * ser condicional y no hay nada que avisar.
 */
export function findOpenFinancedPayment(payments = []) {
  return (
    payments
      .filter(
        (item) =>
          item?.financingAllowed &&
          item.financedEntitlementsAt &&
          !item.financedEntitlementsRevokedAt &&
          item.status !== 'aprobado',
      )
      .sort((a, b) => {
        const aDue = a.financedPaymentDueAt ? new Date(a.financedPaymentDueAt).getTime() : Infinity
        const bDue = b.financedPaymentDueAt ? new Date(b.financedPaymentDueAt).getTime() : Infinity
        return aDue - bDue
      })[0] ?? null
  )
}
