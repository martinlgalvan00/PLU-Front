/**
 * Estado de la operación en una sola franja: qué tan sano está todo, por qué si
 * no lo está, y el volumen de las últimas 24 h. Reemplaza al bento de métricas
 * plegable, a la guía siempre abierta y al callout aparte: lo primero que se
 * lee en Auditoría es "¿hay algo para resolver?", no cuatro contadores.
 */
export default function AuditStatusBand({
  breakdown,
  criticalCount,
  detailTitle,
  displayStatus,
  emailAttentionCount,
  metrics,
  pillLabel,
  pillTone,
  t,
}) {
  return (
    <section
      className={`audit-band audit-band--${displayStatus}`}
      aria-label={t('admin.audit.healthTitle')}
      aria-live="polite"
    >
      <div className="audit-band__state">
        <span className={`status-pill status-pill--${pillTone}`}>
          <span className="status-pill__dot" aria-hidden />
          <span className="status-pill__label">{pillLabel}</span>
        </span>

        {criticalCount > 0 ? (
          <p className="audit-band__line" title={detailTitle}>
            {t('admin.audit.healthCriticalLine', { count: criticalCount })}
            {breakdown ? <span className="audit-band__breakdown"> · {breakdown}</span> : null}
          </p>
        ) : emailAttentionCount > 0 ? (
          <p className="audit-band__line audit-band__line--soft">
            {t('admin.audit.healthEmailLine', { count: emailAttentionCount })}
          </p>
        ) : null}
      </div>

      <dl className="audit-band__metrics">
        {metrics.map((metric) => (
          <div key={metric.id} className={metric.soft ? 'is-soft' : undefined}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
