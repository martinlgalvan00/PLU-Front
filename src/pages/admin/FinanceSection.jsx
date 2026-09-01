import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, PencilLine, Plus, RefreshCw, Trash2, X } from 'lucide-react'
import AdminDataTable from '../../components/admin/AdminDataTable.jsx'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import AdminExpenseDialog from '../../components/admin/AdminExpenseDialog.jsx'
import AdminFilterBar from '../../components/admin/AdminFilterBar.jsx'
import AdminFilterChipGroup from '../../components/admin/AdminFilterChipGroup.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import { AdminTableActions } from '../../components/admin/AdminTableCells.jsx'
import ExportButton from '../../components/ui/ExportButton.jsx'
import Pill from '../../components/ui/Pill.jsx'
import TableSkeleton from '../../components/ui/TableSkeleton.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { money } from '../../lib/format.js'
import { createCsv } from '../../services/exportService.js'
import { createExpense, deleteExpense, fetchFinanceReport, updateExpense } from '../../services/financeService.js'

const SEARCH_DEBOUNCE_MS = 350
const LEDGER_PAGE_SIZE = 25
const KIND_FILTER = {
  all: 'all',
  income: 'income',
  expense: 'expense',
}
const CONCEPT_FILTER = {
  all: 'all',
  membership: 'membership',
  registration: 'registration',
  combo: 'combo',
  ticket: 'ticket',
  expense: 'expense',
  other: 'other',
}
const EXPENSE_CATEGORY_ALL = 'all'
const CONCEPT_BREAKDOWN_ORDER = [
  CONCEPT_FILTER.membership,
  CONCEPT_FILTER.registration,
  CONCEPT_FILTER.combo,
  CONCEPT_FILTER.ticket,
  CONCEPT_FILTER.other,
  CONCEPT_FILTER.expense,
]
const CONCEPT_PILL_TONE = {
  membership: 'success',
  registration: 'info',
  combo: 'warning',
  ticket: 'neutral',
  expense: 'danger',
  other: 'neutral',
}
const PERIOD_PRESET = {
  thisMonth: 'thisMonth',
  lastMonth: 'lastMonth',
  last30: 'last30',
  yearToDate: 'yearToDate',
  custom: 'custom',
}

function toIsoDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function today() {
  return toIsoDate(new Date())
}

function startOfMonth(offset = 0) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(1)
  date.setMonth(date.getMonth() + offset)
  return toIsoDate(date)
}

function endOfMonth(offset = 0) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(1)
  date.setMonth(date.getMonth() + offset + 1)
  date.setDate(0)
  return toIsoDate(date)
}

function daysAgoIso(days) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() - days)
  return toIsoDate(date)
}

function startOfYear() {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setMonth(0, 1)
  return toIsoDate(date)
}

function resolvePeriodPreset(from, to) {
  if (from === startOfMonth(0) && to === today()) return PERIOD_PRESET.thisMonth
  if (from === startOfMonth(-1) && to === endOfMonth(-1)) return PERIOD_PRESET.lastMonth
  if (from === daysAgoIso(29) && to === today()) return PERIOD_PRESET.last30
  if (from === startOfYear() && to === today()) return PERIOD_PRESET.yearToDate
  return PERIOD_PRESET.custom
}

function rangeForPreset(preset) {
  switch (preset) {
    case PERIOD_PRESET.thisMonth:
      return { from: startOfMonth(0), to: today() }
    case PERIOD_PRESET.lastMonth:
      return { from: startOfMonth(-1), to: endOfMonth(-1) }
    case PERIOD_PRESET.last30:
      return { from: daysAgoIso(29), to: today() }
    case PERIOD_PRESET.yearToDate:
      return { from: startOfYear(), to: today() }
    default: {
      const _exhaustive = preset
      void _exhaustive
      return { from: startOfMonth(0), to: today() }
    }
  }
}

/**
 * El editor de egresos alterna entre alta y edición: `expense` en null es un
 * alta nueva; con fila, edición de ese asiento.
 */
function ExpenseEditor({ expense, busy, error, onCancel, onConfirm }) {
  if (expense === undefined) return null
  return (
    <AdminExpenseDialog
      expense={expense}
      busy={busy}
      error={error}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  )
}

function rowDateKey(row) {
  return String(row.occurredOn ?? '').slice(0, 10)
}

function compareLedgerRowsAsc(a, b) {
  const byDate = rowDateKey(a).localeCompare(rowDateKey(b))
  if (byDate !== 0) return byDate
  return String(a.id).localeCompare(String(b.id))
}

/** Saldo corrido anclado al orden cronológico del período (no al sort de tabla). */
function withRunningBalance(rows) {
  let balance = 0
  const chronological = [...rows].sort(compareLedgerRowsAsc)
  const balanceById = new Map()
  for (const row of chronological) {
    const amount = Number(row.amount) || 0
    balance += row.kind === 'income' ? amount : -amount
    balanceById.set(row.id, balance)
  }
  return rows.map((row) => ({ ...row, runningBalance: balanceById.get(row.id) ?? 0 }))
}

function formatLedgerDate(value, locale) {
  const iso = String(value ?? '').slice(0, 10)
  const date = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(date.getTime())) return iso || '—'
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

function csvMoney(value) {
  if (value == null || value === '') return ''
  return String(Number(value) || 0)
}

function resolveConceptKey(row) {
  if (row?.conceptKey) return row.conceptKey
  if (row?.kind === 'expense') return CONCEPT_FILTER.expense
  return CONCEPT_FILTER.other
}

function conceptLabel(t, conceptKey, fallbackCategory) {
  const key = `admin.ledger.concept.${conceptKey}`
  const label = t(key)
  if (label && label !== key) return label
  return fallbackCategory || conceptKey
}

function expenseRubrosVisible(kindFilter, conceptFilter) {
  if (kindFilter === KIND_FILTER.income) return false
  if (conceptFilter !== CONCEPT_FILTER.all && conceptFilter !== CONCEPT_FILTER.expense) return false
  return true
}

export default function FinanceSection({ canEdit = false }) {
  const { locale, t } = useI18n()
  const fromId = useId()
  const toId = useId()
  const kindFilterId = useId()
  const expenseCategoryFilterId = useId()
  const periodPresetsId = useId()
  const breakdownId = useId()
  const [from, setFrom] = useState(() => startOfMonth(0))
  const [to, setTo] = useState(today)
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState(KIND_FILTER.all)
  const [conceptFilter, setConceptFilter] = useState(CONCEPT_FILTER.all)
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState(EXPENSE_CATEGORY_ALL)
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [dialogError, setDialogError] = useState('')
  /** `undefined` cerrado; `null` alta; fila de egreso, edición. */
  const [editorExpense, setEditorExpense] = useState(undefined)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const reportLoadedRef = useRef(false)
  const dash = t('admin.ledger.dash')
  const activePreset = useMemo(() => resolvePeriodPreset(from, to), [from, to])

  // El buscador no dispara un request por cada tecla: la query viaja al
  // backend recién cuando el tipeo se asienta.
  useEffect(() => {
    const timerId = window.setTimeout(() => setQuery(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timerId)
  }, [searchInput])

  const load = useCallback(async () => {
    setError('')
    // Primera carga: loader editorial. Refetch (filtros, refresh, post-egreso):
    // los datos anteriores siguen visibles y la actualización avisa en
    // segundo plano -- nunca se vuelve a la pantalla vacía.
    if (reportLoadedRef.current) setRefreshing(true)
    else setInitialLoading(true)
    try {
      setReport(await fetchFinanceReport({ from, to, query }))
      reportLoadedRef.current = true
    } catch (loadError) {
      setError(loadError.message)
    } finally {
      setInitialLoading(false)
      setRefreshing(false)
    }
  }, [from, to, query])

  useEffect(() => {
    void load()
  }, [load])

  async function submitExpense(payload) {
    setSaving(true)
    setDialogError('')
    try {
      if (editorExpense == null) {
        await createExpense(payload)
        notifySuccess(t('admin.toasts.expenseSaved'))
      } else {
        await updateExpense(editorExpense.id, payload)
        notifySuccess(t('admin.toasts.expenseUpdated'))
      }
      setEditorExpense(undefined)
      await load()
    } catch (saveError) {
      setDialogError(saveError.message)
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteExpense(deleteTarget.id)
      notifySuccess(t('admin.toasts.expenseDeleted'))
      setDeleteTarget(null)
      await load()
    } catch (deleteFail) {
      setDeleteError(deleteFail.message)
      notifyError(deleteFail.message)
    } finally {
      setDeleting(false)
    }
  }

  function applyPeriodPreset(preset) {
    const next = rangeForPreset(preset)
    setFrom(next.from)
    setTo(next.to)
  }

  function changeKindFilter(next) {
    setKindFilter(next)
    if (next === KIND_FILTER.income) setExpenseCategoryFilter(EXPENSE_CATEGORY_ALL)
  }

  function changeConceptFilter(next) {
    setConceptFilter(next)
    if (next !== CONCEPT_FILTER.all && next !== CONCEPT_FILTER.expense) {
      setExpenseCategoryFilter(EXPENSE_CATEGORY_ALL)
    }
  }

  function clearListFilters() {
    setKindFilter(KIND_FILTER.all)
    setConceptFilter(CONCEPT_FILTER.all)
    setExpenseCategoryFilter(EXPENSE_CATEGORY_ALL)
    setSearchInput('')
    setQuery('')
  }

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

  const kindScopedRows = useMemo(() => {
    const source = report?.rows ?? []
    if (kindFilter === KIND_FILTER.all) return source
    return source.filter((row) => row.kind === kindFilter)
  }, [report?.rows, kindFilter])

  const conceptScopedRows = useMemo(() => {
    if (conceptFilter === CONCEPT_FILTER.all) return kindScopedRows
    return kindScopedRows.filter((row) => resolveConceptKey(row) === conceptFilter)
  }, [kindScopedRows, conceptFilter])

  const ledgerRows = useMemo(() => {
    const filtered =
      expenseCategoryFilter === EXPENSE_CATEGORY_ALL
        ? conceptScopedRows
        : conceptScopedRows.filter((row) => {
            if (resolveConceptKey(row) !== CONCEPT_FILTER.expense) return true
            return String(row.category ?? '') === expenseCategoryFilter
          })
    return withRunningBalance(filtered)
  }, [conceptScopedRows, expenseCategoryFilter])

  const displayTotals = useMemo(() => {
    if (
      kindFilter === KIND_FILTER.all &&
      conceptFilter === CONCEPT_FILTER.all &&
      expenseCategoryFilter === EXPENSE_CATEGORY_ALL
    ) {
      return report?.totals ?? { income: 0, expense: 0, balance: 0 }
    }
    const next = ledgerRows.reduce(
      (acc, row) => {
        const amount = Number(row.amount) || 0
        if (row.kind === 'income') acc.income += amount
        else acc.expense += amount
        return acc
      },
      { income: 0, expense: 0 },
    )
    return { ...next, balance: next.income - next.expense }
  }, [conceptFilter, expenseCategoryFilter, kindFilter, ledgerRows, report?.totals])

  const conceptBreakdown = useMemo(() => {
    const buckets = new Map()
    for (const row of kindScopedRows) {
      const key = resolveConceptKey(row)
      const prev = buckets.get(key) ?? { key, count: 0, amount: 0 }
      prev.count += 1
      prev.amount += Number(row.amount) || 0
      buckets.set(key, prev)
    }
    return CONCEPT_BREAKDOWN_ORDER.map((key) => buckets.get(key)).filter(Boolean)
  }, [kindScopedRows])

  const kindCounts = useMemo(() => {
    const source = report?.rows ?? []
    let income = 0
    let expense = 0
    for (const row of source) {
      if (row.kind === 'income') income += 1
      else if (row.kind === 'expense') expense += 1
    }
    return { all: source.length, income, expense }
  }, [report?.rows])

  const kindFilterOptions = useMemo(
    () => [
      [KIND_FILTER.all, t('admin.ledger.kindFilterAll'), kindCounts.all],
      [KIND_FILTER.income, t('admin.ledger.kindFilterIncome'), kindCounts.income, 'success'],
      [KIND_FILTER.expense, t('admin.ledger.kindFilterExpense'), kindCounts.expense, 'danger'],
    ],
    [kindCounts.all, kindCounts.expense, kindCounts.income, t],
  )

  const expenseCategoryOptions = useMemo(() => {
    if (!expenseRubrosVisible(kindFilter, conceptFilter)) return []
    const buckets = new Map()
    for (const row of kindScopedRows) {
      if (resolveConceptKey(row) !== CONCEPT_FILTER.expense) continue
      const category = String(row.category ?? '').trim()
      if (!category) continue
      const prev = buckets.get(category) ?? 0
      buckets.set(category, prev + 1)
    }
    if (buckets.size === 0) return []
    const keys = [...buckets.keys()].sort((a, b) => a.localeCompare(b, 'es'))
    if (
      expenseCategoryFilter !== EXPENSE_CATEGORY_ALL &&
      !buckets.has(expenseCategoryFilter)
    ) {
      keys.push(expenseCategoryFilter)
    }
    return [
      [EXPENSE_CATEGORY_ALL, t('admin.ledger.expenseCategoryAll'), kindScopedRows.filter((row) => resolveConceptKey(row) === CONCEPT_FILTER.expense).length],
      ...keys.map((key) => [key, key, buckets.get(key) ?? 0]),
    ]
  }, [conceptFilter, expenseCategoryFilter, kindFilter, kindScopedRows, t])

  const sourceRowCount = report?.rows?.length ?? 0
  const movementCount = ledgerRows.length
  const listFiltersActive =
    kindFilter !== KIND_FILTER.all ||
    conceptFilter !== CONCEPT_FILTER.all ||
    expenseCategoryFilter !== EXPENSE_CATEGORY_ALL ||
    Boolean(searchInput.trim())

  const activeFilterLabels = useMemo(() => {
    const labels = []
    if (kindFilter !== KIND_FILTER.all) {
      labels.push(
        kindFilter === KIND_FILTER.income
          ? t('admin.ledger.kindFilterIncome')
          : t('admin.ledger.kindFilterExpense'),
      )
    }
    if (conceptFilter !== CONCEPT_FILTER.all) {
      labels.push(conceptLabel(t, conceptFilter))
    }
    if (expenseCategoryFilter !== EXPENSE_CATEGORY_ALL) {
      labels.push(expenseCategoryFilter)
    }
    if (searchInput.trim()) {
      labels.push(`“${searchInput.trim()}”`)
    }
    return labels
  }, [conceptFilter, expenseCategoryFilter, kindFilter, searchInput, t])

  const movedTotal = displayTotals.income + displayTotals.expense
  const incomeRatio = movedTotal > 0 ? displayTotals.income / movedTotal : 0
  const expenseRatio = movedTotal > 0 ? displayTotals.expense / movedTotal : 0

  function exportLedgerCsv() {
    if (!ledgerRows.length) {
      notifyError(t('admin.ledger.exportEmpty'))
      return
    }
    const body = [...ledgerRows]
      .sort(compareLedgerRowsAsc)
      .map((row) => {
        const key = resolveConceptKey(row)
        return {
          [t('admin.ledger.colDate')]: formatLedgerDate(row.occurredOn, locale),
          [t('admin.ledger.colConcept')]: row.description ?? '',
          [t('admin.ledger.colCategory')]: conceptLabel(t, key, row.category),
          [t('admin.ledger.colConceptKey')]: key,
          [t('admin.ledger.colParty')]: row.party ?? '',
          [t('admin.ledger.colIncome')]: row.kind === 'income' ? csvMoney(row.amount) : '',
          [t('admin.ledger.colExpense')]: row.kind === 'expense' ? csvMoney(row.amount) : '',
          [t('admin.ledger.colBalance')]: csvMoney(row.runningBalance),
          [t('admin.ledger.colReference')]: row.reference ?? '',
        }
      })
    body.push({
      [t('admin.ledger.colDate')]: '',
      [t('admin.ledger.colConcept')]: t('admin.ledger.balance'),
      [t('admin.ledger.colCategory')]: '',
      [t('admin.ledger.colConceptKey')]: '',
      [t('admin.ledger.colParty')]: '',
      [t('admin.ledger.colIncome')]: csvMoney(displayTotals.income),
      [t('admin.ledger.colExpense')]: csvMoney(displayTotals.expense),
      [t('admin.ledger.colBalance')]: csvMoney(displayTotals.balance),
      [t('admin.ledger.colReference')]: '',
    })
    createCsv(`libro-caja-${from}_${to}.csv`, body)
  }

  const periodPresets = [
    { id: PERIOD_PRESET.thisMonth, label: t('admin.ledger.presetThisMonth') },
    { id: PERIOD_PRESET.lastMonth, label: t('admin.ledger.presetLastMonth') },
    { id: PERIOD_PRESET.last30, label: t('admin.ledger.presetLast30') },
    { id: PERIOD_PRESET.yearToDate, label: t('admin.ledger.presetYearToDate') },
  ]

  return (
    <section className="admin-finance admin-finance--ledger" aria-labelledby="admin-finance-title">
      <div className="admin-finance__summary">
        <header className="admin-finance__header">
          <div className="admin-finance__intro">
            <h2 id="admin-finance-title">{t('admin.ledger.title')}</h2>
            <p className="admin-finance__lead">{t('admin.ledger.lead')}</p>
          </div>
          <div className="admin-finance__header-actions">
            {canEdit ? (
              <button
                className="btn btn--small admin-finance__add"
                type="button"
                onClick={() => {
                  setDialogError('')
                  setEditorExpense(null)
                }}
              >
                <Plus size={14} aria-hidden />
                {t('admin.ledger.addExpense')}
              </button>
            ) : null}
            <div className="admin-finance__tools">
              <ExportButton
                className="admin-finance__export"
                iconOnly
                label={t('admin.ledger.exportCsv')}
                onClick={exportLedgerCsv}
                disabled={initialLoading || !ledgerRows.length}
              />
              <AdminIconButton
                className="admin-finance__refresh"
                icon={RefreshCw}
                label={t('admin.ledger.refresh')}
                onClick={() => void load()}
                disabled={initialLoading || refreshing || saving}
                spinning={refreshing}
              />
            </div>
          </div>
        </header>

        {refreshing && report ? (
          <p className="admin-finance__sync-hint" role="status" aria-live="polite">
            {t('admin.ledger.updating')}
          </p>
        ) : null}

        <div
          className="admin-finance__overview"
          role="group"
          aria-label={t('admin.ledger.kpisAria')}
        >
          <div className="admin-finance__balance">
            <span className="admin-finance__balance-label">{t('admin.ledger.balance')}</span>
            <strong className="admin-finance__balance-value">
              {money(displayTotals.balance, locale)}
            </strong>
            <span className="admin-finance__balance-meta">
              {rangeLabel ? <span className="admin-finance__balance-range">{rangeLabel}</span> : null}
              <span className="admin-finance__balance-count">
                {t('admin.ledger.movementCount', { count: movementCount })}
              </span>
            </span>
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
                <dd>{money(displayTotals.income, locale)}</dd>
              </div>
              <div className="admin-finance__proportion-item admin-finance__proportion-item--expense">
                <dt>
                  <ArrowDownRight size={13} aria-hidden />
                  {t('admin.ledger.expense')}
                </dt>
                <dd>{money(displayTotals.expense, locale)}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="admin-finance__period" role="group" aria-labelledby={periodPresetsId}>
          <div className="admin-finance__presets">
            <span id={periodPresetsId} className="admin-finance__presets-label">
              {t('admin.ledger.periodLabel')}
            </span>
            <div className="admin-finance__preset-list">
              {periodPresets.map((preset) => {
                const selected = activePreset === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`admin-finance__preset${selected ? ' is-active' : ''}`}
                    aria-pressed={selected}
                    onClick={() => applyPeriodPreset(preset.id)}
                  >
                    {preset.label}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="admin-finance__dates">
            <label className="admin-finance__field" htmlFor={fromId}>
              <span>{t('admin.ledger.from')}</span>
              <input
                id={fromId}
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="admin-finance__field" htmlFor={toId}>
              <span>{t('admin.ledger.to')}</span>
              <input
                id={toId}
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </div>
        </div>

        {conceptBreakdown.length > 0 ? (
          <div
            className="admin-finance__breakdown"
            role="group"
            aria-labelledby={breakdownId}
          >
            <span id={breakdownId} className="admin-finance__breakdown-label">
              {t('admin.ledger.breakdownLabel')}
            </span>
            <ul className="admin-finance__breakdown-list">
              {conceptBreakdown.map((item) => {
                const active = conceptFilter === item.key
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      className={`admin-finance__breakdown-chip${active ? ' is-active' : ''}`}
                      aria-pressed={active}
                      onClick={() =>
                        changeConceptFilter(active ? CONCEPT_FILTER.all : item.key)
                      }
                    >
                      <span className="admin-finance__breakdown-chip-label">
                        {conceptLabel(t, item.key)}
                      </span>
                      <span className="admin-finance__breakdown-chip-count">{item.count}</span>
                      <span className="admin-finance__breakdown-chip-amount">
                        {money(item.amount, locale)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="admin-finance__ledger">
        <div className="admin-finance__toolbar">
          <AdminFilterBar
            className="admin-finance__filter-bar"
            compact
            inline
            placeholder={t('admin.ledger.search')}
            query={searchInput}
            onQueryChange={setSearchInput}
            filters={[
              {
                id: kindFilterId,
                label: t('admin.ledger.kindFilterLabel'),
                ariaLabel: t('admin.ledger.kindFilterLabel'),
                showLabel: true,
                value: kindFilter,
                onChange: changeKindFilter,
                options: kindFilterOptions,
                defaultValue: KIND_FILTER.all,
                allLabel: t('admin.ledger.kindFilterAll'),
              },
            ]}
          />
        </div>

        {expenseCategoryOptions.length > 1 ? (
          <AdminFilterChipGroup
            id={expenseCategoryFilterId}
            label={t('admin.ledger.expenseCategoryLabel')}
            value={expenseCategoryFilter}
            onChange={setExpenseCategoryFilter}
            options={expenseCategoryOptions}
            defaultValue={EXPENSE_CATEGORY_ALL}
            omitNeutral
            allLabel={t('admin.ledger.expenseCategoryAll')}
            clearable
            compact
          />
        ) : null}

        {listFiltersActive ? (
          <div className="admin-finance__active-filters" role="status" aria-live="polite">
            <p className="admin-finance__active-filters-copy">
              <span className="admin-finance__active-filters-count">
                {t('admin.ledger.showingFiltered', {
                  shown: movementCount,
                  total: sourceRowCount,
                })}
              </span>
              {activeFilterLabels.length > 0 ? (
                <span className="admin-finance__active-filters-tags">
                  {activeFilterLabels.map((label) => (
                    <span key={label} className="admin-finance__active-filter-tag">
                      {label}
                    </span>
                  ))}
                </span>
              ) : null}
            </p>
            <button
              type="button"
              className="admin-finance__active-filters-clear"
              onClick={clearListFilters}
            >
              <X size={12} aria-hidden />
              {t('admin.ledger.clearListFilters')}
            </button>
          </div>
        ) : null}

        {initialLoading ? (
          <TableSkeleton rows={6} columns={8} />
        ) : (
          <AdminDataTable
            rows={ledgerRows}
            emptyMessage={t('admin.ledger.empty')}
            pageSize={LEDGER_PAGE_SIZE}
            columns={[
              {
                key: 'date',
                label: t('admin.ledger.colDate'),
                mobile: 'default',
                mobileMeta: 'labeled',
                sortable: true,
                defaultSort: 'desc',
                sortAccessor: (row) => rowDateKey(row),
                render: (row) => formatLedgerDate(row.occurredOn, locale),
              },
              {
                key: 'description',
                label: t('admin.ledger.colConcept'),
                mobile: 'primary',
                render: (row) => row.description,
              },
              {
                key: 'category',
                label: t('admin.ledger.colCategory'),
                mobile: 'badge',
                mobileMeta: 'labeled',
                render: (row) => {
                  const key = resolveConceptKey(row)
                  return (
                    <Pill tone={CONCEPT_PILL_TONE[key] ?? 'neutral'}>
                      {conceptLabel(t, key, row.category)}
                    </Pill>
                  )
                },
              },
              {
                key: 'party',
                label: t('admin.ledger.colParty'),
                mobile: 'hidden',
                render: (row) => row.party || dash,
              },
              {
                key: 'income',
                label: t('admin.ledger.colIncome'),
                mobile: 'default',
                mobileMeta: 'labeled',
                desktop: 'numeric',
                align: 'end',
                className: 'admin-finance__col-money admin-finance__col-money--income',
                render: (row) =>
                  row.kind === 'income' ? (
                    <span className="admin-finance__money admin-finance__money--income">
                      {money(row.amount, locale)}
                    </span>
                  ) : (
                    dash
                  ),
              },
              {
                key: 'expenseAmount',
                label: t('admin.ledger.colExpense'),
                mobile: 'default',
                mobileMeta: 'labeled',
                desktop: 'numeric',
                align: 'end',
                className: 'admin-finance__col-money admin-finance__col-money--expense',
                render: (row) =>
                  row.kind === 'expense' ? (
                    <span className="admin-finance__money admin-finance__money--expense">
                      {money(row.amount, locale)}
                    </span>
                  ) : (
                    dash
                  ),
              },
              {
                key: 'runningBalance',
                label: t('admin.ledger.colBalance'),
                mobile: 'default',
                mobileMeta: 'labeled',
                desktop: 'numeric',
                align: 'end',
                className: 'admin-finance__col-money admin-finance__col-balance',
                render: (row) => (
                  <span className="admin-finance__money admin-finance__money--balance">
                    {money(row.runningBalance, locale)}
                  </span>
                ),
              },
              {
                key: 'reference',
                label: t('admin.ledger.colReference'),
                mobile: 'hidden',
                className: 'admin-finance__col-reference',
                render: (row) => row.reference ?? dash,
              },
              ...(canEdit
                ? [
                    {
                      key: 'actions',
                      label: t('admin.ledger.colActions'),
                      mobile: 'action',
                      render: (row) => {
                        // Los ingresos son de solo lectura: salen del ledger de
                        // pagos y se corrigen desde Operación de pagos.
                        if (row.kind !== 'expense') return null
                        return (
                          <AdminTableActions aria-label={t('admin.ledger.colActions')}>
                            <AdminIconButton
                              icon={PencilLine}
                              label={t('admin.ledger.editExpense')}
                              onClick={() => {
                                setDialogError('')
                                setEditorExpense(row)
                              }}
                              variant="ghost"
                            />
                            <AdminIconButton
                              icon={Trash2}
                              label={t('admin.ledger.deleteExpense')}
                              onClick={() => {
                                setDeleteError('')
                                setDeleteTarget(row)
                              }}
                              variant="danger"
                            />
                          </AdminTableActions>
                        )
                      },
                    },
                  ]
                : []),
            ]}
          />
        )}
      </div>

      <ExpenseEditor
        expense={editorExpense}
        busy={saving}
        error={dialogError}
        onCancel={() => {
          if (!saving) setEditorExpense(undefined)
        }}
        onConfirm={(payload) => void submitExpense(payload)}
      />

      {deleteTarget ? (
        <AdminDeleteConfirmDialog
          busy={deleting}
          error={deleteError}
          title={t('admin.ledger.deleteExpenseTitle')}
          description={t('admin.ledger.deleteExpenseDescription', {
            description: deleteTarget.description,
            amount: money(deleteTarget.amount, locale),
          })}
          warning={t('admin.ledger.deleteExpenseWarning')}
          cancelLabel={t('admin.ledger.cancel')}
          confirmLabel={t('admin.ledger.deleteExpenseConfirm')}
          busyLabel={t('admin.ledger.deleteExpenseBusy')}
          onCancel={() => {
            if (!deleting) setDeleteTarget(null)
          }}
          onConfirm={() => void confirmDelete()}
        />
      ) : null}
    </section>
  )
}
