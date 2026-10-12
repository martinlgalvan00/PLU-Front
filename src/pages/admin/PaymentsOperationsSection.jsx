import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Search, X } from 'lucide-react'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import PaymentExpiryPanel from '../../components/admin/PaymentExpiryPanel.jsx'
import SegmentedSwitch from '../../components/ui/SegmentedSwitch.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useAdminTour } from '../../providers/AdminTourProvider.jsx'
import { getPaymentsTourSteps } from '../../lib/adminTourSteps.js'
import { money } from '../../lib/format.js'
import { fetchPlatformFeatureToggles } from '../../services/platformSettingsAdminService.js'
import AthletePaymentOrdersSection from './AthletePaymentOrdersSection.jsx'
import TicketOrdersSection from './TicketOrdersSection.jsx'
import PaymentOrderSearch from '../../components/admin/PaymentOrderSearch.jsx'
import '../../styles/pages/admin-payments.css'

/**
 * Interruptores de validación por concepto. Todo habilitado es el estado por
 * defecto y también el fallback: un rol acotado puede no tener
 * `admin.registration_access.read` y recibir 403 al leerlos. En ese caso no se
 * deshabilita nada y el 409 del backend sigue siendo la última palabra — es
 * preferible a bloquear la caja de Finanzas por una lectura que falló.
 */
const VALIDATION_OPEN = Object.freeze({ membership: true, registration: true, ticket: true })

function scrollToId(id) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  document.getElementById(id)?.scrollIntoView({
    block: 'start',
    behavior: reduceMotion ? 'auto' : 'smooth',
  })
}



export default function PaymentsOperationsSection({
  canEdit,
  highlightOrderId = null,
  ticketOrderEventScope = '',
  pendingTicketOrders,
  isLoading: manualLoading,
  loadError: manualError,
  ticketEvents = [],
  onApprovePayment,
  onForceSettlePayment,
  onRejectPayment,
  onApproveTicketOrder,
  onRejectTicketOrder,
  onCreateManualTicketOrder,
  onRefresh: onRefreshManual,
}) {
  const { locale, t } = useI18n()
  const { startTour } = useAdminTour()
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState('athletes')
  // El buscador cruzado es una herramienta bajo demanda, no una barra fija: la
  // cola ya tiene su propio buscador, y dos campos seguidos eran el mismo gesto.
  const [crossSearchOpen, setCrossSearchOpen] = useState(false)
  const [validation, setValidation] = useState(VALIDATION_OPEN)
  const [athleteRefreshKey, setAthleteRefreshKey] = useState(0)
  const [athleteStatusRequest, _setAthleteStatusRequest] = useState(null)
  // Elegido desde el buscador cruzado (`PaymentOrderSearch`): saltea a la
  // pestaña del concepto correcto y marca la orden puntual, sin que el
  // buscador tenga que saber cómo se resalta una fila en cada cola.
  const [searchHighlightOrderId, setSearchHighlightOrderId] = useState(null)
  const [searchTicketQuery, setSearchTicketQuery] = useState('')
  const [athleteSummary, setAthleteSummary] = useState({
    pending: null,
    openAmount: null,
    loading: true,
  })

  const loadValidation = useCallback(async () => {
    try {
      const toggles = await fetchPlatformFeatureToggles()
      setValidation({
        membership: toggles.membershipValidationEnabled,
        registration: toggles.registrationValidationEnabled,
        ticket: toggles.ticketValidationEnabled,
      })
    } catch {
      setValidation(VALIDATION_OPEN)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    setRefreshing(true)
    setAthleteRefreshKey((key) => key + 1)
    try {
      await Promise.all([loadValidation(), onRefreshManual?.() ?? Promise.resolve()])
    } finally {
      setRefreshing(false)
    }
  }, [loadValidation, onRefreshManual])

  useEffect(() => {
    void loadValidation()
  }, [loadValidation])

  useEffect(() => {
    startTour('admin-payments', getPaymentsTourSteps(t))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, [])

  useEffect(() => {
    if (!ticketOrderEventScope) return undefined
    const frame = window.requestAnimationFrame(() => {
      scrollToId('admin-ticket-orders')
    })
    return () => window.cancelAnimationFrame(frame)
  }, [ticketOrderEventScope])

  const handleAthleteSummaryChange = useCallback((summary) => {
    setAthleteSummary(summary)
  }, [])

  /**
   * Entradas no tiene un `highlightOrderId` propio (esa cola filtra por
   * texto libre en vez de resaltar una fila): reusar `initialQuery` con la
   * referencia exacta consigue el mismo efecto -- aterrizar en la orden
   * puntual -- sin tocar `TicketOrdersSection`.
   */
  function handleSelectSearchResult(result) {
    if (!result) return
    setCrossSearchOpen(false)
    if (result.kind === 'athlete') {
      setActiveTab('athletes')
      setSearchHighlightOrderId(result.id)
      window.requestAnimationFrame(() => scrollToId('admin-athlete-payments'))
      return
    }
    setActiveTab('tickets')
    setSearchTicketQuery(result.reference ?? '')
    window.requestAnimationFrame(() => scrollToId('admin-ticket-orders'))
  }

  const ticketsPending = pendingTicketOrders?.length ?? 0

  const athletesPending =
    athleteSummary.loading && athleteSummary.pending == null ? null : (athleteSummary.pending ?? 0)

  const tabOptions = [
    [
      'athletes',
      t('admin.paymentOperations.tabAthletes'),
      undefined,
      athletesPending == null
        ? null
        : {
            value: athletesPending,
            tone: athletesPending > 0 ? 'warning' : null,
          },
    ],
    [
      'tickets',
      t('admin.paymentOperations.tabTickets'),
      undefined,
      {
        value: ticketsPending,
        tone: ticketsPending > 0 ? 'warning' : null,
      },
    ],
  ]

  return (
    <div className="admin-payments-operations">
      <div className="admin-list-section__chrome admin-payments-ops-chrome">
        <div className="admin-payments-ops-masthead">
          <header className="admin-list-section__header admin-list-shell__header admin-payments-ops-top">
            <div className="admin-list-shell__intro">
              <h1 className="admin-list-shell__title">{t('admin.paymentOperations.title')}</h1>
              <p className="admin-list-shell__subtitle">{t('admin.paymentOperations.subtitle')}</p>
            </div>
            <div className="admin-payments-ops-pulse-group">
              <p
                className={`admin-payments-ops-pulse${
                  (athletesPending ?? 0) > 0 ? ' admin-payments-ops-pulse--warning' : ''
                }`}
                aria-label={t('admin.paymentOperations.opsStripAria')}
              >
                <span className="admin-payments-ops-pulse__stat">
                  <strong className="admin-payments-ops-pulse__value">
                    {athletesPending == null ? '—' : athletesPending}
                  </strong>
                  <span className="admin-payments-ops-pulse__label">
                    {t('admin.paymentOperations.pulseLabel')}
                  </span>
                </span>
                <span className="admin-payments-ops-pulse__stat">
                  <strong className="admin-payments-ops-pulse__value admin-payments-ops-pulse__value--amount">
                    {money(athleteSummary.openAmount ?? 0, locale)}
                  </strong>
                  <span className="admin-payments-ops-pulse__label">
                    {t('admin.paymentOperations.pulseAmountCaption')}
                  </span>
                </span>
              </p>
              <div className="admin-list-shell__actions admin-payments-ops-top__actions">
                <AdminIconButton
                  icon={RefreshCw}
                  label={t('admin.paymentOperations.refresh')}
                  spinning={refreshing}
                  disabled={refreshing}
                  onClick={() => void refreshAll()}
                />
              </div>
            </div>
          </header>

          <div className="admin-payments-ops-top__tabs">
            <SegmentedSwitch
              className="segmented-switch--ops"
              active={activeTab}
              ariaLabel={t('admin.paymentOperations.title')}
              onChange={setActiveTab}
              options={tabOptions}
            />
            <button
              type="button"
              className={`admin-payments-ops-top__find${crossSearchOpen ? ' is-open' : ''}`}
              aria-expanded={crossSearchOpen}
              aria-controls="admin-payment-cross-search"
              onClick={() => setCrossSearchOpen((open) => !open)}
            >
              {crossSearchOpen ? <X size={15} aria-hidden /> : <Search size={15} aria-hidden />}
              {crossSearchOpen ? t('admin.paymentSearch.toggleClose') : t('admin.paymentSearch.toggle')}
            </button>
          </div>
        </div>
      </div>

      <div className="admin-payments-operations__body">
      {crossSearchOpen ? (
        <div id="admin-payment-cross-search">
          <PaymentOrderSearch onSelectResult={handleSelectSearchResult} autoFocus />
        </div>
      ) : null}

      <div
        className="admin-payments-operations__panel"
        style={{ display: activeTab === 'athletes' ? 'block' : 'none' }}
      >
        <AthletePaymentOrdersSection
        canEdit={canEdit}
        canForceSettle={canEdit && Boolean(onForceSettlePayment)}
        validationEnabled={validation}
        highlightOrderId={searchHighlightOrderId ?? highlightOrderId}
        onApprovePayment={onApprovePayment}
        onForceSettlePayment={onForceSettlePayment}
        onRejectPayment={onRejectPayment}
        onSummaryChange={handleAthleteSummaryChange}
        onValidationStale={loadValidation}
        refreshKey={athleteRefreshKey}
        statusFilter={athleteStatusRequest}
      />
      </div>

      <div
        id="admin-ticket-orders"
        className="admin-ticket-orders-anchor admin-payments-operations__panel"
        style={{ display: activeTab === 'tickets' ? 'block' : 'none' }}
      >
        <TicketOrdersSection
          canEdit={canEdit && validation.ticket}
          initialQuery={searchTicketQuery || ticketOrderEventScope}
          pendingTicketOrders={pendingTicketOrders}
          isLoading={manualLoading}
          loadError={manualError}
          events={ticketEvents}
          onApproveTicketOrder={onApproveTicketOrder}
          onRejectTicketOrder={onRejectTicketOrder}
          onCreateManualTicketOrder={onCreateManualTicketOrder}
          onRefresh={onRefreshManual}
        />
      </div>


      {/* Cierre automático: es configuración, no trabajo. Va debajo de las
          colas para que lo primero que se ve sean las órdenes por resolver.
          Queda fuera de los `__panel` (se apilan en la misma celda con
          display none/block): si el vencimiento entrara en esa pila, Órdenes
          se pintaría encima y el plazo quedaría ilegible. */}
      <div className="admin-payments-operations__expiry" hidden={activeTab === 'tickets'}>
        <PaymentExpiryPanel canEdit={canEdit} />
      </div>
      </div>
    </div>
  )
}
