import { AlertTriangle } from 'lucide-react'
import { money } from '../../lib/format.js'

const CONCEPT_LABEL = {
  membership: 'afiliación',
  registration: 'inscripción',
  combo: 'afiliación + inscripción',
}

/**
 * Pagos aprobados (plata cobrada, athlete_payments.status = 'aprobado') sin
 * la afiliación/inscripción que deberían haber activado -- ver
 * paymentReconciliationService.findUnreconciledApprovedPayments. El origen
 * más común es un reintento que repuntó `payment_order_id` a una orden nueva
 * antes de que el webhook de la orden vieja confirmara
 * (apply_mercado_pago_payment activa por UPDATE ... where payment_order_id,
 * no por upsert). Solo lectura: no reintenta ni corrige nada, así el staff
 * decide caso por caso antes de tocar un pago real.
 */
export default function AdminPaymentReconciliationAlert({ entries = [], onSelectAthlete }) {
  if (entries.length === 0) return null

  return (
    <div className="admin-payments-ops-callout" role="status">
      <AlertTriangle size={16} aria-hidden />
      <div className="admin-payments-ops-callout__body">
        <strong>
          {entries.length === 1
            ? 'Pago cobrado sin derecho activado'
            : `${entries.length} pagos cobrados sin derechos activados`}
        </strong>
        <p>
          Mercado Pago confirmó el cobro, pero la afiliación o inscripción asociada no se aplicó.
          Revisá el caso antes de activar o reembolsar.
        </p>
        <ul className="admin-payments-ops-callout__diagnoses">
          {entries.map((entry) => (
            <li key={entry.id}>
              <span className="admin-payments-ops-callout__diagnosis-title">
                {entry.athlete?.fullName ?? 'Atleta sin identificar'}
                <span className="admin-payments-ops-callout__diagnosis-count">
                  {money(entry.amount)} · {CONCEPT_LABEL[entry.conceptType] ?? entry.conceptType} ·{' '}
                  {entry.reference}
                </span>
              </span>
              <span className="admin-payments-ops-callout__diagnosis-cause">
                {entry.missingMembership && entry.missingRegistration
                  ? 'Sin afiliación ni inscripción activa para esta orden.'
                  : entry.missingMembership
                    ? 'Sin afiliación activa para esta orden.'
                    : 'Sin inscripción confirmada para esta orden.'}
              </span>
              {entry.athlete && onSelectAthlete ? (
                <button
                  type="button"
                  className="admin-payments-ops-callout__link-button"
                  onClick={() => onSelectAthlete(entry.athleteId)}
                >
                  Revisar atleta
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
