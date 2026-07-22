import { useState } from 'react'
import { ArrowRight, CalendarDays, ChevronRight, ClipboardCheck, MapPin, ShoppingBag, Ticket } from 'lucide-react'
import shopHeroPhoto from '../assets/DSC00392.jpg'
import ShopEventDrawer from '../components/ui/ShopEventDrawer.jsx'
import SpotlightCard from '../components/ui/SpotlightCard.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import TicketAvailabilityBadge from '../components/ui/TicketAvailabilityBadge.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { useTicketAvailability } from '../hooks/useTicketAvailability.js'
import { getFeaturedEvent, getUpcomingEventsByDate } from '../lib/eventNavigation.js'
import { cheapestTicketTypePrice, isTicketSalesEnabled, ticketPricingFromEvent } from '../lib/eventPricing.js'
import { money } from '../lib/format.js'
import { getPublishedShopProducts } from '../services/shopService.js'
import '../styles/pages/shop.css'

/**
 * Una card por evento publicado: nada acá está hardcodeado a un evento
 * puntual, así que un evento nuevo dado de alta en el panel de admin
 * aparece solo en esta grilla apenas se publica, sin tocar código.
 * Tocarla abre el detalle rápido (entradas + merch) en un panel lateral.
 */
function shopTicketPriceLabel(salesOpen, fromPrice, locale, t) {
  if (!salesOpen) return t('pages.shop.salesClosed')
  if (fromPrice == null) return t('pages.shop.ticketsAvailable')
  return t('pages.shop.fromPrice', { amount: money(fromPrice, locale) })
}

function ShopEventCard({ event, index, locale, onOpenDetail, t }) {
  const pricing = ticketPricingFromEvent(event)
  const fromPrice = cheapestTicketTypePrice(pricing)
  const salesOpen = isTicketSalesEnabled(event)
  const remaining = useTicketAvailability(salesOpen ? event.slug : null)

  return (
    <SpotlightCard
      as="article"
      className="shop-event-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail(event)}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
          keyEvent.preventDefault()
          onOpenDetail(event)
        }
      }}
    >
      <span className="shop-event-card__index" aria-hidden>
        {String(index + 1).padStart(2, '0')}
      </span>
      <div className="shop-event-card__head">
        <h3 className="shop-event-card__title">{event.title}</h3>
        <StatusPill value={event.status} />
      </div>
      <p className="shop-event-card__meta">
        <CalendarDays size={13} aria-hidden />
        {event.date}
        <span className="shop-event-card__meta-sep" aria-hidden>
          ·
        </span>
        <MapPin size={13} aria-hidden />
        {event.venue}
      </p>
      <TicketAvailabilityBadge remaining={remaining} />
      <div className="shop-event-card__foot">
        <p className="shop-event-card__price">{shopTicketPriceLabel(salesOpen, fromPrice, locale, t)}</p>
        <span className="shop-event-card__hint">
          {t('pages.shop.cardHint')}
          <ChevronRight size={15} aria-hidden />
        </span>
      </div>
    </SpotlightCard>
  )
}

const SHOP_CATEGORIES = [
  { id: 'tickets', labelKey: 'pages.shop.categoryTickets', icon: Ticket },
  { id: 'merch', labelKey: 'pages.shop.categoryMerch', icon: ShoppingBag },
  { id: 'registrations', labelKey: 'pages.shop.categoryRegistrations', icon: ClipboardCheck },
]

/**
 * Panel full-width cuando el departamento no tiene catálogo propio
 * (merch vacío / inscripciones). Llena el canvas en lugar de una card chica.
 */
function ShopDepartmentPanel({ icon: Icon, badge, title, titleId, text, action }) {
  return (
    <article className="shop-department-panel">
      <div className="shop-department-panel__main">
        <span className="shop-department-panel__icon" aria-hidden>
          <Icon size={22} aria-hidden />
        </span>
        <div className="shop-department-panel__copy">
          {badge ? <span className="shop-department-panel__badge">{badge}</span> : null}
          <h2 id={titleId} className="shop-department-panel__title">
            {title}
          </h2>
          <p className="shop-department-panel__text">{text}</p>
        </div>
      </div>
      {action ? (
        <button type="button" className="btn shop-department-panel__action" onClick={action.onClick}>
          {action.label}
          <ArrowRight size={15} aria-hidden />
        </button>
      ) : null}
    </article>
  )
}

function ShopProductCard({ locale, onAddToCart, product, t }) {
  const soldOut = product.stock <= 0

  return (
    <article className="shop-product-card">
      <div className="shop-product-card__media">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <ShoppingBag size={28} aria-hidden />
        )}
        {product.featured ? <span>{t('pages.shop.productFeatured')}</span> : null}
      </div>
      <div className="shop-product-card__body">
        <small>{t(`pages.shop.productCategories.${product.category}`)}</small>
        <h3>{product.title}</h3>
        <p>{product.description || t('pages.shop.productNoDescription')}</p>
      </div>
      <div className="shop-product-card__foot">
        <div>
          <strong>{money(product.price, locale)}</strong>
          <span>{soldOut ? t('pages.shop.productSoldOut') : t('pages.shop.productStock', { stock: product.stock })}</span>
        </div>
        <button type="button" className="btn shop-product-card__cta" disabled={soldOut} onClick={() => onAddToCart(product)}>
          {t('pages.shop.addToCart')}
        </button>
      </div>
    </article>
  )
}

function ShopCart({ cart, locale, onCheckout, onRemove, t }) {
  const items = Object.values(cart)
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)

  if (items.length === 0) return null

  return (
    <aside className="shop-cart" aria-label={t('pages.shop.cartAria')}>
      <div className="shop-cart__head">
        <strong>{t('pages.shop.cartTitle')}</strong>
        <span>{t('pages.shop.cartCount', { count: items.reduce((sum, item) => sum + item.quantity, 0) })}</span>
      </div>
      <ul className="shop-cart__items">
        {items.map(({ product, quantity }) => (
          <li key={product.id}>
            <span>{product.title}</span>
            <em>
              {quantity} x {money(product.price, locale)}
            </em>
            <button type="button" onClick={() => onRemove(product.id)}>
              {t('pages.shop.cartRemove')}
            </button>
          </li>
        ))}
      </ul>
      <div className="shop-cart__total">
        <span>{t('pages.shop.cartTotal')}</span>
        <strong>{money(total, locale)}</strong>
      </div>
      <button type="button" className="btn shop-cart__checkout" onClick={onCheckout}>
        {t('pages.shop.cartCheckout')}
      </button>
    </aside>
  )
}

function ShopFeaturedHero({ event, locale, onBuyTickets, onViewDetail, t }) {
  const pricing = ticketPricingFromEvent(event)
  const fromPrice = cheapestTicketTypePrice(pricing)
  const salesOpen = isTicketSalesEnabled(event)
  const remaining = useTicketAvailability(salesOpen ? event.slug : null)
  const soldOut = remaining === 0

  return (
    <section className="shop-hero-section" aria-labelledby="shop-hero-title">
      <article className="shop-hero">
        <div className="shop-hero__media" aria-hidden>
          <img
            className="shop-hero__media-img"
            src={shopHeroPhoto}
            alt=""
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        </div>
        <div className="shop-hero__atmosphere" aria-hidden />

        <div className="shop-hero__body">
          <div className="shop-hero__copy">
            <span className="shop-hero__eyebrow">{t('pages.shop.featuredEyebrow')}</span>
            <div className="shop-hero__head">
              <h2 id="shop-hero-title" className="shop-hero__title">
                {event.title}
              </h2>
              <StatusPill value={event.status} />
            </div>
            <p className="shop-hero__meta">
              <CalendarDays size={14} aria-hidden />
              {event.date}
              <span className="shop-hero__meta-sep" aria-hidden>
                ·
              </span>
              <MapPin size={14} aria-hidden />
              {event.venue}
            </p>
          </div>

          <div className="shop-hero__buy">
            <TicketAvailabilityBadge remaining={remaining} />
            <p className="shop-hero__price">{shopTicketPriceLabel(salesOpen, fromPrice, locale, t)}</p>
            <div className="shop-hero__actions">
              <button
                type="button"
                className="btn shop-hero__cta"
                disabled={!salesOpen || soldOut}
                onClick={onBuyTickets}
              >
                <Ticket size={15} aria-hidden />
                {t('pages.shop.buyTickets')}
              </button>
              <button type="button" className="btn btn--outline shop-hero__secondary-cta" onClick={onViewDetail}>
                {t('pages.shop.featuredViewDetail')}
                <ArrowRight size={14} aria-hidden />
              </button>
            </div>
          </div>
        </div>
      </article>
    </section>
  )
}

export default function ShopPage({ events = [], products = [], onNavigate }) {
  const { locale, t } = useI18n()
  const [detailEvent, setDetailEvent] = useState(null)
  const [activeCategory, setActiveCategory] = useState('tickets')
  const [cart, setCart] = useState({})
  const [checkoutDone, setCheckoutDone] = useState(false)
  const featuredEvent = getFeaturedEvent(events)
  const publishedProducts = getPublishedShopProducts(products)
  const hasLoadedProducts = products.length > 0
  const shopEvents = getUpcomingEventsByDate(events).filter(
    (event) => (event.slug ?? event.id) !== (featuredEvent?.slug ?? featuredEvent?.id),
  )
  const ticketsCount = shopEvents.length + (featuredEvent ? 1 : 0)
  const merchCount = publishedProducts.length

  function handleBuyTickets(event) {
    setDetailEvent(null)
    onNavigate('tickets', { eventSlug: event.slug ?? event.id })
  }

  function handleViewEventDetail(event) {
    setDetailEvent(null)
    if (event?.featured) {
      onNavigate('pitbull')
      return
    }
    onNavigate('events', { eventSlug: event.slug ?? event.id })
  }

  function addToCart(product) {
    setCheckoutDone(false)
    setCart((current) => {
      const currentQuantity = current[product.id]?.quantity ?? 0
      const nextQuantity = Math.min(product.stock, currentQuantity + 1)
      return {
        ...current,
        [product.id]: { product, quantity: nextQuantity },
      }
    })
  }

  function removeFromCart(productId) {
    setCart((current) => {
      const next = { ...current }
      delete next[productId]
      return next
    })
  }

  function checkoutCart() {
    setCheckoutDone(true)
    setCart({})
  }

  function categoryCount(id) {
    if (id === 'tickets' && ticketsCount > 0) return ticketsCount
    if (id === 'merch' && merchCount > 0) return merchCount
    return null
  }

  return (
    <main className="content-page shop-page">
      <header className="shop-masthead">
        <div className="shop-masthead__copy">
          <span className="shop-masthead__eyebrow">{t('pages.shop.eyebrow')}</span>
          <h1 className="shop-masthead__title">{t('pages.shop.title')}</h1>
          <p className="shop-masthead__lead">{t('pages.shop.lead')}</p>
        </div>
      </header>

      <nav className="shop-dock" aria-label={t('pages.shop.categoriesAria')}>
        <div className="shop-dock__shell">
          {SHOP_CATEGORIES.map(({ id, labelKey, icon: Icon }) => {
            const count = categoryCount(id)
            const active = activeCategory === id
            return (
              <button
                key={id}
                type="button"
                className={`shop-dock__tab${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => setActiveCategory(id)}
              >
                <Icon size={15} aria-hidden className="shop-dock__icon" />
                <span className="shop-dock__label">{t(labelKey)}</span>
                {count != null ? (
                  <span className="shop-dock__count" aria-label={t('pages.shop.dockCount', { count })}>
                    {count}
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </nav>

      <div className="shop-catalog">
        {activeCategory === 'tickets' ? (
          <div className="shop-catalog__panel" key="tickets">
            {featuredEvent ? (
              <ShopFeaturedHero
                event={featuredEvent}
                locale={locale}
                onBuyTickets={() => handleBuyTickets(featuredEvent)}
                onViewDetail={() => handleViewEventDetail(featuredEvent)}
                t={t}
              />
            ) : null}

            <section className="shop-section" aria-labelledby="shop-tickets-title">
              <div className="shop-section__header">
                <h2 id="shop-tickets-title" className="shop-section__title">
                  {t('pages.shop.ticketsHeading')}
                </h2>
                <p className="shop-section__lead">{t('pages.shop.ticketsLead')}</p>
              </div>
              {shopEvents.length > 0 ? (
                <div className="shop-events-grid">
                  {shopEvents.map((event, index) => (
                    <ShopEventCard
                      key={event.slug ?? event.id ?? event.title}
                      event={event}
                      index={index}
                      locale={locale}
                      onOpenDetail={setDetailEvent}
                      t={t}
                    />
                  ))}
                </div>
              ) : (
                <div className="shop-empty">
                  <Ticket size={22} aria-hidden />
                  <p className="shop-empty__text">{t('pages.shop.noEvents')}</p>
                </div>
              )}
            </section>
          </div>
        ) : null}

        {activeCategory === 'merch' ? (
          <section
            className="shop-section shop-department"
            aria-labelledby={
              publishedProducts.length > 0 || hasLoadedProducts ? 'shop-merch-title' : 'shop-merch-panel-title'
            }
            key="merch"
          >
            {publishedProducts.length > 0 || hasLoadedProducts ? (
              <div className="shop-section__header">
                <h2 id="shop-merch-title" className="shop-section__title">
                  {t('pages.shop.merchTitle')}
                </h2>
                <p className="shop-section__lead">{t('pages.shop.merchText')}</p>
              </div>
            ) : null}

            {publishedProducts.length > 0 ? (
              <div className="shop-merch-layout">
                <div className="shop-products-grid">
                  {publishedProducts.map((product) => (
                    <ShopProductCard
                      key={product.id}
                      locale={locale}
                      product={product}
                      t={t}
                      onAddToCart={addToCart}
                    />
                  ))}
                </div>
                <ShopCart cart={cart} locale={locale} onCheckout={checkoutCart} onRemove={removeFromCart} t={t} />
                {checkoutDone ? <p className="shop-checkout-done">{t('pages.shop.checkoutDone')}</p> : null}
              </div>
            ) : hasLoadedProducts ? (
              <div className="shop-empty shop-empty--products-pending">
                <ShoppingBag size={22} aria-hidden />
                <p className="shop-empty__text">{t('pages.shop.productsNotPublished')}</p>
              </div>
            ) : (
              <ShopDepartmentPanel
                icon={ShoppingBag}
                badge={t('pages.shop.merchSoon')}
                title={t('pages.shop.merchTitle')}
                titleId="shop-merch-panel-title"
                text={t('pages.shop.merchText')}
              />
            )}
          </section>
        ) : null}

        {activeCategory === 'registrations' ? (
          <section className="shop-section shop-department" aria-labelledby="shop-registrations-title" key="registrations">
            <ShopDepartmentPanel
              icon={ClipboardCheck}
              title={t('pages.shop.registrationsTitle')}
              titleId="shop-registrations-title"
              text={t('pages.shop.registrationsText')}
              action={{ label: t('pages.shop.registrationsAction'), onClick: () => onNavigate('events') }}
            />
          </section>
        ) : null}
      </div>

      <ShopEventDrawer
        open={Boolean(detailEvent)}
        event={detailEvent}
        locale={locale}
        onClose={() => setDetailEvent(null)}
        onBuyTickets={handleBuyTickets}
        onViewEvent={handleViewEventDetail}
        t={t}
      />
    </main>
  )
}
