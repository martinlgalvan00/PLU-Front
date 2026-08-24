import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, HandCoins, Paperclip, RefreshCw, Route, ScanSearch } from 'lucide-react'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import { PaymentStateCell } from '../../components/admin/AdminStateCell.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminFilterChipGroup from '../../components/admin/AdminFilterChipGroup.jsx'
import {
  AdminIdentityCell,
  AdminMonoCell,
  AdminTableActions,
} from '../../components/admin/AdminTableCells.jsx'
import ErrorState from '../../components/ui/ErrorState.jsx'
import TableSkeleton from '../../components/ui/TableSkeleton.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { PAYMENT_METHODS } from '../../lib/constants.js'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { money } from '../../lib/format.js'
import { formatRejectionActor } from '../../lib/paymentAudit.js'
import { derivePaymentProgress } from '../../lib/paymentProgress.js'
import { getAthletePaymentProofUrls, listAthletePaymentOrders } from '../../services/athleteApi.js'
import {
  OPEN_ORDER_STATUSES,
  buildPaymentValidationItem,
  canForceSettleOrder,
  canValidateConcept,
  canValidateManualOrder,
  hasPaymentProof,
  isCashOrder,
  isManualOrder,
  isOpenOrder,
} from '../../services/paymentValidationService.js'
import { VALIDATION_DISABLED_CODES } from '../../services/platformSettingsAdminService.js'
import { revalidatePaymentOrder } from '../../services/paymentService.js'
import PaymentValidationDialog from '../../components/admin/PaymentValidationDialog.jsx'
import PaymentTraceDialog from '../../components/admin/PaymentTraceDialog.jsx'

/**
 * AthletePaymentOrdersSection — PLU ARG
 *
 * Órdenes de afiliación e inscripción en Finanzas. Antes solo existían las de
 * entradas: para aprobar una transferencia de afiliación había que entrar
 * atleta por atleta desde el padrón, y el acceso directo del dashboard llevaba
 * a una sección que ni siquiera las renderizaba.
 *
 * `highlightOrderId` es justamente ese acceso directo: la cola de pendientes
 * pasa el id y la fila queda marcada al llegar.
 */

const STATUS_FILTERS = [
  ['pending', 'admin.athletePayments.filterPending'],
  ['validacion_manual', 'admin.athletePayments.filterManual'],
  // Combo financiado: derechos ya otorgados con la deuda abierta. Es el unico
  // grupo donde el club esta expuesto, asi que tiene su propia vista en vez de
  // quedar mezclado entre las pendientes.
  ['financed', 'admin.athletePayments.filterFinanced'],
  // Un rechazo de Mercado Pago puede ser el ultimo estado que recibimos antes
  // de una falla de webhook o retorno. Tenerlo a un click deja a la vista la
  // accion de revalidar contra el proveedor, sin mezclarlo con las ordenes que
  // realmente esperan una validacion manual.
  ['rechazado', 'admin.athletePayments.filterRejected'],
  // Mismo argumento que el filtro de arriba, pero "cancelado" tapaba motivos
  // que no tienen nada que ver entre si (checkout vencido sin que nadie
  // pagara, o una baja de afiliacion que cancela la orden a proposito). Sin
  // su propio filtro quedaban mezcladas con "todas" y nadie las miraba juntas.
  ['cancelado', 'admin.athletePayments.filterCancelled'],
  ['aprobado', 'admin.athletePayments.filterApproved'],
  ['all', 'admin.athletePayments.filterAll'],
]

/**
 * Estados de la base detras de cada chip. "Pendientes" son dos, y el filtro
 * viaja a la consulta en vez de descartarse en el navegador: quien mira
 * pendientes no necesita que le lleguen todas las aprobadas de la temporada.
 */
const DB_STATUSES_BY_FILTER = Object.freeze({
  pending: ['pendiente', 'validacion_manual'],
  validacion_manual: ['validacion_manual'],
  financed: ['pendiente', 'validacion_manual'],
  rechazado: ['rechazado'],
  cancelado: ['cancelado'],
  aprobado: ['aprobado'],
  all: null,
})

function formatDateTime(value, locale) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/**
 * A cuántos días del vencimiento del plazo de financiamiento está esta orden.
 * Redondea hacia arriba en días completos: "vence hoy" cuenta como 0, no
 * queda escondido entre "vence en 1 día" y "vencido hace 1 día".
 */
function financingDueInfo(dueAt, t) {
  if (!dueAt) return null
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return null
  const days = Math.ceil((due.getTime() - Date.now()) / 86_400_000)
  if (days === 0) {
    return { tone: 'warning', label: t('admin.athletePayments.financingDueToday') }
  }
  if (days === 1) {
    return { tone: 'warning', label: t('admin.athletePayments.financingDueTomorrow') }
  }
  if (days === -1) {
    return { tone: 'danger', label: t('admin.athletePayments.financingOverdueYesterday') }
  }
  if (days < 0) {
    return { tone: 'danger', label: t('admin.athletePayments.financingOverdue', { days: -days }) }
  }
  return { tone: 'info', label: t('admin.athletePayments.financingDueIn', { days }) }
}

const TOGGLE_KEY_BY_CODE = {
  [VALIDATION_DISABLED_CODES.membership]: 'membership',
  [VALIDATION_DISABLED_CODES.registration]: 'registration',
  [VALIDATION_DISABLED_CODES.ticket]: 'ticket',
}

export default function AthletePaymentOrdersSection({
  canEdit,
  canForceSettle = false,
  highlightOrderId = null,
  onApprovePayment,
  onForceSettlePayment,
  onRejectPayment,
  onSummaryChange,
  onValidationStale,
  refreshKey = 0,
  statusFilter = null,
  validationEnabled = { membership: true, registration: true, ticket: true },
}) {
  const { locale, t } = useI18n()
  const [orders, setOrders] = useState([])
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [approvingId, setApprovingId] = useState(null)
  const [reviewRow, setReviewRow] = useState(null)
  const [traceOrderId, setTraceOrderId] = useState(null)
  const [revalidatingId, setRevalidatingId] = useState(null)
  const [revalidation, setRevalidation] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [serverCounts, setServerCounts] = useState(null)
  // URLs firmadas de los comprobantes de las filas que se pueden validar,
  // pedidas en lote al cargar. Sin esto cada apertura del dialogo esperaba dos
  // llamadas antes de poder mostrar la evidencia.
  const [proofUrls, setProofUrls] = useState({})
  const loadedRef = useRef(false)

  const prefetchProofs = useCallback(async (rows) => {
    const ids = rows
      .filter((order) => canValidateManualOrder(order) && order.paymentProofPath)
      .map((order) => order.id)
    if (ids.length === 0) {
      setProofUrls({})
      return
    }
    try {
      setProofUrls(await getAthletePaymentProofUrls(ids))
    } catch {
      // Precarga best-effort: el dialogo sigue sabiendo firmar la suya.
      setProofUrls({})
    }
  }, [])

  const load = useCallback(
    async (statusFilterKey) => {
      // El esqueleto es solo para la primera carga: cambiar de chip o releer
      // despues de aprobar deja las filas en pantalla y avisa aparte, para no
      // hacer parpadear la tabla que el operador esta mirando.
      if (!loadedRef.current) setLoading(true)
      else setRefreshing(true)
      setError('')
      try {
        const result = await listAthletePaymentOrders({
          limit: 200,
          statuses: DB_STATUSES_BY_FILTER[statusFilterKey] ?? undefined,
          financed: statusFilterKey === 'financed' ? true : undefined,
          withCounts: true,
        })
        loadedRef.current = true
        setOrders(result.orders)
        if (result.counts) setServerCounts(result.counts)
        void prefetchProofs(result.orders)
      } catch (loadError) {
        setError(loadError?.message ?? t('admin.athletePayments.loadError'))
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [prefetchProofs, t],
  )

  useEffect(() => {
    void load(status)
  }, [load, status])

  // El pedido externo de refresco no puede depender de `status`: ese cambio ya
  // dispara su propia lectura arriba, y tenerlo en las dependencias hacia dos
  // consultas por cada cambio de chip.
  const statusRef = useRef(status)
  statusRef.current = status
  useEffect(() => {
    if (refreshKey === 0) return
    void load(statusRef.current)
  }, [load, refreshKey])

  useEffect(() => {
    if (statusFilter?.status == null) return
    setStatus(statusFilter.status)
  }, [statusFilter])

  useEffect(() => {
    if (!highlightOrderId || loading) return undefined
    const frame = window.requestAnimationFrame(() => {
      document.getElementById('admin-athlete-payments')?.scrollIntoView({ block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [highlightOrderId, loading])

  const counts = useMemo(() => {
    if (serverCounts) return serverCounts
    // Fallback mientras la primera lectura no volvio: cuenta lo que hay a mano.
    const open = orders.filter((order) => OPEN_ORDER_STATUSES.includes(order.status))
    return {
      pending: open.length,
      validacion_manual: orders.filter((order) => order.status === 'validacion_manual').length,
      rechazado: orders.filter((order) => order.status === 'rechazado').length,
      cancelado: orders.filter((order) => order.status === 'cancelado').length,
      aprobado: orders.filter((order) => order.status === 'aprobado').length,
      all: orders.length,
      openAmount: open.reduce((sum, order) => sum + (order.amount ?? 0), 0),
      openAmountTruncated: false,
      financed: orders.filter((order) => order.financingAllowed && order.financedEntitlementsAt)
        .length,
    }
  }, [orders, serverCounts])

  useEffect(() => {
    onSummaryChange?.({
      pending: counts.pending,
      openAmount: counts.openAmount,
      loading,
    })
  }, [counts.openAmount, counts.pending, loading, onSummaryChange])

  // Sin filtro local: la consulta ya trajo solo los estados del chip activo.
  const rows = useMemo(
    () =>
      orders.map((order) => ({
        id: order.id,
        athlete: order.athlete?.fullName ?? '—',
        document: order.athlete?.documentId ?? '—',
        concept: order.conceptLabel,
        validatable: canValidateConcept(order.concept, validationEnabled),
        amount: order.amount,
        currency: order.currency,
        method: order.method,
        manualPaymentChannel: order.manualPaymentChannel,
        status: order.status,
        reference: order.reference,
        rejectedBy: order.rejectedBy ?? null,
        rejectionReason: order.rejectionReason ?? null,
        rejectedAt: order.rejectedAt ?? null,
        cancelledBy: order.cancelledBy ?? null,
        cancellationReason: order.cancellationReason ?? null,
        cancelledAt: order.cancelledAt ?? null,
        // Mismo agregado que ya arma la ficha del atleta (AthleteDetailSection):
        // el motivo de un rechazo o una cancelacion sale de un solo lugar, para
        // que las dos pantallas no cuenten historias distintas del mismo pago.
        progress: derivePaymentProgress({ order, attempts: [] }),
        createdAt: order.createdAt,
        notes: order.notes,
        hasProof: Boolean(order.paymentProofPath),
        paymentProofPath: order.paymentProofPath ?? null,
        paymentProofUploadedAt: order.paymentProofUploadedAt,
        financingAllowed: order.financingAllowed === true,
        manualPaymentDeclaredAt: order.manualPaymentDeclaredAt ?? null,
        financedEntitlementsAt: order.financedEntitlementsAt ?? null,
        financedPaymentDueAt: order.financedPaymentDueAt ?? null,
      })),
    [orders, validationEnabled],
  )

  async function approve(orderId) {
    setApprovingId(orderId)
    setError('')
    try {
      const result = await onApprovePayment?.(orderId)
      if (result?.error) {
        setError(result.error)
        notifyError(result.error)
        // El 409 confirma que el toggle está apagado de verdad -- puede
        // haberse apagado después de que `validationEnabled` (prop) se
        // calculó. Avisamos al padre para que resincronice en vez de dejar
        // el botón habilitado hasta el próximo refresh manual.
        if (TOGGLE_KEY_BY_CODE[result.code]) onValidationStale?.(TOGGLE_KEY_BY_CODE[result.code])
        return false
      }
      // El backend ya devuelve la orden actualizada: parchear la fila en vez
      // de volver a traer las 200 evita un roundtrip completo por cada
      // aprobación (el operador suele aprobar varias seguidas).
      if (result?.order) {
        setOrders((current) =>
          current.map((order) => (order.id === orderId ? { ...order, ...result.order } : order)),
        )
      } else {
        await load(status)
      }
      notifySuccess(t('admin.toasts.paymentApproved'))
      return true
    } finally {
      setApprovingId(null)
    }
  }

  async function forceSettle(orderId, { reason, reference }) {
    setApprovingId(orderId)
    setError('')
    try {
      const result = await onForceSettlePayment?.(orderId, { reason, reference })
      if (result?.error) {
        setError(result.error)
        notifyError(result.error)
        if (TOGGLE_KEY_BY_CODE[result.code]) onValidationStale?.(TOGGLE_KEY_BY_CODE[result.code])
        return false
      }
      if (result?.order) {
        setOrders((current) =>
          current.map((order) => (order.id === orderId ? { ...order, ...result.order } : order)),
        )
      } else {
        await load(status)
      }
      return true
    } finally {
      setApprovingId(null)
    }
  }

  /**
   * Confronta la orden contra Mercado Pago y aplica lo que diga el proveedor.
   * No es una corrección a mano: si Mercado Pago no tiene un pago aprobado, el
   * estado no se mueve y el resultado lo dice.
   */
  async function revalidate(orderId) {
    setRevalidatingId(orderId)
    setError('')
    setRevalidation(null)
    try {
      const result = await revalidatePaymentOrder(orderId)
      setRevalidation({ orderId, ...result })
      if (result?.resultStatus && result.resultStatus !== result.localStatus) {
        setOrders((current) =>
          current.map((order) =>
            order.id === orderId ? { ...order, status: result.resultStatus } : order,
          ),
        )
      }
    } catch (revalidateError) {
      setError(revalidateError?.message ?? t('admin.athletePayments.revalidateError'))
    } finally {
      setRevalidatingId(null)
    }
  }

  async function reject(orderId, reason) {
    setApprovingId(orderId)
    setError('')
    try {
      const result = await onRejectPayment?.(orderId, reason)
      if (result?.error) {
        setError(result.error)
        notifyError(result.error)
        if (TOGGLE_KEY_BY_CODE[result.code]) onValidationStale?.(TOGGLE_KEY_BY_CODE[result.code])
        return false
      }
      if (result?.order) {
        setOrders((current) =>
          current.map((order) => (order.id === orderId ? { ...order, ...result.order } : order)),
        )
      } else {
        await load(status)
      }
      notifySuccess(t('admin.toasts.paymentRejected'))
      return true
    } finally {
      setApprovingId(null)
    }
  }

  // Quién cerró la orden así, para rechazos y cancelaciones por igual. El
  // motivo (qué pasó) ya lo cuenta `PaymentStateCell`; esto agrega quién
  // decidió -- sin esto una orden cerrada por un operador y una cerrada por
  // Mercado Pago se leían exactamente igual.
  function closureActorLine(row) {
    if (row.status === 'cancelado' && row.cancelledBy) {
      return t('admin.athletePayments.cancelledBy', {
        actor: formatRejectionActor(row.cancelledBy, t),
      })
    }
    if (row.status === 'rechazado' && row.rejectedBy) {
      return t('admin.athletePayments.rejectedBy', {
        actor: formatRejectionActor(row.rejectedBy, t),
      })
    }
    return null
  }

  function openReview(row, mode = 'validate') {
    setError('')
    // Mismo objeto de revisión que arma la puerta y la cola del dashboard:
    // el diálogo no puede pedir menos evidencia según desde dónde se abra.
    setReviewRow({
      ...buildPaymentValidationItem(row, {
        mode,
        athlete: { fullName: row.athlete, documentId: row.document },
        detail: `${row.concept} · ${row.reference}`,
        meta: money(row.amount, locale, row.currency),
      }),
      // Ya firmada al cargar la bandeja: el comprobante se ve al abrir.
      proofUrl: proofUrls[row.id] ?? null,
    })
  }

  return (
    <section id="admin-athlete-payments" className="admin-orders-block" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
        <AdminFilterChipGroup
          id="athlete-orders-status"
          label={t('admin.filters.status')}
          value={status}
          onChange={setStatus}
          compact
          defaultValue="all"
          omitNeutral
          allLabel={t('admin.filters.showingAll')}
          clearable
          hideEmpty
          options={STATUS_FILTERS.map(([value, key]) => [value, t(key), counts[value] ?? 0])}
        />
        <div className="admin-orders-block__actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span className="admin-orders-block__amount">
            {t(
              counts.openAmountTruncated
                ? 'admin.athletePayments.openAmountPartial'
                : 'admin.athletePayments.openAmount',
              { amount: money(counts.openAmount, locale) },
            )}
          </span>
          <button
            type="button"
            className="btn btn--secondary btn--small"
            disabled={refreshing}
            onClick={() => void load(status)}
          >
            <RefreshCw size={15} aria-hidden />
            {refreshing
              ? t('admin.athletePayments.refreshing')
              : t('admin.athletePayments.refresh')}
          </button>
        </div>
      </div>



      {error ? (
        <ErrorState
          title={t('admin.athletePayments.loadErrorTitle')}
          message={error}
          onRetry={() => void load()}
        />
      ) : null}

      {/* Resultado de la última revalidación: qué decía el panel, qué dice
          Mercado Pago y qué quedó. Es la constancia de que el estado que se ve
          ahora salió del proveedor y no de una corrección a mano. */}
      {revalidation ? (
        <div className="admin-payments-ops-callout" role="status">
          <ScanSearch size={16} aria-hidden />
          <div className="admin-payments-ops-callout__body">
            <strong>{t(`admin.athletePayments.revalidate.${revalidation.outcome}`)}</strong>
            <p>
              {t('admin.athletePayments.revalidateDetail', {
                reference: revalidation.order?.reference ?? '—',
                local: t(`status.${revalidation.localStatus}`),
                provider: revalidation.providerStatus
                  ? t(`status.${revalidation.providerStatus}`)
                  : t('admin.athletePayments.revalidateNoPayment'),
              })}
            </p>
          </div>
        </div>
      ) : null}

      {loading ? (
        <TableSkeleton rows={6} columns={8} label={t('admin.athletePayments.loading')} />
      ) : (
        <AdminDataTable
          className="admin-data-table--athlete-orders"
          getRowClassName={(row) =>
            row.id === highlightOrderId ? 'data-table__row--selected' : ''
          }
          columns={[
            {
              key: 'athlete',
              label: t('admin.columns.athlete'),
              mobile: 'primary',
              sortable: true,
              render: (row) => (
                <AdminIdentityCell accent="gold" name={row.athlete} sub={row.document} subMono />
              ),
            },
            {
              key: 'concept',
              label: t('admin.columns.concept'),
              mobile: 'default',
            },
            {
              key: 'amount',
              label: t('admin.columns.amount'),
              mobile: 'badge',
              desktop: 'numeric',
              align: 'end',
              sortable: true,
              render: (row) => (
                <span className="admin-orders-block__amount-badge">
                  {money(row.amount, locale, row.currency)}
                </span>
              ),
            },
            {
              key: 'method',
              label: t('admin.columns.method'),
              mobile: 'hidden',
              render: (row) =>
                row.manualPaymentChannel === 'cash_pitbull'
                  ? t('formOptions.payment.cashPitbull')
                  : row.manualPaymentChannel === 'wise_transfer'
                    ? t('formOptions.payment.wiseTransfer')
                    : (PAYMENT_METHODS[row.method]?.label ?? row.method),
            },
            {
              key: 'proof',
              label: t('admin.athletePayments.columnProof'),
              mobile: 'hidden',
              render: (row) => {
                if (row.method !== 'manual_link') {
                  return <span className="data-table__mono data-table__mono--empty">—</span>
                }
                if (row.manualPaymentChannel === 'cash_pitbull') {
                  return (
                    <span className="status-pill status-pill--info">
                      {t('formOptions.payment.cashPitbull')}
                    </span>
                  )
                }
                if (!row.hasProof) {
                  return (
                    <span className="status-pill status-pill--warning">
                      {t('admin.athletePayments.proofMissing')}
                    </span>
                  )
                }
                return (
                  // El comprobante se abre desde la fecha: era la única forma de
                  // verlo y no estaba a la vista. `mode: 'view'` abre el diálogo
                  // en modo lectura, sin ofrecer acreditar.
                  //
                  // Sin `style` inline: `.admin-orders-block__proof` ya está
                  // estilada como botón (borde, celeste del panel, 32px de alto
                  // táctil, hover y disabled). El inline la pisaba con
                  // `padding: 0` y `height: auto`, que además rompía el target.
                  <button
                    type="button"
                    className="admin-orders-block__proof"
                    onClick={() => openReview(row, 'view')}
                  >
                    <Paperclip size={14} aria-hidden />
                    {formatDateTime(row.paymentProofUploadedAt, locale)}
                  </button>
                )
              },
            },
            {
              key: 'createdAt',
              label: t('admin.columns.date'),
              mobile: 'default',
              sortable: true,
              defaultSort: 'desc',
              sortAccessor: (row) => row.createdAt ?? '',
              render: (row) => formatDateTime(row.createdAt, locale),
            },
            {
              key: 'reference',
              label: t('admin.columns.reference'),
              mobile: 'hidden',
              render: (row) => <AdminMonoCell>{row.reference}</AdminMonoCell>,
            },
            {
              key: 'status',
              label: t('admin.columns.status'),
              mobile: 'badge',
              render: (row) => {
                const actorLine = closureActorLine(row)
                // Sólo mientras la orden sigue abierta: una vez rechazada o
                // cancelada el plazo ya no cuenta nada, sea por vencimiento o
                // por cualquier otro motivo.
                const dueInfo =
                  row.financingAllowed &&
                  row.financedEntitlementsAt &&
                  OPEN_ORDER_STATUSES.includes(row.status)
                    ? financingDueInfo(row.financedPaymentDueAt, t)
                    : null
                return (
                  <div className="admin-orders-block__status-cell">
                    {/* Rechazada o cancelada: el badge se acompaña del motivo real
                        (sellado por la base, mismo agregado que usa la ficha del
                        atleta) en vez de una etiqueta roja sin explicación. */}
                    {row.status === 'rechazado' || row.status === 'cancelado' ? (
                      <PaymentStateCell payment={row} />
                    ) : (
                      <StatusBadge value={row.status} />
                    )}
                    {row.manualPaymentDeclaredAt ? (
                      <span className="status-pill status-pill--info">
                        {t(
                          row.financingAllowed && row.financedEntitlementsAt
                            ? 'admin.athletePayments.financedActive'
                            : 'admin.athletePayments.declared',
                        )}
                      </span>
                    ) : null}
                    {dueInfo ? (
                      <span className={`status-pill status-pill--${dueInfo.tone}`}>
                        {dueInfo.label}
                      </span>
                    ) : null}
                    {actorLine ? <p className="admin-state-cell__note">{actorLine}</p> : null}
                  </div>
                )
              },
            },
            {
              key: 'action',
              label: t('admin.columns.action'),
              mobile: 'action',
              render: (row) => (
                <AdminTableActions>
                  {/* La traza está disponible siempre, incluso sin permiso de
                      aprobación: entender por qué un cobro no acreditó es una
                      lectura, no una acción sobre la plata. */}
                  <AdminIconButton
                    icon={Route}
                    label={t('admin.paymentTrace.open')}
                    onClick={() => setTraceOrderId(row.id)}
                    variant="ghost"
                  />
                  {/* Confrontar contra el proveedor es la vía sana cuando el
                      estado que figura no coincide con la plata: no acredita
                      nada por sí sola, aplica lo que responde Mercado Pago.
                      Va antes que la acreditación manual para que sea lo
                      primero que se prueba. */}
                  {canEdit && row.method === 'mercado_pago' ? (
                    <AdminIconButton
                      disabled={revalidatingId === row.id || approvingId === row.id}
                      icon={ScanSearch}
                      label={t('admin.athletePayments.revalidate.action')}
                      onClick={() => void revalidate(row.id)}
                      variant="ghost"
                    />
                  ) : null}
                  {/* Falta el comprobante y la orden todavía espera decisión:
                      se dice, en vez de dejar un botón deshabilitado sin motivo.
                      Es la mitad que aportaba el otro lado del merge.

                      La condición sale de `paymentValidationService` y no de una
                      lista de estados escrita acá: la regla completa (Mercado
                      Pago nunca, estado abierto, comprobante salvo efectivo) ya
                      vive ahí, es la que aplica el backend, y duplicarla inline
                      es cómo empezaron a divergir las tres pantallas que ese
                      servicio unificó. */}
                  {isManualOrder(row) &&
                  isOpenOrder(row) &&
                  !isCashOrder(row) &&
                  !hasPaymentProof(row) ? (
                    <span className="status-pill status-pill--warning">
                      {t('admin.athletePayments.proofMissing')}
                    </span>
                  ) : (
                    <AdminIconButton
                      disabled={
                        !canEdit ||
                        !row.validatable ||
                        !canValidateManualOrder(row) ||
                        approvingId === row.id
                      }
                      icon={BadgeCheck}
                      label={
                        row.method === 'mercado_pago'
                          ? t('admin.athletePayments.webhookOnly')
                          : row.validatable
                            ? t('admin.actions.validate')
                            : t('admin.athletePayments.validationPaused')
                      }
                      onClick={() => openReview(row)}
                      variant="celeste"
                    />
                  )}
                  {/* Vía de excepción: sólo aparece en las órdenes que el botón
                      de validar no puede tocar (Mercado Pago, o rechazadas),
                      para que no compita con el flujo normal. */}
                  {canForceSettle && canForceSettleOrder(row) ? (
                    <AdminIconButton
                      disabled={!row.validatable || approvingId === row.id}
                      icon={HandCoins}
                      label={
                        row.validatable
                          ? t('admin.athletePayments.forceSettle')
                          : t('admin.athletePayments.validationPaused')
                      }
                      onClick={() => openReview(row, 'settle')}
                      variant="ghost"
                    />
                  ) : null}
                </AdminTableActions>
              ),
            },
          ]}
          rows={rows}
          emptyMessage={t('admin.athletePayments.empty')}
        />
      )}

      {traceOrderId ? (
        <PaymentTraceDialog orderId={traceOrderId} onClose={() => setTraceOrderId(null)} />
      ) : null}

      {reviewRow ? (
        <PaymentValidationDialog
          item={reviewRow}
          mode={reviewRow.mode ?? 'validate'}
          busy={approvingId === reviewRow.paymentId}
          error={error}
          onCancel={() => setReviewRow(null)}
          onConfirm={(settlement) => {
            const paymentId = reviewRow.paymentId
            const action =
              reviewRow.mode === 'settle' ? forceSettle(paymentId, settlement) : approve(paymentId)
            void action.then((done) => {
              if (done) setReviewRow(null)
            })
          }}
          onReject={(reason) => {
            const paymentId = reviewRow.paymentId
            void reject(paymentId, reason).then((rejected) => {
              if (rejected) setReviewRow(null)
            })
          }}
        />
      ) : null}
    </section>
  )
}
