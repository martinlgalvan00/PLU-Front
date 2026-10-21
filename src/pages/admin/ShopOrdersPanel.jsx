import { useCallback, useEffect, useMemo, useState } from 'react'
import Button from '../../components/ui/Button.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import {
  approveShopOrder,
  cancelShopOrder,
  fetchAdminShopOrders,
  fetchShopOrderProofUrl,
  fulfillShopOrder,
  resolveShopOrderRefund,
} from '../../services/shopService.js'
import '../../styles/pages/admin-shop-orders.css'

const FILTERS = ['all', 'pendiente', 'aprobado', 'cancelado', 'vencido']

function formatDateTime(value, locale) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Un solo estado visible: el más específico (entregado > pagado > pendiente…). */
const displayStatus = (order) => (order.fulfilledAt ? 'entregado' : order.status)

function OrderRow({ canEdit, locale, onChanged, order, t }) {
  const k = 'admin.shop.orders'
  const [confirming, setConfirming] = useState(null) // approve | cancel
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const status = displayStatus(order)
  const pending = order.status === 'pendiente'
  const canApprove =
    canEdit && order.paymentMethod !== 'mercado_pago' && (pending || order.status !== 'aprobado')
  const canCancel =
    canEdit &&
    !order.fulfilledAt &&
    (order.status === 'pendiente' ||
      (order.status === 'aprobado' && order.paymentMethod !== 'mercado_pago'))

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      onChanged(await action())
      setConfirming(null)
      setReason('')
    } catch (actionError) {
      setError(actionError?.message || t(`${k}.actionError`))
    } finally {
      setBusy(false)
    }
  }

  async function openProof() {
    setError('')
    try {
      const url = await fetchShopOrderProofUrl(order.id)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (proofError) {
      setError(proofError?.message || t(`${k}.proofError`))
    }
  }

  return (
    <li className="admin-shop-order" data-status={status}>
      <div className="admin-shop-order__identity">
        <div className="admin-shop-order__head">
          <strong className="admin-shop-order__ref">{order.reference}</strong>
          <span className="admin-shop-order__status">
            <span className="admin-shop-order__dot" aria-hidden />
            {t(`${k}.status.${status}`)}
          </span>
        </div>
        <p className="admin-shop-order__meta admin-shop-order__meta--muted">
          {t(`${k}.method.${order.paymentMethod}`)} · {t(`${k}.created`)}{' '}
          {formatDateTime(order.createdAt, locale)}
          {order.paymentPending && pending ? ` · ${t(`${k}.processing`)}` : ''}
        </p>
      </div>

      <div className="admin-shop-order__buyer">
        <p className="admin-shop-order__meta">
          {order.buyerName} · {order.buyerEmail}
          {order.buyerPhone ? ` · ${order.buyerPhone}` : ''}
        </p>
        {order.buyerNote ? (
          <p className="admin-shop-order__note">
            {t(`${k}.note`)}: {order.buyerNote}
          </p>
        ) : null}
      </div>

      <ul className="admin-shop-order__items">
        {order.items.map((item) => (
          <li key={`${item.productId ?? item.title}-${item.sizeLabel ?? ''}`}>
            {item.quantity} × {item.title}
            {item.sizeLabel ? ` · ${item.sizeLabel}` : ''}
          </li>
        ))}
      </ul>

      <p className="admin-shop-order__total">{money(order.amount, locale)}</p>

      <div className="admin-shop-order__actions">
        {order.paymentMethod === 'bank_transfer' && pending ? (
          order.hasProof ? (
            <button type="button" className="admin-shop-order__link" onClick={openProof}>
              {t(`${k}.proof`)}
            </button>
          ) : (
            <span className="admin-shop-order__muted">{t(`${k}.proofMissing`)}</span>
          )
        ) : null}

        {confirming === 'approve' ? (
          <div className="admin-shop-order__confirm" role="group">
            <p>
              {t(`${k}.approveConfirm`, {
                amount: money(order.amount, locale),
                name: order.buyerName,
              })}
            </p>
            <Button disabled={busy} onClick={() => run(() => approveShopOrder(order.id))}>
              {t(`${k}.approve`)}
            </Button>
            <button
              type="button"
              className="admin-shop-order__link"
              onClick={() => setConfirming(null)}
            >
              {t(`${k}.keep`)}
            </button>
          </div>
        ) : null}

        {confirming === 'cancel' ? (
          <div className="admin-shop-order__confirm" role="group">
            <label>
              <span className="visually-hidden">{t(`${k}.cancelReason`)}</span>
              <input
                value={reason}
                maxLength={300}
                placeholder={t(`${k}.cancelReason`)}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => run(() => cancelShopOrder(order.id, reason))}
            >
              {t(`${k}.cancelConfirm`)}
            </Button>
            <button
              type="button"
              className="admin-shop-order__link"
              onClick={() => setConfirming(null)}
            >
              {t(`${k}.keep`)}
            </button>
          </div>
        ) : null}

        {!confirming ? (
          <>
            {canApprove && pending ? (
              <Button disabled={busy} onClick={() => setConfirming('approve')}>
                {t(`${k}.approve`)}
              </Button>
            ) : null}
            {canEdit && order.status === 'aprobado' && !order.fulfilledAt ? (
              <Button disabled={busy} onClick={() => run(() => fulfillShopOrder(order.id))}>
                {t(`${k}.fulfill`)}
              </Button>
            ) : null}
            {canApprove && !pending && order.status !== 'aprobado' ? (
              <button
                type="button"
                className="admin-shop-order__link"
                onClick={() => setConfirming('approve')}
              >
                {t(`${k}.approve`)}
              </button>
            ) : null}
            {canCancel ? (
              <button
                type="button"
                className="admin-shop-order__link"
                onClick={() => setConfirming('cancel')}
              >
                {t(`${k}.cancel`)}
              </button>
            ) : null}
            {order.status === 'aprobado' &&
            order.paymentMethod === 'mercado_pago' &&
            !order.fulfilledAt ? (
              <span className="admin-shop-order__muted">{t(`${k}.mpCancelHint`)}</span>
            ) : null}
          </>
        ) : null}
      </div>

      {order.needsRefund ? (
        <p className="admin-shop-order__alert" role="alert">
          {t(`${k}.needsRefund`)}
          {canEdit ? (
            <button
              type="button"
              className="admin-shop-order__link"
              disabled={busy}
              onClick={() => run(() => resolveShopOrderRefund(order.id))}
            >
              {t(`${k}.resolveRefund`)}
            </button>
          ) : null}
        </p>
      ) : null}
      {error ? (
        <p className="admin-shop-order__alert" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  )
}

function OrdersEmpty({ lead, title }) {
  return (
    <div className="admin-shop-orders__empty">
      <p className="admin-shop-orders__empty-title">{title}</p>
      <p className="admin-shop-orders__empty-lead">{lead}</p>
    </div>
  )
}

/** Cola de pedidos de la tienda: acreditar transferencias y efectivo, entregar y cancelar. */
export default function ShopOrdersPanel({ canEdit }) {
  const { locale, t } = useI18n()
  const k = 'admin.shop.orders'
  const [orders, setOrders] = useState([])
  const [state, setState] = useState('loading') // loading | ready | error
  const [filter, setFilter] = useState('pendiente')

  const load = useCallback(async () => {
    try {
      setOrders(await fetchAdminShopOrders())
      setState('ready')
    } catch {
      setState((current) => (current === 'ready' ? current : 'error'))
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const counts = useMemo(
    () => ({
      pendiente: orders.filter((order) => order.status === 'pendiente').length,
    }),
    [orders],
  )
  const visible = useMemo(
    () => (filter === 'all' ? orders : orders.filter((order) => order.status === filter)),
    [filter, orders],
  )

  const replaceOrder = useCallback((next) => {
    if (!next?.id) return
    setOrders((current) => current.map((order) => (order.id === next.id ? next : order)))
  }, [])

  if (state === 'loading') {
    return (
      <p className="admin-shop__state" role="status">
        {t(`${k}.loading`)}
      </p>
    )
  }
  if (state === 'error') {
    return (
      <div className="admin-shop__state admin-shop__state--error" role="alert">
        <p>{t(`${k}.loadError`)}</p>
        <Button variant="outline" onClick={() => void load()}>
          {t(`${k}.retry`)}
        </Button>
      </div>
    )
  }

  return (
    <div className="admin-shop-orders">
      <div className="admin-shop-orders__bar">
        <div className="admin-shop__filters" role="group" aria-label={t(`${k}.filterAria`)}>
          {FILTERS.map((value) => (
            <button
              key={value}
              type="button"
              className={`admin-shop__filter${filter === value ? ' is-active' : ''}`}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === 'all' ? t(`${k}.filterAll`) : t(`${k}.status.${value}`)}
            </button>
          ))}
        </div>
        <p className="admin-shop__pulse" aria-live="polite">
          {t(`${k}.pendingCount`, { count: counts.pendiente })}
        </p>
      </div>

      {orders.length === 0 ? (
        <OrdersEmpty title={t(`${k}.empty`)} lead={t(`${k}.emptyLead`)} />
      ) : visible.length === 0 ? (
        <OrdersEmpty title={t(`${k}.emptyFilter`)} lead={t(`${k}.emptyLead`)} />
      ) : (
        <ul className="admin-shop-orders__list">
          {visible.map((order) => (
            <OrderRow
              key={order.id}
              canEdit={canEdit}
              locale={locale}
              order={order}
              t={t}
              onChanged={replaceOrder}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
