import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { env } from '../../config/env.js'
import { apiPost } from '../../lib/api.js'
import { money } from '../../lib/format.js'
import {
  fetchShopOrder,
  isShopOrderClosed,
  reconcileShopOrder,
  startShopPayment,
  uploadShopOrderProof,
} from '../../services/shopOrderService.js'

const POLL_MS = 8000

function formatDate(value, locale) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Una sola etiqueta de estado, la más específica que el pedido permite. */
function statusOf(order, t) {
  const s = 'pages.shop.checkout.order.status'
  if (order.fulfilledAt) return { tone: 'ok', label: t(`${s}.fulfilled`) }
  if (order.status === 'aprobado') return { tone: 'ok', label: t(`${s}.approved`) }
  if (order.status === 'cancelado') return { tone: 'muted', label: t(`${s}.cancelled`) }
  if (order.status === 'vencido') return { tone: 'muted', label: t(`${s}.expired`) }
  if (order.paymentPending) return { tone: 'wait', label: t(`${s}.processing`) }
  const byMethod = {
    mercado_pago: 'pendingMercadoPago',
    bank_transfer: 'pendingBankTransfer',
    cash_on_site: 'pendingCash',
  }
  return { tone: 'wait', label: t(`${s}.${byMethod[order.paymentMethod]}`) }
}

function CopyField({ label, value, t }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  return (
    <div className="shop-order__field">
      <dt>{label}</dt>
      <dd>
        <span>{value}</span>
        <button
          type="button"
          className="shop-order__copy"
          aria-label={`${t('pages.shop.checkout.order.copy')} ${label}`}
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1800)
            } catch {
              // Sin permiso de portapapeles el dato igual se puede seleccionar.
            }
          }}
        >
          {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
          <span>
            {copied ? t('pages.shop.checkout.order.copied') : t('pages.shop.checkout.order.copy')}
          </span>
        </button>
      </dd>
    </div>
  )
}

function ProofUpload({ accessToken, onUploaded, order, t }) {
  const [state, setState] = useState('idle') // idle | uploading | error
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const key = 'pages.shop.checkout.order'

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setState('uploading')
    setError('')
    try {
      onUploaded(await uploadShopOrderProof(order.id, accessToken, file))
      setState('idle')
    } catch (uploadError) {
      setError(uploadError?.message || t(`${key}.proofError`))
      setState('error')
    }
  }

  return (
    <section className="shop-order__block" aria-labelledby="shop-order-proof">
      <h3 id="shop-order-proof">{t(`${key}.proofTitle`)}</h3>
      {order.hasProof ? (
        <p className="shop-order__ok" role="status">
          <Check size={14} aria-hidden /> {t(`${key}.proofSent`)}
        </p>
      ) : (
        <p>{t(`${key}.proofLead`)}</p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        hidden
        onChange={handleFile}
      />
      <button
        type="button"
        className="shop-link"
        disabled={state === 'uploading'}
        onClick={() => inputRef.current?.click()}
      >
        {state === 'uploading'
          ? t(`${key}.proofUploading`)
          : order.hasProof
            ? t(`${key}.proofReplace`)
            : t(`${key}.proofUpload`)}
      </button>
      {error ? (
        <p className="shop-order__error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}

/**
 * Estado de un pedido de la tienda: qué se pidió, cómo se paga y en qué quedó.
 * Para Mercado Pago consulta al servidor (que verifica con el proveedor); acá
 * nunca se da un pago por bueno por lo que diga la URL.
 */
export default function ShopOrderPanel({
  accessToken,
  initialOrder = null,
  locale,
  onNewOrder,
  orderId,
  returnedPaymentId = null,
  t,
}) {
  const key = 'pages.shop.checkout.order'
  const [order, setOrder] = useState(initialOrder)
  const [loadState, setLoadState] = useState(initialOrder ? 'ready' : 'loading') // loading | ready | missing | error
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('') // '' | pay | verify
  const [devMock, setDevMock] = useState(false)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refresh = useCallback(
    async ({ reconcile = false } = {}) => {
      try {
        if (reconcile) {
          const result = await reconcileShopOrder(orderId, accessToken, returnedPaymentId)
          if (!mounted.current) return null
          setOrder(result.order)
          setLoadState('ready')
          return result
        }
        const fresh = await fetchShopOrder(orderId, accessToken)
        if (!mounted.current) return null
        setOrder(fresh)
        setLoadState('ready')
        return { order: fresh }
      } catch (error) {
        if (!mounted.current) return null
        if (error?.status === 403 || error?.status === 404 || error?.status === 401) {
          setLoadState('missing')
        } else if (loadState === 'loading') {
          // Un corte de red o un límite de pedidos no es un pedido inexistente.
          setLoadState('error')
        }
        return null
      }
    },
    [accessToken, loadState, orderId, returnedPaymentId],
  )

  // Primera carga: al volver de Mercado Pago se concilia con el proveedor.
  useEffect(() => {
    void refresh({ reconcile: Boolean(returnedPaymentId) })
    // Una sola vez por pedido: refresh cambia con el estado y no debe re-disparar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId])

  const waitingOnProvider =
    order?.status === 'pendiente' && order.paymentMethod === 'mercado_pago' && order.paymentPending
  useEffect(() => {
    if (!waitingOnProvider) return undefined
    const timer = window.setInterval(() => void refresh({ reconcile: true }), POLL_MS)
    return () => window.clearInterval(timer)
  }, [waitingOnProvider, refresh])

  async function handlePay() {
    setBusy('pay')
    setNotice('')
    try {
      const { initPoint } = await startShopPayment(orderId, accessToken)
      if (/^https:\/\//i.test(initPoint)) {
        window.location.assign(initPoint)
        return
      }
      // Proveedor simulado (solo desarrollo): se ofrece cerrar el circuito a mano.
      if (env.isDev) setDevMock(true)
      else setNotice(t(`${key}.payError`))
    } catch (error) {
      setNotice(error?.message || t(`${key}.payError`))
    } finally {
      if (mounted.current) setBusy('')
    }
  }

  async function handleVerify() {
    setBusy('verify')
    setNotice('')
    const result = await refresh({ reconcile: true })
    if (mounted.current) {
      if (!result || result.order?.status === 'pendiente') setNotice(t(`${key}.verifyPending`))
      setBusy('')
    }
  }

  async function handleSimulate(status) {
    setBusy('verify')
    try {
      const result = await apiPost(`/api/shop/mock/notify/${orderId}`, { accessToken, status })
      if (mounted.current) setOrder(result.order)
    } catch (error) {
      if (mounted.current) setNotice(error?.message || t(`${key}.payError`))
    } finally {
      if (mounted.current) setBusy('')
    }
  }

  if (loadState === 'loading') {
    return (
      <p className="shop-state" role="status">
        {t(`${key}.loading`)}
      </p>
    )
  }
  if (loadState === 'error' && !order) {
    return (
      <div className="shop-order">
        <p className="shop-state shop-state--error" role="alert">
          {t(`${key}.loadError`)}
        </p>
        <button
          type="button"
          className="shop-link"
          onClick={() => {
            setLoadState('loading')
            void refresh({ reconcile: Boolean(returnedPaymentId) })
          }}
        >
          {t('pages.shop.checkout.details.retry')}
        </button>
      </div>
    )
  }
  if (loadState === 'missing' || !order) {
    return (
      <div className="shop-order">
        <p className="shop-state shop-state--error" role="alert">
          {t(`${key}.notFound`)}
        </p>
        <button type="button" className="shop-link" onClick={onNewOrder}>
          {t(`${key}.newOrder`)}
        </button>
      </div>
    )
  }

  const status = statusOf(order, t)
  const closed = isShopOrderClosed(order)
  const pending = order.status === 'pendiente'
  const payment = order.payment ?? {}
  const bank = payment.bankDetails

  return (
    <div className="shop-order">
      <header className="shop-order__head">
        <p className="shop-eyebrow">{t(`${key}.reference`)}</p>
        <p className="shop-order__reference">{order.reference}</p>
        <p className={`shop-order__status shop-order__status--${status.tone}`} role="status">
          {status.label}
        </p>
      </header>

      {order.needsRefund ? (
        <p className="shop-order__notice" role="alert">
          {t(`${key}.reviewLead`)}
        </p>
      ) : null}
      {order.status === 'aprobado' ? (
        <p className="shop-order__lead">
          {order.fulfilledAt ? t(`${key}.fulfilledLead`) : t(`${key}.approvedLead`)}
        </p>
      ) : null}
      {closed ? <p className="shop-order__lead">{t(`${key}.closedLead`)}</p> : null}
      {pending && order.paymentPending ? (
        <p className="shop-order__lead">{t(`${key}.pendingPaymentLead`)}</p>
      ) : null}

      <section className="shop-order__block" aria-labelledby="shop-order-items">
        <h3 id="shop-order-items">{t(`${key}.items`)}</h3>
        <ul className="shop-order__items">
          {order.items.map((item) => (
            <li key={`${item.productId ?? item.title}-${item.sizeLabel ?? ''}`}>
              <span>
                {item.quantity} × {item.title}
                {item.sizeLabel ? (
                  <small> · {t('pages.shop.checkout.cart.size', { size: item.sizeLabel })}</small>
                ) : null}
              </span>
              <span>{money(item.unitPrice * item.quantity, locale)}</span>
            </li>
          ))}
        </ul>
        <p className="shop-order__total">
          <span>{t(`${key}.total`)}</span>
          <strong>{money(order.amount, locale)}</strong>
        </p>
        {pending ? (
          <p className="shop-order__hint">
            {t(`${key}.expiresAt`, { date: formatDate(order.expiresAt, locale) })}
          </p>
        ) : null}
      </section>

      {pending && order.paymentMethod === 'mercado_pago' ? (
        <div className="shop-order__actions">
          <button type="button" className="shop-cta" disabled={busy !== ''} onClick={handlePay}>
            <span>{busy === 'pay' ? t(`${key}.paying`) : t(`${key}.payNow`)}</span>
          </button>
          <button type="button" className="shop-link" disabled={busy !== ''} onClick={handleVerify}>
            {busy === 'verify' ? t(`${key}.verifying`) : t(`${key}.verify`)}
          </button>
        </div>
      ) : null}

      {devMock ? (
        <section className="shop-order__block shop-order__dev" aria-label={t(`${key}.devTitle`)}>
          <h3>{t(`${key}.devTitle`)}</h3>
          <p>{t(`${key}.devLead`)}</p>
          <div className="shop-order__actions">
            <button type="button" className="shop-link" onClick={() => handleSimulate('approved')}>
              {t(`${key}.devApprove`)}
            </button>
            <button type="button" className="shop-link" onClick={() => handleSimulate('rejected')}>
              {t(`${key}.devReject`)}
            </button>
          </div>
        </section>
      ) : null}

      {pending && order.paymentMethod === 'bank_transfer' ? (
        <>
          {bank ? (
            <section className="shop-order__block" aria-labelledby="shop-order-bank">
              <h3 id="shop-order-bank">{t(`${key}.transferTitle`)}</h3>
              <p>{t(`${key}.transferLead`)}</p>
              <dl className="shop-order__fields">
                <CopyField label={t(`${key}.alias`)} value={bank.alias} t={t} />
                <CopyField label={t(`${key}.cbu`)} value={bank.cbu} t={t} />
                <CopyField label={t(`${key}.holder`)} value={bank.holder} t={t} />
                <CopyField label={t(`${key}.reference`)} value={order.reference} t={t} />
              </dl>
            </section>
          ) : null}
          <ProofUpload accessToken={accessToken} order={order} t={t} onUploaded={setOrder} />
        </>
      ) : null}

      {pending && order.paymentMethod === 'cash_on_site' ? (
        <section className="shop-order__block" aria-labelledby="shop-order-cash">
          <h3 id="shop-order-cash">{t(`${key}.cashTitle`)}</h3>
          <p>{payment.cashInstructions || t(`${key}.cashDefault`)}</p>
        </section>
      ) : null}

      {payment.fulfillmentNote && !closed ? (
        <section className="shop-order__block" aria-labelledby="shop-order-fulfillment">
          <h3 id="shop-order-fulfillment">{t(`${key}.fulfillmentTitle`)}</h3>
          <p>{payment.fulfillmentNote}</p>
        </section>
      ) : null}

      {notice ? (
        <p className="shop-order__error" role="alert">
          {notice}
        </p>
      ) : null}

      {order.status !== 'pendiente' ? (
        <button type="button" className="shop-link" onClick={onNewOrder}>
          {t(`${key}.newOrder`)}
        </button>
      ) : null}
    </div>
  )
}
