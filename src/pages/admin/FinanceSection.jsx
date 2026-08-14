import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react'
import AdminDataTable from '../../components/admin/AdminDataTable.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { money } from '../../lib/format.js'
import { createExpense, fetchFinanceReport } from '../../services/financeService.js'

const today = () => new Date().toISOString().slice(0, 10)
const monthStart = () => `${today().slice(0, 8)}01`

const EMPTY_EXPENSE = {
  occurredOn: today(),
  category: '',
  description: '',
  amount: '',
  receiptPath: '',
}

export default function FinanceSection({ canEdit = false }) {
  const { locale, t } = useI18n()
  const fromId = useId()
  const toId = useId()
  const searchId = useId()
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(today)
  const [query, setQuery] = useState('')
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_EXPENSE)

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      setReport(await fetchFinanceReport({ from, to, query }))
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setLoading(false)
    }
  }, [from, to, query])

  useEffect(() => {
    void load()
  }, [load])

  function patchForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  async function submit(event) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await createExpense({ ...form, amount: Number(form.amount) })
      setForm({ ...EMPTY_EXPENSE, occurredOn: today() })
      await load()
    } catch (saveError) {
      setError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  const totals = report?.totals ?? { income: 0, expense: 0, balance: 0 }
  const movedTotal = totals.income + totals.expense
  const incomeRatio = movedTotal > 0 ? totals.income / movedTotal : 0
  const expenseRatio = movedTotal > 0 ? totals.expense / movedTotal : 0

  const rangeLabel = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', {
      day: '2-digit',
      month: 'short',
    })
    const fromDate = new Date(`${from}T00:00:00`)
    const toDate = new Date(`${to}T00:00:00`)
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return ''
    return `${formatter.format(fromDate)} – ${formatter.format(toDate)}`
  }, [from, to, locale])

  return (
    <section className="admin-finance admin-finance--ledger" aria-labelledby="admin-finance-title">
      <header className="admin-finance__header">
        <div className="admin-finance__intro">
          <h2 id="admin-finance-title">{t('admin.ledger.title')}</h2>
          <p>{t('admin.ledger.lead')}</p>
        </div>
        <button
          className="btn btn--outline btn--small"
          type="button"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw size={14} aria-hidden />
          {t('admin.ledger.refresh')}
        </button>
      </header>

      <div className="admin-finance__overview" role="group" aria-label={t('admin.ledger.kpisAria')}>
        <div className="admin-finance__balance">
          <span className="admin-finance__balance-label">{t('admin.ledger.balance')}</span>
          <strong className="admin-finance__balance-value">{money(totals.balance, locale)}</strong>
          {rangeLabel ? <span className="admin-finance__balance-range">{rangeLabel}</span> : null}
        </div>
        <div className="admin-finance__proportion">
          <div className="admin-finance__proportion-bar" aria-hidden="true">
            <span
              className="admin-finance__proportion-segment admin-finance__proportion-segment--income"
              style={{ flexGrow: incomeRatio || 0.001 }}
            />
            <span
              className="admin-finance__proportion-segment admin-finance__proportion-segment--expense"
              style={{ flexGrow: expenseRatio || 0.001 }}
            />
          </div>
          <dl className="admin-finance__proportion-legend">
            <div className="admin-finance__proportion-item admin-finance__proportion-item--income">
              <dt>
                <ArrowUpRight size={13} aria-hidden />
                {t('admin.ledger.income')}
              </dt>
              <dd>{money(totals.income, locale)}</dd>
            </div>
            <div className="admin-finance__proportion-item admin-finance__proportion-item--expense">
              <dt>
                <ArrowDownRight size={13} aria-hidden />
                {t('admin.ledger.expense')}
              </dt>
              <dd>{money(totals.expense, locale)}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="admin-finance__toolbar">
        <label className="admin-finance__field" htmlFor={fromId}>
          <span>{t('admin.ledger.from')}</span>
          <input id={fromId} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="admin-finance__field" htmlFor={toId}>
          <span>{t('admin.ledger.to')}</span>
          <input id={toId} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <label className="admin-finance__field admin-finance__field--search" htmlFor={searchId}>
          <span>{t('admin.ledger.searchLabel')}</span>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('admin.ledger.search')}
          />
        </label>
      </div>

      {canEdit ? (
        <form className="admin-finance__expense" onSubmit={submit}>
          <h3>{t('admin.ledger.addExpense')}</h3>
          <div className="admin-finance__expense-grid">
            <label className="admin-finance__field">
              <span>{t('admin.ledger.date')}</span>
              <input
                required
                type="date"
                value={form.occurredOn}
                onChange={(event) => patchForm('occurredOn', event.target.value)}
              />
            </label>
            <label className="admin-finance__field">
              <span>{t('admin.ledger.category')}</span>
              <input
                required
                value={form.category}
                onChange={(event) => patchForm('category', event.target.value)}
              />
            </label>
            <label className="admin-finance__field">
              <span>{t('admin.ledger.amount')}</span>
              <input
                required
                min="1"
                type="number"
                inputMode="numeric"
                value={form.amount}
                onChange={(event) => patchForm('amount', event.target.value)}
              />
            </label>
            <label className="admin-finance__field admin-finance__field--wide">
              <span>{t('admin.ledger.description')}</span>
              <input
                required
                value={form.description}
                onChange={(event) => patchForm('description', event.target.value)}
              />
            </label>
            <label className="admin-finance__field admin-finance__field--wide">
              <span>{t('admin.ledger.receipt')}</span>
              <input
                value={form.receiptPath}
                onChange={(event) => patchForm('receiptPath', event.target.value)}
                placeholder={t('admin.ledger.receiptHint')}
              />
            </label>
            <button className="btn" disabled={saving}>
              {saving ? t('admin.ledger.saving') : t('admin.ledger.submit')}
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      ) : null}

      <AdminDataTable
        rows={report?.rows ?? []}
        emptyMessage={t('admin.ledger.empty')}
        columns={[
          {
            key: 'date',
            label: t('admin.ledger.colDate'),
            mobile: 'default',
            sortable: true,
            defaultSort: 'desc',
            render: (row) => String(row.occurredOn).slice(0, 10),
          },
          {
            key: 'kind',
            label: t('admin.ledger.colKind'),
            mobile: 'badge',
            sortable: true,
            render: (row) => (
              <span className={`admin-finance__kind admin-finance__kind--${row.kind}`}>
                {row.kind === 'income' ? (
                  <ArrowUpRight size={13} aria-hidden />
                ) : (
                  <ArrowDownRight size={13} aria-hidden />
                )}
                {row.kind === 'income' ? t('admin.ledger.kindIncome') : t('admin.ledger.kindExpense')}
              </span>
            ),
          },
          {
            key: 'category',
            label: t('admin.ledger.colCategory'),
            mobile: 'default',
            render: (row) => row.category,
          },
          {
            key: 'description',
            label: t('admin.ledger.colDetail'),
            mobile: 'primary',
            render: (row) => row.description,
          },
          {
            key: 'amount',
            label: t('admin.ledger.colAmount'),
            mobile: 'default',
            desktop: 'numeric',
            align: 'end',
            sortable: true,
            render: (row) => money(row.amount, locale),
          },
          {
            key: 'reference',
            label: t('admin.ledger.colReference'),
            mobile: 'hidden',
            className: 'admin-finance__col-reference',
            render: (row) => row.reference ?? '—',
          },
        ]}
      />
    </section>
  )
}
