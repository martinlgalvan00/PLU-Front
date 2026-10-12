import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, m } from 'motion/react'
import { ArrowLeft, ArrowRight, Minus, Plus, X } from 'lucide-react'
import { money } from '../../lib/format.js'
import { toOrderItems } from '../../lib/shopCart.js'
import { useMotionConfig } from '../../motion/MotionProvider.tsx'
import { drawerBackdropTransition, drawerTransition } from '../../motion/variants.ts'
import {
  createShopOrder,
  fetchShopCheckout,
  SHOP_PAYMENT_METHODS,
  startShopPayment,
} from '../../services/shopOrderService.js'
import ShopOrderPanel from './ShopOrderPanel.jsx'

function formatCourseDate(value, locale) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'long',
  })
}

function CartNotes({ notes, onDismiss, locale, t }) {
  if (notes.length === 0) return null
  const k = 'pages.shop.checkout.cart'
  return (
    <div className="shop-bag__notes" role="status">
      <ul>
        {notes.map((note, index) => (
          <li key={`${note.type}-${note.title}-${index}`}>
            {note.type === 'price'
              ? t(`${k}.notePrice`, { title: note.title, price: money(note.to, locale) })
              : note.sizeLabel
                ? t(`${k}.noteUnavailableSize`, { title: note.title, size: note.sizeLabel })
                : t(`${k}.noteUnavailable`, { title: note.title })}
          </li>
        ))}
      </ul>
      <button type="button" className="shop-link" onClick={onDismiss}>
        {t(`${k}.noteDismiss`)}
      </button>
    </div>
  )
}

function CartView({ cart, locale, onContinue, t }) {
  const k = 'pages.shop.checkout.cart'
  if (cart.lines.length === 0) {
    return (
      <div className="shop-bag__empty">
        <CartNotes notes={cart.notes} onDismiss={cart.dismissNotes} locale={locale} t={t} />
        <p>{t(`${k}.empty`)}</p>
        <p className="shop-bag__hint">{t(`${k}.emptyHint`)}</p>
      </div>
    )
  }
  return (
    <>
      <CartNotes notes={cart.notes} onDismiss={cart.dismissNotes} locale={locale} t={t} />
      <ul className="shop-bag__lines">
        {cart.lines.map((line) => (
          <li key={line.key} className="shop-bag__line">
            <span className="shop-bag__thumb" aria-hidden>
              {line.imageUrl ? <img src={line.imageUrl} alt="" loading="lazy" /> : null}
            </span>
            <div className="shop-bag__info">
              <strong>{line.title}</strong>
              <span className="shop-bag__meta">
                {line.sizeLabel
                  ? t(`${k}.size`, { size: line.sizeLabel })
                  : line.category === 'course' && line.courseStartsAt
                    ? t(`${k}.courseOn`, { date: formatCourseDate(line.courseStartsAt, locale) })
                    : null}
              </span>
              {line.category === 'course' ? null : (
                <div className="shop-bag__qty" role="group" aria-label={t(`${k}.quantity`)}>
                  <button
                    type="button"
                    aria-label={t(`${k}.decrease`)}
                    onClick={() => cart.setQuantity(line.key, line.quantity - 1)}
                  >
                    <Minus size={14} aria-hidden />
                  </button>
                  <output aria-live="polite">{line.quantity}</output>
                  <button
                    type="button"
                    aria-label={t(`${k}.increase`)}
                    onClick={() => cart.setQuantity(line.key, line.quantity + 1)}
                  >
                    <Plus size={14} aria-hidden />
                  </button>
                </div>
              )}
            </div>
            <div className="shop-bag__price">
              <span>{money(line.price * line.quantity, locale)}</span>
              <button
                type="button"
                className="shop-link"
                aria-label={t(`${k}.removeNamed`, { title: line.title })}
                onClick={() => cart.remove(line.key)}
              >
                {t(`${k}.remove`)}
              </button>
            </div>
          </li>
        ))}
      </ul>
      <footer className="shop-bag__foot">
        <p className="shop-bag__total">
          <span>{t(`${k}.total`)}</span>
          <strong>{money(cart.total, locale)}</strong>
        </p>
        <button type="button" className="shop-cta" onClick={onContinue}>
          <span>{t(`${k}.continue`)}</span>
          <ArrowRight size={15} aria-hidden />
        </button>
      </footer>
    </>
  )
}

function DetailsView({ cart, locale, onBack, onCreated, t }) {
  const k = 'pages.shop.checkout.details'
  const [checkout, setCheckout] = useState({ status: 'loading', data: null }) // loading | ready | error
  const [method, setMethod] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const loadCheckout = useCallback(() => {
    setCheckout({ status: 'loading', data: null })
    fetchShopCheckout()
      .then((data) => {
        setCheckout({ status: 'ready', data })
        const first = SHOP_PAYMENT_METHODS.find((entry) => data.methods?.[entry])
        setMethod((current) => (current && data.methods?.[current] ? current : (first ?? '')))
      })
      .catch(() => setCheckout({ status: 'error', data: null }))
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadCheckout()
  }, [loadCheckout])

  async function handleSubmit(event) {
    event.preventDefault()
    if (submitting || !method) return
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setError('')
    try {
      const { order, accessToken } = await createShopOrder({
        items: toOrderItems(cart.lines),
        paymentMethod: method,
        buyer: {
          name: form.get('name')?.toString().trim() ?? '',
          email: form.get('email')?.toString().trim() ?? '',
          phone: form.get('phone')?.toString().trim() || null,
          note: form.get('note')?.toString().trim() || null,
        },
      })
      cart.clear()
      // Mercado Pago: directo a pagar. Si algo falla queda el pedido con su
      // botón "Pagar", sin perder la reserva.
      if (method === 'mercado_pago') {
        try {
          const { initPoint } = await startShopPayment(order.id, accessToken)
          if (/^https:\/\//i.test(initPoint)) {
            window.location.assign(initPoint)
            return
          }
        } catch {
          // El panel del pedido ofrece reintentar.
        }
      }
      onCreated({ order, accessToken })
    } catch (submitError) {
      setError(submitError?.message || t(`${k}.error`))
      setSubmitting(false)
    }
  }

  if (checkout.status === 'loading') {
    return (
      <p className="shop-state" role="status">
        {t(`${k}.loadingMethods`)}
      </p>
    )
  }
  if (checkout.status === 'error') {
    return (
      <div className="shop-bag__empty">
        <p role="alert">{t(`${k}.methodsError`)}</p>
        <button type="button" className="shop-link" onClick={loadCheckout}>
          {t(`${k}.retry`)}
        </button>
      </div>
    )
  }
  if (!checkout.data?.open) {
    return (
      <div className="shop-bag__empty">
        <p role="status">{t(`${k}.closed`)}</p>
        <button type="button" className="shop-link" onClick={onBack}>
          {t(`${k}.backToCart`)}
        </button>
      </div>
    )
  }

  return (
    <form className="shop-bag__form" onSubmit={handleSubmit}>
      <p className="shop-bag__hint">{t(`${k}.lead`)}</p>
      <label>
        <span>{t(`${k}.name`)}</span>
        <input name="name" autoComplete="name" required minLength={2} maxLength={120} />
      </label>
      <label>
        <span>{t(`${k}.email`)}</span>
        <input name="email" type="email" autoComplete="email" required maxLength={160} />
      </label>
      <label>
        <span>{t(`${k}.phone`)}</span>
        <input name="phone" type="tel" autoComplete="tel" maxLength={40} />
      </label>
      <label>
        <span>{t(`${k}.note`)}</span>
        <input name="note" maxLength={500} placeholder={t(`${k}.notePlaceholder`)} />
      </label>

      <fieldset className="shop-bag__methods">
        <legend>{t(`${k}.method`)}</legend>
        {SHOP_PAYMENT_METHODS.filter((entry) => checkout.data.methods?.[entry]).map((entry) => (
          <label key={entry} className="shop-bag__method" data-selected={method === entry}>
            <input
              type="radio"
              name="paymentMethod"
              value={entry}
              checked={method === entry}
              onChange={() => setMethod(entry)}
            />
            <span className="shop-bag__method-copy">
              <strong>{t(`${k}.methods.${entry}.title`)}</strong>
              <small>{t(`${k}.methods.${entry}.hint`)}</small>
            </span>
          </label>
        ))}
      </fieldset>

      <p className="shop-bag__total">
        <span>{t('pages.shop.checkout.cart.total')}</span>
        <strong>{money(cart.total, locale)}</strong>
      </p>

      {error ? (
        <p className="shop-bag__error" role="alert">
          {error}{' '}
          <button type="button" className="shop-link" onClick={onBack}>
            {t(`${k}.backToCart`)}
          </button>
        </p>
      ) : null}

      <button type="submit" className="shop-cta" disabled={submitting || !method}>
        <span>{submitting ? t(`${k}.submitting`) : t(`${k}.submit`)}</span>
        {submitting ? null : <ArrowRight size={15} aria-hidden />}
      </button>
    </form>
  )
}

const TITLES = { cart: 'cart.title', details: 'details.title', order: 'order.title' }

/**
 * Cajón del pedido: carrito → datos y medio de pago → estado del pedido. El
 * servidor es quien fija precio y stock al crear el pedido; acá solo se arma la
 * lista de lo que la persona quiere.
 */
export default function ShopCartDrawer({
  cart,
  locale,
  onClose,
  open,
  orderRequest,
  onOrderRequestHandled,
  t,
}) {
  const { reducedMotion } = useMotionConfig()
  const titleId = useId()
  const panelRef = useRef(null)
  const [view, setView] = useState('cart') // cart | details | order
  const [order, setOrder] = useState(null) // { id, accessToken, initialOrder?, returnedPaymentId? }

  // Un pedido que viene de afuera (link del correo o retorno de Mercado Pago)
  // abre directo su estado.
  useEffect(() => {
    if (!open || !orderRequest) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder({
      id: orderRequest.id,
      accessToken: orderRequest.accessToken,
      returnedPaymentId: orderRequest.paymentId ?? null,
    })
    setView('order')
    onOrderRequestHandled?.()
  }, [open, orderRequest, onOrderRequestHandled])

  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    panelRef.current?.focus()
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  const startOver = useCallback(() => {
    setOrder(null)
    setView('cart')
  }, [])

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <m.button
            type="button"
            className="shop-drawer__backdrop"
            aria-label={t('pages.shop.checkout.close')}
            onClick={onClose}
            initial={reducedMotion ? false : 'hidden'}
            animate="visible"
            exit="exit"
            variants={drawerBackdropTransition}
          />
          <m.aside
            ref={panelRef}
            tabIndex={-1}
            className="shop-bag"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={reducedMotion ? false : 'hidden'}
            animate="visible"
            exit="exit"
            variants={drawerTransition}
          >
            <header className="shop-bag__head">
              {view === 'details' ? (
                <button
                  type="button"
                  className="shop-bag__back"
                  aria-label={t('pages.shop.checkout.back')}
                  onClick={() => setView('cart')}
                >
                  <ArrowLeft size={16} aria-hidden />
                </button>
              ) : null}
              <h2 id={titleId}>{t(`pages.shop.checkout.${TITLES[view]}`)}</h2>
              <button
                type="button"
                className="shop-drawer__close"
                aria-label={t('pages.shop.checkout.close')}
                onClick={onClose}
              >
                <X size={18} aria-hidden />
              </button>
            </header>

            <div className="shop-bag__body">
              {view === 'cart' ? (
                <CartView cart={cart} locale={locale} t={t} onContinue={() => setView('details')} />
              ) : null}
              {view === 'details' ? (
                <DetailsView
                  cart={cart}
                  locale={locale}
                  t={t}
                  onBack={() => setView('cart')}
                  onCreated={({ order: created, accessToken }) => {
                    setOrder({ id: created.id, accessToken, initialOrder: created })
                    setView('order')
                  }}
                />
              ) : null}
              {view === 'order' && order ? (
                <ShopOrderPanel
                  key={order.id}
                  accessToken={order.accessToken}
                  initialOrder={order.initialOrder ?? null}
                  locale={locale}
                  orderId={order.id}
                  returnedPaymentId={order.returnedPaymentId ?? null}
                  t={t}
                  onNewOrder={startOver}
                />
              ) : null}
            </div>
          </m.aside>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}
