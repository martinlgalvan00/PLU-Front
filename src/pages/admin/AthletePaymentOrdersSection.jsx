import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BadgeCheck, HandCoins, Paperclip, Route, ScanSearch } from 'lucide-react'
import AdminDataTable, { StatusBadge } from '../../components/admin/AdminDataTable.jsx'
import { PaymentStateCell } from '../../components/admin/AdminStateCell.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminFilterChipGroup from '../../components/admin/AdminFilterChipGroup.jsx'
import AdminFilterSearch from '../../components/admin/AdminFilterSearch.jsx'
import {
  AdminActionOverflow,
  AdminIdentityCell,
  AdminMonoCell,
  AdminTableActions,
} from '../../components/admin/AdminTableCells.jsx'
import ErrorState from '../../components/ui/ErrorState.jsx'
import Pill from '../../components/ui/Pill.jsx'
import TableSkeleton from '../../components/ui/TableSkeleton.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { PAYMENT_METHODS } from '../../lib/constants.js'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { money } from '../../lib/format.js'
import { formatRejectionActor } from '../../lib/paymentAudit.js'
import { derivePaymentProgress } from '../../lib/paymentProgress.js'
import { listAthletePaymentOrders } from '../../services/athleteApi.js'
import {
  OPEN_ORDER_STATUSES,
  buildPaymentValidationItem,
  canForceSettleOrder,
  canValidateConcept,
  canValidateManualOrder,
  requiresProofOverride,
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

/**
 * Filtro por canal manual: el efectivo se cobra en la puerta y no deja
 * adjunto, la transferencia se acredita contra comprobante — separarlos hace
 * que cada circuito vea sólo lo suyo.
 */
const CHANNEL_FILTERS = [
  ['all', 'admin.athletePayments.channelAll'],
  ['bank_transfer', 'admin.athletePayments.channelBankTransfer'],
  ['cash_pitbull', 'admin.athletePayments.channelCash'],
  ['wise_transfer', 'admin.athletePayments.channelWise'],
]

/**
 * Orden de la cola por vista. "Por validar" prioriza lo declarado más viejo
 * —quien avisó primero lleva más tiempo esperando—, y "Financiadas" ordena la
 * deuda por vencimiento: el riesgo del club es la que vence primero. El resto
 * conserva la cronología inversa.
 */
const SORT_BY_STATUS_FILTER = Object.freeze({
  pending: 'aging',
  validacion_manual: 'aging',
  financed: 'financing_due',
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
 * A cuántos días de calendario está el vencimiento del plazo de financiamiento.
 *
 * Se cuenta por fecha y no por múltiplos de 24 h: el plazo es un timestamptz,
 * así que dividir la diferencia por 86.400.000 corría todas las etiquetas un
 * casillero —un vencimiento de esta tarde daba `ceil(0,4) = 1` y el panel decía
 * "vence mañana", y uno de esta mañana daba `ceil(-0,4) = 0` y decía "vence
 * hoy" cuando ya estaba vencido—. Normalizar a medianoche local hace que "hoy",
 * "mañana" y "ayer" signifiquen lo que dicen para quien mira el panel.
 */
function calendarDaysUntil(due, now) {
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const to = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  // `round` y no división exacta: un cambio de horario de verano entre las dos
  // fechas deja la diferencia en 23 o 25 horas.
  return Math.round((to.getTime() - from.getTime()) / 86_400_000)
}

function financingDueInfo(dueAt, t) {
  if (!dueAt) return null
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime())) return null
  const days = calendarDaysUntil(due, new Date())
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
  const [channel, setChannel] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [approvingId, setApprovingId] = useState(null)
  const [reviewRow, setReviewRow] = useState(null)
  const [traceOrderId, setTraceOrderId] = useState(null)
  const [revalidatingId, setRevalidatingId] = useState(null)
  const [revalidation, setRevalidation] = useState(null)
  const [serverCounts, setServerCounts] = useState(null)
  const [query, setQuery] = useState('')
  // URL estable del proxy: no se precargan binarios al listar (egress).
  // El comprobante se pide recién al abrir el diálogo de validación.
  const [proofUrls, setProofUrls] = useState({})
  const loadedRef = useRef(false)

  const ensureProofUrl = useCallback(async (orderId, paymentProofPath) => {
    if (!orderId || !paymentProofPath) return null
    if (proofUrls[orderId]) return proofUrls[orderId]
    // Path estable: no hace falta firmar Storage. Si falla el GET binario,
    // el diálogo sigue mostrando el estado sin imagen.
    const url = `/api/athletes/admin/payment-orders/${orderId}/proof`
    setProofUrls((current) => ({ ...current, [orderId]: url }))
    return url
  }, [proofUrls])

  const load = useCallback(
    async (statusFilterKey, channelFilterKey = 'all') => {
      // El esqueleto es solo para la primera carga: cambiar de chip o releer
      // despues de aprobar deja las filas en pantalla, para no hacer
      // parpadear la tabla que el operador esta mirando.
      if (!loadedRef.current) setLoading(true)
      setError('')
      try {
        const result = await listAthletePaymentOrders({
          limit: 200,
          statuses: DB_STATUSES_BY_FILTER[statusFilterKey] ?? undefined,
          financed: statusFilterKey === 'financed' ? true : undefined,
          // El canal viaja a la consulta: traer los dos canales y descartar
          // en el navegador era transferencia que nadie miraba.
          channel: channelFilterKey === 'all' ? undefined : channelFilterKey,
          sort: SORT_BY_STATUS_FILTER[statusFilterKey] ?? 'recent',
          withCounts: true,
        })
        loadedRef.current = true
        setOrders(result.orders)
        if (result.counts) setServerCounts(result.counts)
        setProofUrls({})
      } catch (loadError) {
        setError(loadError?.message ?? t('admin.athletePayments.loadError'))
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  useEffect(() => {
    void load(status, channel)
  }, [load, status, channel])

  // El pedido externo de refresco no puede depender de `status`/`channel`: ese
  // cambio ya dispara su propia lectura arriba, y tenerlos en las
  // dependencias hacia dos consultas por cada cambio de chip.
  const statusRef = useRef(status)
  statusRef.current = status
  const channelRef = useRef(channel)
  channelRef.current = channel
  useEffect(() => {
    if (refreshKey === 0) return
    void load(statusRef.current, channelRef.current)
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

  // Filtro local sobre la página ya cargada: nombre, DNI o referencia.
  // No es el buscador global del shell (Ctrl+K); solo estrecha esta cola.
  const rows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    const mapped = orders.map((order) => ({
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
      paymentProofPurgedAt: order.paymentProofPurgedAt ?? null,
      financingAllowed: order.financingAllowed === true,
      manualPaymentDeclaredAt: order.manualPaymentDeclaredAt ?? null,
      financedEntitlementsAt: order.financedEntitlementsAt ?? null,
      financedPaymentDueAt: order.financedPaymentDueAt ?? null,
      discountCode: order.discountCode ?? null,
    }))
    if (!normalized) return mapped
    return mapped.filter((row) => {
      const haystack = [row.athlete, row.document, row.reference, row.concept]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
      return haystack.includes(normalized)
    })
  }, [orders, query, validationEnabled])

  async function approve(orderId, { overrideReason } = {}) {
    setApprovingId(orderId)
    setError('')
    try {
      const result = await onApprovePayment?.(orderId, { overrideReason })
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
        await load(status, channel)
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
        await load(status, channel)
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
        await load(status, channel)
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

  async function openReview(row, mode = 'validate') {
    setError('')
    const proofUrl = await ensureProofUrl(row.id, row.paymentProofPath)
    // Mismo objeto de revisión que arma la puerta y la cola del dashboard:
    // el diálogo no puede pedir menos evidencia según desde dónde se abra.
    setReviewRow({
      ...buildPaymentValidationItem(row, {
        mode,
        athlete: { fullName: row.athlete, documentId: row.document },
        detail: `${row.concept} · ${row.reference}`,
        meta: money(row.amount, locale, row.currency),
      }),
      proofUrl,
    })
  }

  return (
    <section id="admin-athlete-payments" className="admin-orders-block">
      <div className="admin-orders-block__toolbar admin-orders-block__toolbar--athlete">
        <AdminFilterSearch
          placeholder={t('admin.athletePayments.searchPlaceholder')}
          query={query}
          onQueryChange={setQuery}
        />
        <div className="admin-orders-block__toolbar-secondary">
          <div className="admin-orders-block__toolbar-facets">
            <AdminFilterChipGroup
              id="athlete-orders-status"
              label={t('admin.filters.status')}
              ariaLabel={t('admin.filters.status')}
              value={status}
              onChange={setStatus}
              compact
              defaultValue="all"
              omitNeutral
              allLabel={t('admin.filters.showingAll')}
              clearable
              hideEmpty
              options={STATUS_FILTERS.map(([value, key]) => [
                value,
                t(key),
                counts[value] ?? 0,
              ])}
            />
            <span className="admin-orders-block__facet-divider" aria-hidden="true" />
            <AdminFilterChipGroup
              id="athlete-orders-channel"
              label={t('admin.athletePayments.channelLabel')}
              ariaLabel={t('admin.athletePayments.channelLabel')}
              value={channel}
              onChange={setChannel}
              compact
              defaultValue="all"
              omitNeutral
              allLabel={t('admin.filters.showingAll')}
              clearable
              options={CHANNEL_FILTERS.map(([value, key]) => [value, t(key)])}
            />
          </div>
          <div className="admin-orders-block__summary" role="status">
            <strong className="admin-orders-block__amount-value">
              {money(counts.openAmount, locale)}
              {counts.openAmountTruncated ? '+' : ''}
            </strong>
            <span className="admin-orders-block__amount-caption">
              {t('admin.athletePayments.openAmountCaption')}
            </span>
          </div>
        </div>
      </div>

      {error ? (
        <ErrorState
          title={t('admin.athletePayments.loadErrorTitle')}
          message={error}
          onRetry={() => void load(status, channel)}
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
              render: (row) => {
                const isStaff = /^STAFF[-_]/i.test(String(row.document ?? ''))
                return (
                  <AdminIdentityCell
                    accent="gold"
                    name={row.athlete}
                    sub={isStaff ? undefined : row.document}
                    subMono={!isStaff}
                    badge={
                      isStaff ? <Pill tone="info">{t('admin.athletePayments.staffPill')}</Pill> : null
                    }
                  />
                )
              },
            },
            {
              key: 'concept',
              label: t('admin.columns.concept'),
              mobile: 'default',
            },
            {
              key: 'discountCode',
              label: t('admin.athletePayments.columnCode'),
              mobile: 'hidden',
              sortable: true,
              render: (row) => <AdminMonoCell>{row.discountCode}</AdminMonoCell>,
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
                  if (row.paymentProofPurgedAt) {
                    return (
                      <span className="status-pill status-pill--neutral">
                        {t('admin.athletePayments.proofArchived')}
                      </span>
                    )
                  }
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
                      <span className="admin-orders-block__tag">
                        {t(
                          row.financingAllowed && row.financedEntitlementsAt
                            ? 'admin.athletePayments.financedActive'
                            : 'admin.athletePayments.declared',
                        )}
                      </span>
                    ) : null}
                    {requiresProofOverride(row) ? (
                      <span className="status-pill status-pill--warning">
                        {t('admin.athletePayments.proofMissing')}
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
              className: 'data-table__column--actions',
              render: (row) => (
                <AdminTableActions className="admin-athlete-order-actions">
                  {/* Validar queda visible también sin comprobante: el diálogo
                      pide motivo de override. Traza y revalidar van al menú. */}
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
                  <AdminActionOverflow label={t('admin.actions.more')}>
                    <AdminIconButton
                      icon={Route}
                      label={t('admin.paymentTrace.open')}
                      onClick={() => setTraceOrderId(row.id)}
                      variant="ghost"
                    />
                    {canEdit && row.method === 'mercado_pago' ? (
                      <AdminIconButton
                        disabled={revalidatingId === row.id || approvingId === row.id}
                        icon={ScanSearch}
                        label={t('admin.athletePayments.revalidate.action')}
                        onClick={() => void revalidate(row.id)}
                        variant="ghost"
                      />
                    ) : null}
                  </AdminActionOverflow>
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
          onConfirm={(payload) => {
            const paymentId = reviewRow.paymentId
            const action =
              reviewRow.mode === 'settle'
                ? forceSettle(paymentId, payload)
                : approve(paymentId, payload ?? {})
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
