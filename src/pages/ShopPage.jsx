import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, m } from 'motion/react'
import { ArrowRight, CalendarDays, MapPin, ShoppingBag } from 'lucide-react'
import PluPageHero from '../components/layout/PluPageHero.jsx'
import LaunchInterestForm from '../components/ui/LaunchInterestForm.jsx'
import ShopComingSoon from '../components/ui/ShopComingSoon.jsx'
import ShopCartDrawer from '../components/ui/ShopCartDrawer.jsx'
import ShopEventDrawer from '../components/ui/ShopEventDrawer.jsx'
import ShopProductCard from '../components/ui/ShopProductCard.jsx'
import ShopProductDrawer from '../components/ui/ShopProductDrawer.jsx'
import ShopTabs from '../components/ui/ShopTabs.jsx'
import StatusPill from '../components/ui/StatusPill.jsx'
import TicketAvailabilityBadge from '../components/ui/TicketAvailabilityBadge.jsx'
import { zoneScopeLabel } from '../components/ui/TicketTypeOptions.jsx'
import { useShopCart } from '../hooks/useShopCart.js'
import { useShopProducts } from '../hooks/useShopProducts.js'
import { usePublicTicketOffer, useTicketAvailability } from '../hooks/useTicketAvailability.js'
import { useI18n } from '../i18n/I18nProvider.jsx'
import {
  getFeaturedEvent,
  getFeaturedEventDestination,
  getUpcomingEventsByDate,
} from '../lib/eventNavigation.js'
import { cheapestTicketTypePrice, ticketPricingFromEvent } from '../lib/eventPricing.js'
import { ticketOfferCopyKey } from '../lib/ticketSalesState.js'
import { FEATURE_KEYS, isFeatureEnabled } from '../lib/featureAvailability.js'
import { money } from '../lib/format.js'
import { useMotionConfig } from '../motion/MotionProvider.tsx'
import { MOTION_DURATION, MOTION_EASE } from '../motion/tokens.ts'
import { staggerContainer } from '../motion/variants.ts'
import { recallShopOrderToken, rememberShopOrder } from '../services/shopOrderService.js'
import { groupShopProductsByTab } from '../services/shopService.js'
import '../styles/pages/design-phase2.css'
import '../styles/pages/shop.css'
import '../styles/pages/shop-luxe.css'
import '../styles/pages/shop-checkout.css'

function shopTicketPriceLabel(checkoutOpen, offer, fromPrice, locale, t) {
  if (!checkoutOpen) return t('pages.shop.checkoutSoonLabel')
  if (offer?.status === 'blocked') return t(ticketOfferCopyKey(offer))
  if (offer?.status !== 'open') return t('pages.shop.salesClosed')
  if (fromPrice == null) return t('pages.shop.ticketsAvailable')
  return t('pages.shop.fromPrice', { amount: money(fromPrice, locale) })
}

function parseShopDateParts(dateStr = '') {
  const cleaned = String(dateStr).replace(/\./g, '').trim()
  if (!cleaned) return null
  const rangeMatch = cleaned.match(/^(\d{1,2})\s*[-–/]\s*(\d{1,2})\s+([A-Za-zÁÉÍÓÚÜáéíóúü]+)/u)
  if (rangeMatch) {
    return {
      day: `${rangeMatch[1]}–${rangeMatch[2]}`,
      month: rangeMatch[3].slice(0, 3).toUpperCase(),
    }
  }
  const singleMatch = cleaned.match(/^(\d{1,2})\s*[-–/]?\s*([A-Za-zÁÉÍÓÚÜáéíóúü]+)/u)
  if (singleMatch) {
    return {
      day: singleMatch[1].padStart(2, '0'),
      month: singleMatch[2].slice(0, 3).toUpperCase(),
    }
  }
  return { raw: cleaned }
}

/**
 * Día (o rango del mismo mes) y mes de una fila de evento. El catálogo
 * público trae `dateISO`/`endsAt` y no `date` (eso solo lo arma el panel):
 * leyendo únicamente `date`, las filas salían sin fecha. Misma derivación
 * que el calendario; en UTC porque `dateISO` es la fecha de `starts_at`.
 */
function shopEventDateParts(event, locale) {
  const startKey = /^\d{4}-\d{2}-\d{2}/.exec(String(event?.dateISO ?? ''))?.[0]
  if (!startKey) return parseShopDateParts(event?.date)
  const toDate = (key) => new Date(`${key}T00:00:00Z`)
  const monthOf = (date) =>
    new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' })
      .format(date)
      .replace(/\./g, '')
      .slice(0, 3)
      .toUpperCase()
  const start = toDate(startKey)
  const day = String(start.getUTCDate()).padStart(2, '0')
  const endKey = /^\d{4}-\d{2}-\d{2}/.exec(String(event?.endsAt ?? ''))?.[0]
  const end = endKey && endKey > startKey ? toDate(endKey) : null
  const sameMonth = end && end.getUTCMonth() === start.getUTCMonth()
  return {
    day: sameMonth ? `${day}–${String(end.getUTCDate()).padStart(2, '0')}` : day,
    month: monthOf(start),
  }
}

const panelVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
  exit: { opacity: 0, transition: { duration: MOTION_DURATION.fast } },
}

const rowVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: MOTION_DURATION.slow, ease: MOTION_EASE.out },
  },
}

/**
 * Evento destacado, sin foto de fondo: título liviano a la izquierda y, a la
 * derecha, lo que hace falta para decidir (precio, cupo, acción).
 */
function ShopFeatured({
  event,
  locale,
  checkoutOpen,
  onBuyTickets,
  onViewDetail,
  onBrowseCalendar,
  t,
}) {
  const pricing = ticketPricingFromEvent(event)
  const fromPrice = cheapestTicketTypePrice(pricing)
  const offer = usePublicTicketOffer(event, { checkoutOpen })
  const salesOpen = offer.status === 'open'
  const remaining = useTicketAvailability(salesOpen ? event.slug : null)
  const canBuy = salesOpen && remaining !== 0

  return (
    <section className="shop-feature" aria-labelledby="shop-feature-title">
      <p className="shop-eyebrow">{t('pages.shop.featuredEyebrow')}</p>
      <div className="shop-feature__grid">
        <div className="shop-feature__copy">
          <h2 id="shop-feature-title" className="shop-feature__title">
            {event.title}
          </h2>
          <p className="shop-feature__meta">
            <span>
              <CalendarDays size={14} aria-hidden />
              {event.date}
            </span>
            <span>
              <MapPin size={14} aria-hidden />
              {event.venue}
            </span>
            <StatusPill value={event.status} />
          </p>
        </div>

        <div className="shop-feature__buy">
          {checkoutOpen && salesOpen && fromPrice != null ? (
            <p className="shop-feature__price">
              <span>{t('pages.shop.fromPriceCaption')}</span>
              <strong>{money(fromPrice, locale)}</strong>
            </p>
          ) : (
            <p className="shop-feature__price shop-feature__price--status">
              {shopTicketPriceLabel(checkoutOpen, offer, fromPrice, locale, t)}
            </p>
          )}

          {salesOpen ? (
            <TicketAvailabilityBadge remaining={remaining} className="shop-feature__availability" />
          ) : checkoutOpen ? null : (
            <>
              <p className="shop-feature__soon">{t('pages.shop.checkoutSoonNote')}</p>
              <LaunchInterestForm source="shop_hero" eventSlug={event.slug} />
            </>
          )}

          <div className="shop-feature__actions">
            <button
              type="button"
              className="shop-cta"
              onClick={canBuy ? onBuyTickets : onViewDetail}
            >
              <span>
                {canBuy ? t('pages.shop.buyTickets') : t('pages.shop.featuredViewDetail')}
              </span>
              <ArrowRight size={15} aria-hidden />
            </button>
            <button
              type="button"
              className="shop-link"
              onClick={canBuy ? onViewDetail : onBrowseCalendar}
            >
              {canBuy ? t('pages.shop.featuredViewDetail') : t('pages.shop.browseCalendar')}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

/** Fila de evento: fecha, nombre, sede y desde cuánto. Toda la fila abre el detalle. */
function ShopEventRow({ event, locale, checkoutOpen, onOpenDetail, t }) {
  const pricing = ticketPricingFromEvent(event)
  const fromPrice = cheapestTicketTypePrice(pricing)
  const offer = usePublicTicketOffer(event, { checkoutOpen })
  const salesOpen = offer.status === 'open'
  const remaining = useTicketAvailability(salesOpen ? event.slug : null)
  const dateParts = shopEventDateParts(event, locale)
  const { reducedMotion, tier } = useMotionConfig()
  const still = reducedMotion || tier === 'low'
  const Row = still ? 'li' : m.li

  return (
    <Row className="shop-row" {...(still ? {} : { variants: rowVariants })}>
      <button type="button" className="shop-row__hit" onClick={() => onOpenDetail(event)}>
        <span
          className="shop-row__date"
          aria-label={
            dateParts?.day ? `${dateParts.day} ${dateParts.month}` : (dateParts?.raw ?? event.date)
          }
        >
          {dateParts?.day ? (
            <>
              <span className="shop-row__day">{dateParts.day}</span>
              <span className="shop-row__month">{dateParts.month}</span>
            </>
          ) : (
            <span className="shop-row__month">{dateParts?.raw ?? event.date}</span>
          )}
        </span>

        <span className="shop-row__main">
          <span className="shop-row__head">
            <span className="shop-row__title">{event.title}</span>
            <StatusPill value={event.status} />
          </span>
          <span className="shop-row__meta">{event.venue}</span>
          {salesOpen && pricing.ticketTypes.length > 1 ? (
            <span className="shop-row__types">
              {pricing.ticketTypes.map((type) => {
                const extraZones = (type.zoneScopes ?? []).filter(
                  (scope) => scope !== 'gate_tickets',
                )
                return (
                  <span key={type.id}>
                    {type.name}
                    {extraZones.length > 0
                      ? ` · ${extraZones.map((scope) => zoneScopeLabel(scope, t)).join(', ')}`
                      : ''}
                  </span>
                )
              })}
            </span>
          ) : null}
          {salesOpen ? (
            <TicketAvailabilityBadge remaining={remaining} className="shop-row__availability" />
          ) : null}
        </span>

        <span className="shop-row__foot">
          <span className="shop-row__price">
            {shopTicketPriceLabel(checkoutOpen, offer, fromPrice, locale, t)}
          </span>
          <span className="shop-row__hint">
            {checkoutOpen && salesOpen
              ? t('pages.shop.buyTickets')
              : checkoutOpen
                ? t('pages.shop.cardHint')
                : t('pages.shop.cardHintSoon')}
            <ArrowRight size={14} aria-hidden />
          </span>
        </span>
      </button>
    </Row>
  )
}

/** Fila de curso: fecha, nombre, modalidad / lugar / cupo y precio. */
function ShopCourseRow({ course, locale, onOpen, t }) {
  const startsAt = course.course?.startsAt ? new Date(course.course.startsAt) : null
  const valid = startsAt && !Number.isNaN(startsAt.getTime())
  const finished = valid && startsAt.getTime() < Date.now()
  const { reducedMotion, tier } = useMotionConfig()
  const still = reducedMotion || tier === 'low'
  const Row = still ? 'li' : m.li
  const dayLocale = locale === 'en' ? 'en-US' : 'es-AR'
  const details = [
    course.course?.modality
      ? t(`pages.shop.catalog.course.modality.${course.course.modality}`)
      : null,
    course.course?.location,
    course.course?.capacity
      ? t('pages.shop.catalog.course.capacity', { count: course.course.capacity })
      : null,
  ].filter(Boolean)

  return (
    <Row className="shop-row" {...(still ? {} : { variants: rowVariants })}>
      <button type="button" className="shop-row__hit" onClick={() => onOpen(course)}>
        <span className="shop-row__date">
          {valid ? (
            <>
              <span className="shop-row__day">{String(startsAt.getDate()).padStart(2, '0')}</span>
              <span className="shop-row__month">
                {startsAt
                  .toLocaleDateString(dayLocale, { month: 'short' })
                  .replace('.', '')
                  .toUpperCase()}
              </span>
            </>
          ) : null}
        </span>
        <span className="shop-row__main">
          <span className="shop-row__head">
            <span className="shop-row__title">{course.title}</span>
            {finished ? (
              <span className="shop-row__tag">{t('pages.shop.catalog.course.finished')}</span>
            ) : null}
          </span>
          {details.length > 0 ? (
            <span className="shop-row__meta">{details.join(' · ')}</span>
          ) : null}
        </span>
        <span className="shop-row__foot">
          <span className="shop-row__price">{money(course.price, locale)}</span>
          <span className="shop-row__hint">
            {t('pages.shop.catalog.enroll')}
            <ArrowRight size={14} aria-hidden />
          </span>
        </span>
      </button>
    </Row>
  )
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Pedido al que apunta la URL: el link del correo (`?pedido=…#t=token`) o el
 * retorno de Mercado Pago (`?pedido=…&pago=…&payment_id=…`). El token del link
 * vive en el fragmento; apenas se lee se guarda y se limpia la barra de
 * direcciones. El `payment_id` es una pista: el servidor verifica el pago.
 */
function readOrderRequestFromUrl() {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const id = params.get('pedido')
  if (!id || !UUID_PATTERN.test(id)) return null
  const hashToken = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('t')
  if (hashToken) rememberShopOrder(id, hashToken)
  const request = {
    id,
    accessToken: hashToken || recallShopOrderToken(id) || '',
    paymentId: params.get('payment_id') || params.get('collection_id') || null,
  }
  window.history.replaceState(window.history.state, '', window.location.pathname)
  return request
}

export default function ShopPage({ events = [], onNavigate }) {
  const { locale, t } = useI18n()
  const { reducedMotion, tier } = useMotionConfig()
  const still = reducedMotion || tier === 'low'
  const { products, status, retry } = useShopProducts()
  const cart = useShopCart(products, { catalogReady: status === 'ready' })
  const [bagOpen, setBagOpen] = useState(false)
  const [bagSession, setBagSession] = useState(0)
  const [orderRequest, setOrderRequest] = useState(null)
  const [activeTab, setActiveTab] = useState('tickets')
  const [detailEvent, setDetailEvent] = useState(null)
  const [detailProduct, setDetailProduct] = useState(null)
  const checkoutOpen = isFeatureEnabled(FEATURE_KEYS.paidCheckout)
  const featuredEvent = getFeaturedEvent(events)
  const groups = useMemo(() => groupShopProductsByTab(products), [products])
  const shopEvents = getUpcomingEventsByDate(events).filter(
    (event) => (event.slug ?? event.id) !== (featuredEvent?.slug ?? featuredEvent?.id),
  )
  const ticketCount = (featuredEvent ? 1 : 0) + shopEvents.length

  // Entrar por el link de un pedido (correo o retorno de Mercado Pago) abre su estado.
  useEffect(() => {
    const request = readOrderRequestFromUrl()
    if (!request) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrderRequest(request)
    setBagOpen(true)
  }, [])

  // Con algo en el carrito el cajón arranca limpio en el carrito; sin nada,
  // retoma el pedido que estaba mirando.
  const openBag = useCallback(() => {
    if (cart.count > 0) setBagSession((session) => session + 1)
    setDetailProduct(null)
    setBagOpen(true)
  }, [cart.count])
  const closeBag = useCallback(() => setBagOpen(false), [])
  const clearOrderRequest = useCallback(() => setOrderRequest(null), [])

  const tabs = [
    { id: 'tickets', label: t('pages.shop.catalog.tabs.tickets'), count: ticketCount },
    { id: 'apparel', label: t('pages.shop.catalog.tabs.apparel'), count: groups.apparel.length },
    {
      id: 'exclusive',
      label: t('pages.shop.catalog.tabs.exclusive'),
      count: groups.exclusive.length,
    },
    { id: 'course', label: t('pages.shop.catalog.tabs.course'), count: groups.course.length },
  ]

  function handleBuyTickets(event) {
    if (!checkoutOpen) return
    setDetailEvent(null)
    onNavigate('tickets', { eventSlug: event.slug ?? event.id })
  }

  function handleViewEventDetail(event) {
    setDetailEvent(null)
    const destination = getFeaturedEventDestination({ ...event, slug: event?.slug ?? event?.id })
    onNavigate(destination.view, destination.options)
  }

  function renderProducts(tab) {
    const items = groups[tab]
    if (status === 'loading') {
      return (
        <p className="shop-state" role="status">
          {t('pages.shop.catalog.loading')}
        </p>
      )
    }
    if (items.length === 0) {
      return <ShopComingSoon tab={tab} stale={status === 'error'} onRetry={retry} t={t} />
    }

    const List = still ? 'ul' : m.ul
    const listProps = still
      ? {}
      : { initial: 'hidden', animate: 'visible', variants: staggerContainer }

    if (tab === 'course') {
      return (
        <List className="shop-rows" {...listProps}>
          {items.map((course) => (
            <ShopCourseRow
              key={course.id}
              course={course}
              locale={locale}
              onOpen={setDetailProduct}
              t={t}
            />
          ))}
        </List>
      )
    }

    return (
      <List className="shop-grid" {...listProps}>
        {items.map((product) => (
          <ShopProductCard
            key={product.id}
            locale={locale}
            product={product}
            t={t}
            onOpen={setDetailProduct}
          />
        ))}
      </List>
    )
  }

  const Panel = still ? 'div' : m.div

  return (
    <main className="page page--design page--plu-ref shop-page shop-page--luxe">
      <PluPageHero
        className="shop-page__hero"
        breadcrumbLabel={t('pages.shop.heroBreadcrumb')}
        chapter={t('pages.shop.heroChapter')}
        description={checkoutOpen ? t('pages.shop.heroDesc') : t('pages.shop.heroDescSoon')}
        onHome={() => onNavigate('home')}
        title={t('pages.shop.heroTitle')}
      />

      <div className="shop-page__body">
        <div className="shop-bar">
          <ShopTabs
            active={activeTab}
            ariaLabel={t('pages.shop.catalog.tabsAria')}
            tabs={tabs}
            onChange={setActiveTab}
          />
          {cart.count > 0 ? (
            <button
              type="button"
              className="shop-bar__bag"
              aria-label={t('pages.shop.checkout.bagAria', { count: cart.count })}
              onClick={openBag}
            >
              <ShoppingBag size={16} aria-hidden />
              <span>{t('pages.shop.checkout.bag')}</span>
              <small>{String(cart.count).padStart(2, '0')}</small>
            </button>
          ) : null}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <Panel
            key={activeTab}
            className="shop-panel"
            role="tabpanel"
            {...(still
              ? {}
              : { variants: panelVariants, initial: 'hidden', animate: 'visible', exit: 'exit' })}
          >
            {activeTab === 'tickets' ? (
              <>
                {featuredEvent ? (
                  <ShopFeatured
                    event={featuredEvent}
                    locale={locale}
                    checkoutOpen={checkoutOpen}
                    onBuyTickets={() => handleBuyTickets(featuredEvent)}
                    onViewDetail={() => handleViewEventDetail(featuredEvent)}
                    onBrowseCalendar={() => onNavigate('events')}
                    t={t}
                  />
                ) : null}

                <section className="shop-section" aria-labelledby="shop-tickets-title">
                  <header className="shop-section__head">
                    <h2 id="shop-tickets-title" className="shop-section__title">
                      {t('pages.shop.ticketsHeading')}
                    </h2>
                    <p className="shop-section__lead">
                      {checkoutOpen ? t('pages.shop.ticketsLead') : t('pages.shop.ticketsLeadSoon')}
                    </p>
                  </header>
                  {shopEvents.length > 0 ? (
                    <m.ul
                      className="shop-rows"
                      initial={still ? false : 'hidden'}
                      animate="visible"
                      variants={staggerContainer}
                    >
                      {shopEvents.map((event) => (
                        <ShopEventRow
                          key={event.slug ?? event.id ?? event.title}
                          event={event}
                          locale={locale}
                          checkoutOpen={checkoutOpen}
                          onOpenDetail={setDetailEvent}
                          t={t}
                        />
                      ))}
                    </m.ul>
                  ) : featuredEvent ? null : (
                    <p className="shop-state" role="status">
                      {t('pages.shop.noEvents')}
                    </p>
                  )}
                </section>
              </>
            ) : (
              <section className="shop-section" aria-labelledby={`shop-${activeTab}-title`}>
                <header className="shop-section__head">
                  <p className="shop-eyebrow">{t(`pages.shop.catalog.eyebrow.${activeTab}`)}</p>
                  <h2 id={`shop-${activeTab}-title`} className="shop-section__title">
                    {t(`pages.shop.catalog.tabs.${activeTab}`)}
                  </h2>
                  {status === 'loading' || groups[activeTab].length > 0 ? (
                    <p className="shop-section__lead">
                      {t(`pages.shop.catalog.lead.${activeTab}`)}
                    </p>
                  ) : null}
                </header>
                {renderProducts(activeTab)}
              </section>
            )}
          </Panel>
        </AnimatePresence>
      </div>

      <ShopProductDrawer
        locale={locale}
        open={Boolean(detailProduct)}
        product={detailProduct}
        t={t}
        onAddToCart={cart.add}
        onClose={() => setDetailProduct(null)}
        onViewOrder={openBag}
      />

      <ShopCartDrawer
        key={bagSession}
        cart={cart}
        locale={locale}
        open={bagOpen}
        orderRequest={orderRequest}
        t={t}
        onClose={closeBag}
        onOrderRequestHandled={clearOrderRequest}
      />

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
