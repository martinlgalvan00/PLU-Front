import { useState, useRef } from 'react'
import { m } from 'motion/react'
import { ArrowRight, CalendarDays, ChevronRight, GraduationCap, MapPin, ShoppingBag, Ticket } from 'lucide-react'
import shopHeroPhoto from '../assets/DSC00392-display.jpg'
import PluPageHero from '../components/layout/PluPageHero.jsx'
import ShopEventDrawer from '../components/ui/ShopEventDrawer.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import TicketAvailabilityBadge from '../components/ui/TicketAvailabilityBadge.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { useTicketAvailability } from '../hooks/useTicketAvailability.js'
import { useParallaxShift } from '../hooks/useMotion.js'
import { useMotionConfig } from '../motion/MotionProvider.tsx'
import {
  getFeaturedEvent,
  getFeaturedEventDestination,
  getUpcomingEventsByDate,
} from '../lib/eventNavigation.js'
import { cheapestTicketTypePrice, isTicketSalesEnabled, ticketPricingFromEvent } from '../lib/eventPricing.js'
import { FEATURE_KEYS, isFeatureEnabled } from '../lib/featureAvailability.js'
import { money } from '../lib/format.js'
import { getPublishedShopProducts } from '../services/shopService.js'
import LaunchInterestForm from '../components/ui/LaunchInterestForm.jsx'
import '../styles/pages/design-phase2.css'
import '../styles/pages/shop.css'

/**
 * Fila editorial por evento publicado: nada acá está hardcodeado a un evento
 * puntual, así que un evento nuevo dado de alta en el panel de admin
 * aparece solo en esta lista apenas se publica, sin tocar código.
 * Tocarla abre el detalle rápido (entradas + merch) en un panel lateral.
 */
function shopTicketPriceLabel(checkoutOpen, salesOpen, fromPrice, locale, t) {
  if (!checkoutOpen) return t('pages.shop.checkoutSoonLabel')
  if (!salesOpen) return t('pages.shop.salesClosed')
  if (fromPrice == null) return t('pages.shop.ticketsAvailable')
  return t('pages.shop.fromPrice', { amount: money(fromPrice, locale) })
}

function parseShopDateParts(dateStr = '') {
  const cleaned = String(dateStr).replace(/\./g, '').trim()
  if (!cleaned) return null
  const rangeMatch = cleaned.match(
    /^(\d{1,2})\s*[-–/]\s*(\d{1,2})\s+([A-Za-zÁÉÍÓÚÜáéíóúü]+)/u,
  )
  if (rangeMatch) {
    return {
      day: `${rangeMatch[1]}–${rangeMatch[2]}`,
      month: rangeMatch[3].slice(0, 3).toUpperCase(),
    }
  }
  const singleMatch = cleaned.match(
    /^(\d{1,2})\s*[-–/]?\s*([A-Za-zÁÉÍÓÚÜáéíóúü]+)/u,
  )
  if (singleMatch) {
    return {
      day: singleMatch[1].padStart(2, '0'),
      month: singleMatch[2].slice(0, 3).toUpperCase(),
    }
  }
  return { raw: cleaned }
}

function ShopEventCard({ event, locale, checkoutOpen, onOpenDetail, t }) {
  const pricing = ticketPricingFromEvent(event)
  const fromPrice = cheapestTicketTypePrice(pricing)
  const salesOpen = checkoutOpen && isTicketSalesEnabled(event)
  const remaining = useTicketAvailability(salesOpen ? event.slug : null)
  const dateParts = parseShopDateParts(event.date)

  const { reducedMotion } = useMotionConfig()

  return (
    <m.article
      variants={{
        hidden: reducedMotion ? {} : { opacity: 0, x: -10 },
        visible: reducedMotion ? {} : { opacity: 1, x: 0 },
      }}
      whileHover={reducedMotion ? {} : { x: 8, backgroundColor: 'color-mix(in srgb, var(--color-brand-gold) 4%, transparent)' }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={[
        'shop-event-card',
        checkoutOpen ? '' : 'shop-event-card--preview',
      ].filter(Boolean).join(' ')}
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
      <span className="shop-event-card__date" aria-label={event.date}>
        {dateParts?.day ? (
          <>
            <span className="shop-event-card__day">{dateParts.day}</span>
            <span className="shop-event-card__month">{dateParts.month}</span>
          </>
        ) : (
          <span className="shop-event-card__date-raw">{dateParts?.raw ?? event.date}</span>
        )}
      </span>
      <div className="shop-event-card__main">
        <div className="shop-event-card__head">
          <h3 className="shop-event-card__title">{event.title}</h3>
          <StatusPill value={event.status} />
        </div>
        <p className="shop-event-card__meta">{event.venue}</p>
        {salesOpen ? (
          <TicketAvailabilityBadge remaining={remaining} className="shop-event-card__availability" />
        ) : null}
      </div>
      <div className="shop-event-card__foot">
        <p className="shop-event-card__price">
          {shopTicketPriceLabel(checkoutOpen, salesOpen, fromPrice, locale, t)}
        </p>
        <span className="shop-event-card__hint">
          {checkoutOpen ? t('pages.shop.cardHint') : t('pages.shop.cardHintSoon')}
          <ArrowRight size={14} aria-hidden />
        </span>
      </div>
    </m.article>
  )
}

const SHOP_CATEGORIES = [
  { id: 'tickets', labelKey: 'pages.shop.categoryTickets', icon: Ticket },
  { id: 'merch', labelKey: 'pages.shop.categoryMerch', icon: ShoppingBag },
  { id: 'courses', labelKey: 'pages.shop.categoryCourses', icon: GraduationCap },
]

/**
 * Panel full-width cuando el departamento no tiene catálogo propio
 * (merch / cursos en «próximamente»). Composición editorial, no card de catálogo.
 */
function ShopDepartmentPanel({
  badge,
  title,
  titleId,
  text,
  sourceId,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}) {
  const { reducedMotion } = useMotionConfig()

  return (
    <m.article
      className="shop-department-panel shop-department-panel--soon"
      initial={reducedMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : { duration: 0.48, ease: [0.22, 1, 0.36, 1] }
      }
    >
      <div className="shop-department-panel__copy">
        {badge ? (
          <div className="shop-department-panel__meta">
            <span className="shop-department-panel__badge" aria-live="polite">
              <span className="shop-department-panel__badge-text">{badge}</span>
            </span>
          </div>
        ) : null}
        <h2 id={titleId} className="shop-department-panel__title">
          {title}
        </h2>
        <p className="shop-department-panel__text">{text}</p>
        {primaryLabel && onPrimary ? (
          <div className="shop-department-panel__actions">
            <button
              type="button"
              className="shop-department-panel__cta shop-department-panel__cta--primary"
              onClick={onPrimary}
            >
              <span>{primaryLabel}</span>
              <ArrowRight size={14} aria-hidden />
            </button>
            {secondaryLabel && onSecondary ? (
              <button
                type="button"
                className="shop-department-panel__cta shop-department-panel__cta--secondary"
                onClick={onSecondary}
              >
                <span>{secondaryLabel}</span>
                <ArrowRight size={13} aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}
        <LaunchInterestForm source={sourceId || 'shop_generic'} />
      </div>
    </m.article>
  )
}

function ShopProductCard({ checkoutOpen, locale, onAddToCart, product, t }) {
  const soldOut = product.stock <= 0
  const canBuy = checkoutOpen && !soldOut

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
          {checkoutOpen ? (
            <strong>{money(product.price, locale)}</strong>
          ) : (
            <strong>{t('pages.shop.checkoutSoonLabel')}</strong>
          )}
          <span>
            {!checkoutOpen
              ? t('pages.shop.merchSoon')
              : soldOut
                ? t('pages.shop.productSoldOut')
                : t('pages.shop.productStock', { stock: product.stock })}
          </span>
        </div>
        <button
          type="button"
          className="btn shop-product-card__cta"
          disabled={!canBuy}
          onClick={() => onAddToCart(product)}
        >
          {checkoutOpen ? t('pages.shop.addToCart') : t('pages.shop.checkoutSoonLabel')}
        </button>
      </div>
    </article>
  )
}

function ShopCart({ cart, locale, onCheckout, onRemove, t, open, onClose }) {
  const items = Object.values(cart)
  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)

  if (!open && items.length === 0) return null

  return (
    <>
      {open ? <div className="shop-cart-drawer__backdrop" onClick={onClose} aria-hidden /> : null}
      <aside className={`shop-cart-drawer${open ? ' is-open' : ''}`} aria-label={t('pages.shop.cartAria')}>
        <div className="shop-cart-drawer__head">
          <div className="shop-cart-drawer__head-copy">
            <strong>{t('pages.shop.cartTitle')}</strong>
            <span>{t('pages.shop.cartCount', { count: items.reduce((sum, item) => sum + item.quantity, 0) })}</span>
          </div>
          <button type="button" className="shop-cart-drawer__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>
        <div className="shop-cart-drawer__body">
          {items.length === 0 ? (
            <p className="shop-cart-drawer__empty">Tu carrito está vacío.</p>
          ) : (
            <ul className="shop-cart-drawer__items">
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
          )}
        </div>
        {items.length > 0 ? (
          <div className="shop-cart-drawer__foot">
            <div className="shop-cart-drawer__total">
              <span>{t('pages.shop.cartTotal')}</span>
              <strong>{money(total, locale)}</strong>
            </div>
            <button type="button" className="btn shop-cart-drawer__checkout" onClick={onCheckout}>
              {t('pages.shop.cartCheckout')}
            </button>
          </div>
        ) : null}
      </aside>
    </>
  )
}

function ShopFeaturedHero({ event, locale, checkoutOpen, onBuyTickets, onViewDetail, onBrowseCalendar, t }) {
  const heroRef = useRef(null)
  useParallaxShift(heroRef, { strength: 40 })

  const pricing = ticketPricingFromEvent(event)
  const fromPrice = cheapestTicketTypePrice(pricing)
  const salesOpen = checkoutOpen && isTicketSalesEnabled(event)
  const remaining = useTicketAvailability(salesOpen ? event.slug : null)
  const soldOut = remaining === 0
  const dateParts = parseShopDateParts(event.date)
  const canBuy = salesOpen && !soldOut

  return (
    <section className="shop-hero-section" aria-labelledby="shop-hero-title">
      <article
        className={[
          'shop-hero',
          checkoutOpen ? '' : 'shop-hero--preview',
        ].filter(Boolean).join(' ')}
        ref={heroRef}
      >
        <div className="shop-hero__media" aria-hidden>
          <img
            className="shop-hero__media-img"
            style={{ transform: 'translateY(var(--hero-parallax-shift, 0)) scale(1.1)', transition: 'transform 0.1s cubic-bezier(0,0,0,1)' }}
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
            {dateParts?.day ? (
              <p className="shop-hero__ledger" aria-hidden>
                <span className="shop-hero__ledger-day">{dateParts.day}</span>
                <span className="shop-hero__ledger-month">{dateParts.month}</span>
              </p>
            ) : null}

            <p className="shop-hero__price">
              {shopTicketPriceLabel(checkoutOpen, salesOpen, fromPrice, locale, t)}
            </p>

            {salesOpen ? (
              <TicketAvailabilityBadge remaining={remaining} className="shop-hero__availability" />
            ) : (
              <p className="shop-hero__soon-note">
                {checkoutOpen ? t('pages.shop.salesClosed') : t('pages.shop.checkoutSoonNote')}
              </p>
            )}
            
            {!checkoutOpen ? (
              <LaunchInterestForm source="shop_hero" eventSlug={event.slug} />
            ) : null}

            <div className="shop-hero__actions">
              {canBuy ? (
                <button
                  type="button"
                  className="btn shop-hero__cta"
                  onClick={onBuyTickets}
                >
                  <span>{t('pages.shop.buyTickets')}</span>
                  <ArrowRight size={16} aria-hidden />
                </button>
              ) : (
                <button
                  type="button"
                  className="btn shop-hero__cta shop-hero__cta--editorial"
                  onClick={onViewDetail}
                >
                  <span>{t('pages.shop.featuredViewDetail')}</span>
                  <ArrowRight size={16} aria-hidden />
                </button>
              )}
              <button
                type="button"
                className="shop-hero__secondary-cta"
                onClick={canBuy ? onViewDetail : onBrowseCalendar}
              >
                {canBuy ? t('pages.shop.featuredViewDetail') : t('pages.shop.browseCalendar')}
                <ChevronRight size={15} aria-hidden />
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
  const [cart, setCart] = useState({})
  const [checkoutDone, setCheckoutDone] = useState(false)
  const [activeCategory, setActiveCategory] = useState(SHOP_CATEGORIES[0].id)
  const [detailEvent, setDetailEvent] = useState(null)
  const [cartOpen, setCartOpen] = useState(false)
  const checkoutOpen = isFeatureEnabled(FEATURE_KEYS.paidCheckout)
  const featuredEvent = getFeaturedEvent(events)
  const publishedProducts = getPublishedShopProducts(products)
  const hasLoadedProducts = products.length > 0
  const shopEvents = getUpcomingEventsByDate(events).filter(
    (event) => (event.slug ?? event.id) !== (featuredEvent?.slug ?? featuredEvent?.id),
  )

  function addToCart(product) {
    if (!checkoutOpen) return
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
    if (!checkoutOpen) return
    setCheckoutDone(true)
    setCart({})
  }

  function handleBuyTickets(event) {
    if (!checkoutOpen) return
    setDetailEvent(null)
    onNavigate('tickets', { eventSlug: event.slug ?? event.id })
  }

  function handleViewEventDetail(event) {
    setDetailEvent(null)
    const destination = getFeaturedEventDestination({
      ...event,
      slug: event?.slug ?? event?.id,
    })
    onNavigate(destination.view, destination.options)
  }

  return (
    <main className="page page--design page--plu-ref shop-page shop-page--plu-ref">
      <PluPageHero
        className="shop-page__hero"
        breadcrumbLabel={t('pages.shop.heroBreadcrumb')}
        chapter={t('pages.shop.heroChapter')}
        description={checkoutOpen ? t('pages.shop.heroDesc') : t('pages.shop.heroDescSoon')}
        onHome={() => onNavigate('home')}
        title={t('pages.shop.heroTitle')}
      />

      <div className="shop-page__body">
        <nav className="shop-dock" aria-label={t('pages.shop.categoriesAria')}>
          <div className="shop-dock__shell plu-tab-rail__shell">
            {SHOP_CATEGORIES.map(({ id, icon: Icon, labelKey }) => (
              <button
                key={id}
                type="button"
                className={`shop-dock__tab plu-tab-rail__tab${activeCategory === id ? ' is-active' : ''}`}
                aria-current={activeCategory === id ? 'page' : undefined}
                onClick={() => setActiveCategory(id)}
              >
                {activeCategory === id ? (
                  <m.div
                    layoutId="shop-dock-active-pill"
                    className="plu-tab-rail__active-pill"
                    transition={{ type: 'spring', stiffness: 460, damping: 35 }}
                  />
                ) : null}
                <span className="shop-dock__tab-inner">
                  <Icon size={14} aria-hidden className="plu-tab-rail__icon" />
                  <span className="shop-dock__label">{t(labelKey)}</span>
                </span>
              </button>
            ))}
          </div>
        </nav>

        <div className="shop-catalog">
          {activeCategory === 'tickets' ? (
            <div className="shop-catalog__panel" key="tickets">
              {featuredEvent ? (
                <ShopFeaturedHero
                  event={featuredEvent}
                  locale={locale}
                  checkoutOpen={checkoutOpen}
                  onBuyTickets={() => handleBuyTickets(featuredEvent)}
                  onViewDetail={() => handleViewEventDetail(featuredEvent)}
                  onBrowseCalendar={() => onNavigate('events')}
                  t={t}
                />
              ) : null}

              <section className="shop-section shop-section--tickets" aria-labelledby="shop-tickets-title">
                <div className="shop-section__header shop-section__header--tickets">
                  <span className="shop-section__eyebrow">{t('pages.shop.emptyEyebrow')}</span>
                  <div className="shop-section__heading">
                    <h2 id="shop-tickets-title" className="shop-section__title">
                      {t('pages.shop.ticketsHeading')}
                    </h2>
                    {shopEvents.length > 0 ? (
                      <span
                        className="shop-section__count"
                        aria-label={t('pages.shop.dockCount', { count: shopEvents.length })}
                      >
                        {String(shopEvents.length).padStart(2, '0')}
                      </span>
                    ) : null}
                  </div>
                  <p className="shop-section__lead">
                    {checkoutOpen ? t('pages.shop.ticketsLead') : t('pages.shop.ticketsLeadSoon')}
                  </p>
                </div>
                {shopEvents.length > 0 ? (
                  <m.div
                    className="shop-events-grid"
                    initial="hidden"
                    animate="visible"
                    variants={{
                      hidden: {},
                      visible: { transition: { staggerChildren: 0.08 } },
                    }}
                  >
                    {shopEvents.map((event) => (
                      <ShopEventCard
                        key={event.slug ?? event.id ?? event.title}
                        event={event}
                        locale={locale}
                        checkoutOpen={checkoutOpen}
                        onOpenDetail={setDetailEvent}
                        t={t}
                      />
                    ))}
                  </m.div>
                ) : (
                  <div className="shop-empty" role="status">
                    <div className="shop-empty__icon" aria-hidden>
                      <Ticket size={16} strokeWidth={1.6} />
                    </div>
                    <div className="shop-empty__copy">
                      <p className="shop-empty__eyebrow">{t('pages.shop.emptyEyebrow')}</p>
                      <p className="shop-empty__text">{t('pages.shop.noEvents')}</p>
                    </div>
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
                  <p className="shop-section__lead">
                    {checkoutOpen ? t('pages.shop.merchText') : t('pages.shop.merchTextSoon')}
                  </p>
                </div>
              ) : null}

              {publishedProducts.length > 0 ? (
                <div className="shop-merch-layout">
                  <div className="shop-products-grid">
                    {publishedProducts.map((product) => (
                      <ShopProductCard
                        key={product.id}
                        checkoutOpen={checkoutOpen}
                        locale={locale}
                        product={product}
                        t={t}
                        onAddToCart={(product) => {
                          addToCart(product)
                          setCartOpen(true)
                        }}
                      />
                    ))}
                  </div>
                  {checkoutDone ? <p className="shop-checkout-done">{t('pages.shop.checkoutDone')}</p> : null}
                </div>
              ) : hasLoadedProducts ? (
                <div className="shop-empty shop-empty--products-pending" role="status">
                  <div className="shop-empty__icon" aria-hidden>
                    <ShoppingBag size={16} strokeWidth={1.6} />
                  </div>
                  <div className="shop-empty__copy">
                    <p className="shop-empty__eyebrow">{t('pages.shop.emptyEyebrowMerch')}</p>
                    <p className="shop-empty__text">{t('pages.shop.productsNotPublished')}</p>
                  </div>
                </div>
              ) : (
                <ShopDepartmentPanel
                  badge={t('pages.shop.merchSoon')}
                  title={t('pages.shop.merchTitle')}
                  titleId="shop-merch-panel-title"
                  text={checkoutOpen ? t('pages.shop.merchText') : t('pages.shop.merchTextSoon')}
                  sourceId="shop_merch"
                  primaryLabel={t('pages.shop.merchCtaCalendar')}
                  onPrimary={() => onNavigate?.('events')}
                  secondaryLabel={t('pages.shop.merchCtaContact')}
                  onSecondary={() => onNavigate?.('contact')}
                />
              )}
            </section>
          ) : null}

          {activeCategory === 'courses' ? (
            <section className="shop-section shop-department" aria-labelledby="shop-courses-panel-title" key="courses">
              <ShopDepartmentPanel
                badge={t('pages.shop.coursesSoon')}
                title={t('pages.shop.coursesTitle')}
                titleId="shop-courses-panel-title"
                text={checkoutOpen ? t('pages.shop.coursesText') : t('pages.shop.coursesTextSoon')}
                sourceId="shop_courses"
                primaryLabel={t('pages.shop.coursesCtaContact')}
                onPrimary={() => onNavigate?.('contact')}
                secondaryLabel={t('pages.shop.coursesCtaTeam')}
                onSecondary={() => onNavigate?.('team')}
              />
            </section>
          ) : null}
        </div>
      </div>

      {checkoutOpen ? (
        <>
          <ShopCart cart={cart} locale={locale} onCheckout={checkoutCart} onRemove={removeFromCart} t={t} open={cartOpen} onClose={() => setCartOpen(false)} />

          {Object.values(cart).length > 0 && !cartOpen ? (
            <button className="shop-floating-cart-btn" onClick={() => setCartOpen(true)} aria-label="Abrir carrito">
              <ShoppingBag size={24} />
              <span className="shop-floating-cart-count">{Object.values(cart).reduce((sum, item) => sum + item.quantity, 0)}</span>
            </button>
          ) : null}
        </>
      ) : null}

      <ShopEventDrawer
        open={Boolean(detailEvent)}
        event={detailEvent}
        locale={locale}
        checkoutOpen={checkoutOpen}
        onClose={() => setDetailEvent(null)}
        onBuyTickets={handleBuyTickets}
        onViewEvent={handleViewEventDetail}
        t={t}
      />
    </main>
  )
}
