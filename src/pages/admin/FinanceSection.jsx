import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { ArrowDownRight, ArrowUpRight, PencilLine, Plus, RefreshCw, Trash2 } from 'lucide-react'
import AdminDataTable from '../../components/admin/AdminDataTable.jsx'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import AdminExpenseDialog from '../../components/admin/AdminExpenseDialog.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import { AdminTableActions, AdminTableActionsEmpty } from '../../components/admin/AdminTableCells.jsx'
import TableSkeleton from '../../components/ui/TableSkeleton.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { money } from '../../lib/format.js'
import { createExpense, deleteExpense, fetchFinanceReport, updateExpense } from '../../services/financeService.js'

const today = () => new Date().toISOString().slice(0, 10)
const monthStart = () => `${today().slice(0, 8)}01`
const SEARCH_DEBOUNCE_MS = 350

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

export default function FinanceSection({ canEdit = false }) {
  const { locale, t } = useI18n()
  const fromId = useId()
  const toId = useId()
  const searchId = useId()
  const [from, setFrom] = useState(monthStart)
  const [to, setTo] = useState(today)
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
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
      <div className="admin-finance__summary">
        <header className="admin-finance__header">
          <div className="admin-finance__intro">
            <h2 id="admin-finance-title">{t('admin.ledger.title')}</h2>
            <p>{t('admin.ledger.lead')}</p>
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
            <button
              className="btn btn--outline btn--small admin-finance__refresh"
              type="button"
              onClick={() => void load()}
              disabled={initialLoading || refreshing || saving}
            >
              <RefreshCw className={refreshing ? 'is-spinning' : undefined} size={14} aria-hidden />
              {t('admin.ledger.refresh')}
            </button>
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
              {money(totals.balance, locale)}
            </strong>
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
      </div>

      {error ? (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="admin-finance__ledger">
        <div className="admin-finance__toolbar">
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
          <label className="admin-finance__field admin-finance__field--search" htmlFor={searchId}>
            <span>{t('admin.ledger.searchLabel')}</span>
            <input
              id={searchId}
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t('admin.ledger.search')}
            />
          </label>
        </div>

        {initialLoading ? (
          <TableSkeleton rows={6} columns={6} />
        ) : (
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
                    {row.kind === 'income'
                      ? t('admin.ledger.kindIncome')
                      : t('admin.ledger.kindExpense')}
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
              ...(canEdit
                ? [
                    {
                      key: 'actions',
                      label: t('admin.ledger.colActions'),
                      mobile: 'action',
                      render: (row) => {
                        // Los ingresos son de solo lectura: salen del ledger de
                        // pagos y se corrigen desde Operación de pagos.
                        if (row.kind !== 'expense') return <AdminTableActionsEmpty />
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
