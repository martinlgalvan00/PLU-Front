import StatusPill from './StatusPill.jsx'

export default function PaymentStatusCard({
  amount,
  method,
  reference,
  status,
  note,
}) {
  return (
    <article className="payment-status-card surface-card">
      <header className="payment-status-card__header">
        <h3>Estado del pago</h3>
        {status && <StatusPill value={status} />}
      </header>
      <dl className="payment-status-card__grid">
        {amount && (
          <>
            <dt>Monto</dt>
            <dd>{amount}</dd>
          </>
        )}
        {method && (
          <>
            <dt>Método</dt>
            <dd>{method}</dd>
          </>
        )}
        {reference && (
          <>
            <dt>Referencia</dt>
            <dd><code>{reference}</code></dd>
          </>
        )}
      </dl>
      {note && <p className="payment-status-card__note">{note}</p>}
    </article>
  )
}
