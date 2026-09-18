import { useEffect, useRef, useState } from 'react'
import AdminDataTable, { StatusBadge } from './AdminDataTable.jsx'
import AdminFilterSearch from './AdminFilterSearch.jsx'
import ErrorState from '../ui/ErrorState.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { searchPaymentOrders } from '../../services/paymentService.js'

const CONCEPT_LABEL_KEY = {
  ticket: 'admin.paymentSearch.conceptTicket',
  membership: 'admin.paymentSearch.conceptMembership',
  registration: 'admin.paymentSearch.conceptRegistration',
  combo: 'admin.paymentSearch.conceptCombo',
}

const SEARCH_DEBOUNCE_MS = 350
const MIN_QUERY_LENGTH = 2

function formatDate(value, locale) {
  if (!value) return '—'
  return new Date(value).toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

/**
 * Buscador cruzado por persona/referencia: hoy Finanzas tiene que saber de
 * antemano si un cobro es de entradas o de afiliación/inscripción para elegir
 * la pantalla correcta (`TicketOrdersSection` / `AthletePaymentOrdersSection`
 * son colas separadas, sin búsqueda en común). Este componente es standalone
 * a propósito: `onSelectResult` es el gancho que un padre usaría para saltar
 * a la fila real (ej. cambiar de tab y pasar `highlightOrderId`), pero el
 * buscador no asume dónde ni cómo se monta.
 */
export default function PaymentOrderSearch({ onSelectResult }) {
  const { locale, t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const timerRef = useRef(null)

  useEffect(() => {
    window.clearTimeout(timerRef.current)
    const term = query.trim()
    if (term.length < MIN_QUERY_LENGTH) {
      setResults(null)
      setError('')
      setLoading(false)
      return undefined
    }
    setLoading(true)
    timerRef.current = window.setTimeout(async () => {
      try {
        const { results: rows } = await searchPaymentOrders(term)
        setResults(rows)
        setError('')
      } catch (searchError) {
        setError(searchError?.message ?? t('admin.paymentSearch.error'))
        setResults(null)
      } finally {
        setLoading(false)
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timerRef.current)
  }, [query, t])

  const rows = (results ?? []).map((result) => ({
    id: `${result.kind}-${result.id}`,
    person: result.personName ?? t('admin.ticketOrders.unknownBuyer'),
    concept: t(CONCEPT_LABEL_KEY[result.concept] ?? 'admin.paymentSearch.conceptTicket'),
    reference: result.reference ?? '—',
    amount: money(result.amount, locale, result.currency),
    status: result.status,
    createdAt: formatDate(result.createdAt, locale),
    raw: result,
  }))

  const belowMinChars = query.trim().length > 0 && query.trim().length < MIN_QUERY_LENGTH

  return (
    <section className="admin-orders-block" aria-label={t('admin.paymentSearch.title')}>
      <header className="admin-orders-block__header">
        <div>
          <span className="admin-orders-block__eyebrow">{t('admin.paymentSearch.eyebrow')}</span>
          <h3 className="admin-orders-block__title">{t('admin.paymentSearch.title')}</h3>
          <p className="admin-orders-block__lead">{t('admin.paymentSearch.subtitle')}</p>
        </div>
      </header>

      <div className="admin-orders-block__toolbar">
        <div className="admin-orders-block__toolbar-filters">
          <AdminFilterSearch
            placeholder={t('admin.paymentSearch.placeholder')}
            query={query}
            onQueryChange={setQuery}
          />
        </div>
      </div>

      {belowMinChars ? (
        <p className="admin-orders-block__lead">{t('admin.paymentSearch.minChars')}</p>
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => setQuery((current) => current)}
          retryLabel={t('common.retry')}
        />
      ) : (
        <AdminDataTable
          loading={loading}
          columns={[
            {
              key: 'person',
              label: t('admin.paymentSearch.personColumn'),
              mobile: 'primary',
              sortable: true,
            },
            { key: 'concept', label: t('admin.columns.concept'), mobile: 'badge', sortable: true },
            { key: 'reference', label: t('admin.columns.reference'), mobile: 'hidden' },
            {
              key: 'amount',
              label: t('admin.columns.amount'),
              mobile: 'default',
              desktop: 'numeric',
              align: 'end',
              sortable: true,
            },
            {
              key: 'status',
              label: t('admin.columns.status'),
              mobile: 'badge',
              render: (row) => <StatusBadge value={row.status} />,
            },
            { key: 'createdAt', label: t('admin.columns.date'), mobile: 'hidden', sortable: true },
          ]}
          rows={rows}
          onRowClick={onSelectResult ? (row) => onSelectResult(row.raw) : undefined}
          emptyMessage={
            results === null ? t('admin.paymentSearch.prompt') : t('admin.paymentSearch.empty')
          }
        />
      )}
    </section>
  )
}
