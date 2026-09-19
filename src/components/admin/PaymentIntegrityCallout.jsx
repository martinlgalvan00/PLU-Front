import { buildPaymentHealthBreakdown, tPlural } from '../../lib/paymentOpsHealth.js'

/**
 * Playbook de integridad contra Mercado Pago: desalineaciones de orden y
 * blockers agrupados por código. Vive en Auditoría, no en la cola de Cobros.
 */
export default function PaymentIntegrityCallout({
  health,
  blockers = [],
  t,
  onOpenPayments,
}) {
  const healthBreakdown = buildPaymentHealthBreakdown(health, t)
  if (healthBreakdown.length === 0 && blockers.length === 0) return null

  return (
    <section
      className="audit-payment-integrity"
      role="status"
      aria-label={t('admin.audit.paymentIntegrityAria')}
    >
      <div className="audit-payment-integrity__summary">
        <div className="audit-payment-integrity__intro">
          <h3>{t('admin.audit.paymentIntegrityTitle')}</h3>
          <span className="status-pill status-pill--warning">{t('admin.audit.healthAttention')}</span>
        </div>

        {healthBreakdown.length > 0 ? (
          <p className="audit-payment-integrity__lead">
            {t('admin.paymentOperations.healthCalloutTitle')}
            <span className="audit-payment-integrity__issues"> · {healthBreakdown.join(' · ')}</span>
          </p>
        ) : (
          <p className="audit-payment-integrity__lead">{t('admin.paymentOperations.diagnosisTitle')}</p>
        )}

        {typeof onOpenPayments === 'function' ? (
          <button type="button" className="btn btn--ghost btn--small" onClick={onOpenPayments}>
            {t('admin.audit.paymentIntegrityCta')}
          </button>
        ) : null}
      </div>

      {blockers.length > 0 ? (
        <ul className="admin-payments-ops-callout__diagnoses admin-payments-ops-callout__diagnoses--compact audit-payment-integrity__diagnoses">
          {blockers.map((item) => {
            const hasPlaybook =
              Boolean(item.cause) || (Array.isArray(item.fix) && item.fix.length > 0)
            return (
              <li key={`${item.code}-${item.cause}`}>
                <div className="admin-payments-ops-callout__diagnosis-head">
                  <span className="admin-payments-ops-callout__diagnosis-title">{item.title}</span>
                  {item.affected > 1 ? (
                    <span className="admin-payments-ops-callout__diagnosis-count">
                      {tPlural(t, 'admin.paymentOperations.diagnosisAffected', item.affected)}
                    </span>
                  ) : null}
                </div>
                {hasPlaybook ? (
                  <details className="admin-payments-ops-callout__diagnosis-more">
                    <summary>{t('admin.paymentOperations.diagnosisFix')}</summary>
                    {item.cause ? (
                      <p className="admin-payments-ops-callout__diagnosis-cause">{item.cause}</p>
                    ) : null}
                    {Array.isArray(item.fix) && item.fix.length > 0 ? (
                      <ol className="admin-payments-ops-callout__diagnosis-fix">
                        {item.fix.map((step) => (
                          <li key={step}>{step}</li>
                        ))}
                      </ol>
                    ) : null}
                  </details>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
