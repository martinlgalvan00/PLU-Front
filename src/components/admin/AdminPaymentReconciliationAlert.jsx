import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, X } from 'lucide-react'
import { money } from '../../lib/format.js'
import '../../styles/components/admin-reconcile.css'

const CONCEPT_LABEL = {
  membership: 'afiliación',
  registration: 'inscripción',
  combo: 'afiliación + inscripción',
}

/** Id del contenedor, en la fila de pestañas de Personas, donde vive el ícono. */
export const RECONCILE_SLOT_ID = 'admin-people-section-actions'

/**
 * Pagos aprobados (plata cobrada, athlete_payments.status = 'aprobado') sin
 * la afiliación/inscripción que deberían haber activado -- ver
 * paymentReconciliationService.findUnreconciledApprovedPayments. El origen
 * más común es un reintento que repuntó `payment_order_id` a una orden nueva
 * antes de que el webhook de la orden vieja confirmara
 * (apply_mercado_pago_payment activa por UPDATE ... where payment_order_id,
 * no por upsert). Solo lectura: no reintenta ni corrige nada, así el staff
 * decide caso por caso antes de tocar un pago real.
 *
 * Presentación: un ícono con el contador, no un bloque de página. El aviso
 * dejaba de ser lo primero que se veía de Afiliaciones/Inscripciones aunque
 * el trabajo del día fuera otro; ahora está siempre a la vista pero ocupa un
 * botón, y el detalle se abre al tocarlo. Si existe el contenedor de la fila
 * de pestañas se monta ahí (portal); si no, queda en línea sobre el listado.
 */
export default function AdminPaymentReconciliationAlert({ entries = [], onSelectAthlete }) {
  const [open, setOpen] = useState(false)
  const [slot, setSlot] = useState(null)
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const panelId = useId()

  // Layout effect: el contenedor lo pinta el padre en el mismo commit, y así el
  // ícono nace ya en la fila de pestañas, sin un parpadeo en línea.
  useLayoutEffect(() => {
    setSlot(document.getElementById(RECONCILE_SLOT_ID))
  }, [])

  // Escape cierra y devuelve el foco al ícono; un clic afuera sólo cierra.
  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    function onPointerDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  if (entries.length === 0) return null

  const title =
    entries.length === 1
      ? 'Pago cobrado sin derecho activado'
      : `${entries.length} pagos cobrados sin derechos activados`

  const control = (
    <div className="admin-reconcile" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`admin-reconcile__trigger${open ? ' is-open' : ''}`}
        aria-label={title}
        aria-expanded={open}
        aria-controls={panelId}
        title={title}
        onClick={() => setOpen((current) => !current)}
      >
        <AlertTriangle size={16} aria-hidden />
        <span className="admin-reconcile__count" aria-hidden>
          {entries.length}
        </span>
      </button>

      {open ? (
        <section id={panelId} className="admin-reconcile__panel" role="dialog" aria-label={title}>
          <header className="admin-reconcile__head">
            <div>
              <h3 className="admin-reconcile__title">{title}</h3>
              <p className="admin-reconcile__lead">
                Mercado Pago confirmó el cobro, pero la afiliación o inscripción asociada no se
                aplicó. Revisá el caso antes de activar o reembolsar.
              </p>
            </div>
            <button
              type="button"
              className="admin-reconcile__close"
              aria-label="Cerrar"
              onClick={() => {
                setOpen(false)
                triggerRef.current?.focus()
              }}
            >
              <X size={14} aria-hidden />
            </button>
          </header>

          <ul className="admin-reconcile__list">
            {entries.map((entry) => (
              <li key={entry.id} className="admin-reconcile__item">
                <div className="admin-reconcile__item-copy">
                  <span className="admin-reconcile__name">
                    {entry.athlete?.fullName ?? 'Atleta sin identificar'}
                  </span>
                  <span className="admin-reconcile__meta">
                    {money(entry.amount)} · {CONCEPT_LABEL[entry.conceptType] ?? entry.conceptType}{' '}
                    · {entry.reference}
                  </span>
                  <span className="admin-reconcile__cause">
                    {entry.missingMembership && entry.missingRegistration
                      ? 'Sin afiliación ni inscripción activa para esta orden.'
                      : entry.missingMembership
                        ? 'Sin afiliación activa para esta orden.'
                        : 'Sin inscripción confirmada para esta orden.'}
                  </span>
                </div>
                {entry.athlete && onSelectAthlete ? (
                  <button
                    type="button"
                    className="admin-reconcile__review"
                    onClick={() => onSelectAthlete(entry.athleteId)}
                  >
                    Revisar atleta
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )

  if (slot) return createPortal(control, slot)
  return <div className="admin-reconcile-inline">{control}</div>
}
