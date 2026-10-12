import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  LayoutDashboard,
  PencilLine,
  RefreshCw,
  Table2,
  Trash2,
  X,
} from 'lucide-react'
import AdminDataTable from '../../components/admin/AdminDataTable.jsx'
import AdminDeleteConfirmDialog from '../../components/admin/AdminDeleteConfirmDialog.jsx'
import AdminExpenseDialog from '../../components/admin/AdminExpenseDialog.jsx'
import AdminFilterSearch from '../../components/admin/AdminFilterSearch.jsx'
import AdminIconButton from '../../components/admin/AdminIconButton.jsx'
import AdminReadOnlyTag from '../../components/admin/AdminReadOnlyTag.jsx'
import { AdminMonoCell, AdminTableActions } from '../../components/admin/AdminTableCells.jsx'
import LedgerEntryComposer from '../../components/admin/LedgerEntryComposer.jsx'
import LedgerGridCell from '../../components/admin/LedgerGridCell.jsx'
import LedgerPastePreview from '../../components/admin/LedgerPastePreview.jsx'
import LedgerTotalsBar from '../../components/admin/LedgerTotalsBar.jsx'
import ExportButton from '../../components/ui/ExportButton.jsx'
import TableSkeleton from '../../components/ui/TableSkeleton.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { notifyError, notifySuccess } from '../../lib/adminToast.js'
import { money } from '../../lib/format.js'
import {
  LEDGER_CELL_SELECTOR,
  focusLedgerRowEdge,
  moveLedgerFocus,
} from '../../lib/ledgerGridNav.js'
import { isLedgerGridPaste, parseLedgerDate, parseLedgerPaste } from '../../lib/ledgerPaste.js'
import { createCsv } from '../../services/exportService.js'
import {
  createEntries,
  createEntry,
  deleteEntry,
  fetchFinanceReport,
  updateEntry,
} from '../../services/financeService.js'
import '../../styles/pages/admin-ledger.css'

const SEARCH_DEBOUNCE_MS = 350
/** Vista elegida: `summary` (saldo en grande) o `table` (planilla densa). */
const VIEW_STORAGE_KEY = 'plu.admin.ledger.view'

function readStoredView() {
  try {
    return window.localStorage.getItem(VIEW_STORAGE_KEY) === 'table' ? 'table' : 'summary'
  } catch {
    return 'summary'
  }
}
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
  manualIncome: 'manual_income',
  expense: 'expense',
  other: 'other',
}
const RUBRO_ALL = 'all'
const CATEGORY_CONCEPT_PREFIX = 'concept:'
const CATEGORY_RUBRO_PREFIX = 'rubro:'
// Cobros que entran por el ledger de pagos, en el orden en que se listan en el
// selector de categoría. Lo cargado a mano se filtra por su propio rubro.
const CONCEPT_BREAKDOWN_ORDER = [
  CONCEPT_FILTER.membership,
  CONCEPT_FILTER.registration,
  CONCEPT_FILTER.combo,
  CONCEPT_FILTER.ticket,
  CONCEPT_FILTER.other,
]
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

function computeTotals(rows) {
  const totals = rows.reduce(
    (acc, row) => {
      const amount = Number(row.amount) || 0
      if (row.kind === 'income') acc.income += amount
      else acc.expense += amount
      return acc
    },
    { income: 0, expense: 0 },
  )
  return { ...totals, balance: totals.income - totals.expense }
}

/** Aplica un cambio a una fila del reporte y recalcula los totales del período. */
function patchReportRow(report, rowId, patch) {
  if (!report) return report
  const rows = report.rows.map((row) => (row.id === rowId ? { ...row, ...patch } : row))
  return { ...report, rows, totals: computeTotals(rows) }
}

const CELL_LIMITS = {
  category: { min: 2, max: 80 },
  description: { min: 3, max: 500 },
}
const AMOUNT_MAX = 100_000_000

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

/** Egresos e ingresos cargados a mano: los únicos que se editan desde el libro. */
function entrySuffix(row) {
  return row?.kind === 'income' ? 'Income' : 'Expense'
}

/** Importe con signo: el ingreso suma, el egreso resta. */
function signedAmount(row) {
  const amount = Number(row.amount) || 0
  return row.kind === 'income' ? amount : -amount
}

export default function FinanceSection({ canEdit = false }) {
  const { locale, t } = useI18n()
  const fromId = useId()
  const toId = useId()
  const categoryFilterId = useId()
  const periodPresetsId = useId()
  const [from, setFrom] = useState(() => startOfMonth(0))
  const [to, setTo] = useState(today)
  const [customDatesOpen, setCustomDatesOpen] = useState(false)
  const [view, setView] = useState(readStoredView)
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [kindFilter, setKindFilter] = useState(KIND_FILTER.all)
  const [conceptFilter, setConceptFilter] = useState(CONCEPT_FILTER.all)
  const [rubroFilter, setRubroFilter] = useState(RUBRO_ALL)
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [composerError, setComposerError] = useState('')
  const [composerKind, setComposerKind] = useState('income')
  const [pasteRows, setPasteRows] = useState(null)
  const [pasteTruncated, setPasteTruncated] = useState(false)
  const [pasteBusy, setPasteBusy] = useState(false)
  const [pasteError, setPasteError] = useState('')
  const [cellStatus, setCellStatus] = useState('')
  const categoryListId = useId()
  const [dialogError, setDialogError] = useState('')
  /** Asiento manual (egreso o ingreso) abierto en el diálogo de edición. */
  const [editorRow, setEditorRow] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const reportLoadedRef = useRef(false)
  const activePreset = useMemo(() => resolvePeriodPreset(from, to), [from, to])

  // El buscador no dispara un request por cada tecla: la query viaja al
  // backend recién cuando el tipeo se asienta.
  useEffect(() => {
    const timerId = window.setTimeout(() => setQuery(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timerId)
  }, [searchInput])

  // El aviso de "cambio guardado" es para lectores de pantalla: se limpia solo
  // para que el mismo mensaje se vuelva a anunciar en la próxima edición.
  useEffect(() => {
    if (!cellStatus) return undefined
    const timerId = window.setTimeout(() => setCellStatus(''), 1800)
    return () => window.clearTimeout(timerId)
  }, [cellStatus])

  const load = useCallback(async () => {
    setError('')
    // Primera carga: loader editorial. Refetch (filtros, refresh, post-asiento):
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

  /**
   * Alta desde la fila de carga. Devuelve `true` si el asiento quedó guardado
   * (la fila sólo se limpia entonces). Si la fecha cae fuera del período a la
   * vista, el período se amplía para que el asiento recién cargado aparezca.
   */
  async function submitEntry({ kind, ...payload }) {
    setSaving(true)
    setComposerError('')
    try {
      await createEntry(kind, payload)
      notifySuccess(t(kind === 'income' ? 'admin.toasts.incomeSaved' : 'admin.toasts.expenseSaved'))
      if (payload.occurredOn < from) setFrom(payload.occurredOn)
      else if (payload.occurredOn > to) setTo(payload.occurredOn)
      else await load()
      return true
    } catch (saveError) {
      setComposerError(saveError.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  async function submitEdit(payload) {
    if (!editorRow) return
    setSaving(true)
    setDialogError('')
    try {
      await updateEntry(editorRow.kind, editorRow.id, payload)
      notifySuccess(
        t(editorRow.kind === 'income' ? 'admin.toasts.incomeUpdated' : 'admin.toasts.expenseUpdated'),
      )
      setEditorRow(null)
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
      await deleteEntry(deleteTarget.kind, deleteTarget.id)
      notifySuccess(
        t(deleteTarget.kind === 'income' ? 'admin.toasts.incomeDeleted' : 'admin.toasts.expenseDeleted'),
      )
      setDeleteTarget(null)
      await load()
    } catch (deleteFail) {
      setDeleteError(deleteFail.message)
      notifyError(deleteFail.message)
    } finally {
      setDeleting(false)
    }
  }

  /**
   * Edición en celda. El cambio se ve al instante (optimista) y se revierte si
   * el servidor lo rechaza; no hay recarga completa por cada celda, que es lo
   * que haría lenta una carga seguida. El PATCH lleva el asiento completo
   * porque el contrato de la RPC reemplaza todos los campos.
   */
  async function commitCell(row, patch) {
    const next = { ...row, ...patch }
    const original = {
      occurredOn: row.occurredOn,
      category: row.category,
      description: row.description,
      amount: row.amount,
    }
    setReport((current) => patchReportRow(current, row.id, patch))
    try {
      await updateEntry(row.kind, row.id, {
        occurredOn: rowDateKey(next),
        category: next.category,
        description: next.description,
        amount: Number(next.amount),
        eventId: row.eventId ?? null,
        receiptPath: row.receiptPath || undefined,
      })
      setCellStatus(t('admin.ledger.cellSaved'))
      return true
    } catch (saveError) {
      setReport((current) => patchReportRow(current, row.id, original))
      notifyError(saveError.message)
      return false
    }
  }

  function validateCellDate(value) {
    return parseLedgerDate(value) ? null : t('admin.ledger.cellInvalidDate')
  }

  function validateCellText(field) {
    const { min, max } = CELL_LIMITS[field]
    return (value) => {
      const length = String(value).trim().length
      return length >= min && length <= max
        ? null
        : t('admin.ledger.cellInvalidLength', { min, max })
    }
  }

  function validateCellAmount(value) {
    const amount = Number(value)
    return Number.isInteger(amount) && amount > 0 && amount <= AMOUNT_MAX
      ? null
      : t('admin.ledger.cellInvalidAmount')
  }

  /** Flechas, Inicio/Fin y Tab entre celdas; Enter y F2 los resuelve la celda. */
  function handleGridKeyDown(event) {
    const cell = event.target
    if (!(cell instanceof HTMLElement) || !cell.matches(LEDGER_CELL_SELECTOR)) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const steps = {
      ArrowDown: { rowStep: 1 },
      ArrowUp: { rowStep: -1 },
      ArrowRight: { colStep: 1 },
      ArrowLeft: { colStep: -1 },
      Tab: { colStep: event.shiftKey ? -1 : 1 },
    }
    if (steps[event.key]) {
      // En el borde de la grilla no se frena el evento: Tab sigue su camino
      // hacia las acciones de la fila y las flechas dejan scrollear.
      if (moveLedgerFocus(cell, steps[event.key])) event.preventDefault()
      return
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      focusLedgerRowEdge(cell, event.key === 'End' ? 'end' : 'start')
    }
  }

  /** Pegado de una selección de planilla: vista previa antes de cargar nada. */
  function handlePaste(event) {
    if (!canEdit || event.target.closest?.('.admin-filters__search')) return
    const text = event.clipboardData?.getData('text') ?? ''
    if (!isLedgerGridPaste(text)) return
    event.preventDefault()
    const parsed = parseLedgerPaste(text, { defaultKind: composerKind })
    if (parsed.rows.length === 0) {
      notifyError(t('admin.ledger.pasteNone'))
      return
    }
    setPasteError('')
    setPasteTruncated(parsed.truncated)
    setPasteRows(parsed.rows)
  }

  async function confirmPaste() {
    const entries = (pasteRows ?? [])
      .filter((row) => row.errors.length === 0)
      .map(({ kind, occurredOn, category, description, amount }) => ({
        kind,
        occurredOn,
        category,
        description,
        amount,
      }))
    if (entries.length === 0) return
    setPasteBusy(true)
    setPasteError('')
    try {
      await createEntries(entries)
      notifySuccess(t('admin.toasts.ledgerPasteSaved', { count: entries.length }))
      setPasteRows(null)
      const dates = entries.map((entry) => entry.occurredOn).sort()
      const earliest = dates[0]
      const latest = dates.at(-1)
      // Un lote con fechas fuera del período a la vista lo amplía, igual que el
      // alta individual: si no, las filas recién cargadas no aparecerían.
      const widenFrom = earliest < from
      const widenTo = latest > to
      if (widenFrom) setFrom(earliest)
      if (widenTo) setTo(latest)
      if (!widenFrom && !widenTo) await load()
    } catch (saveError) {
      setPasteError(saveError.message)
      // El servidor pudo cargar parte del lote antes de fallar.
      await load()
    } finally {
      setPasteBusy(false)
    }
  }

  function changeView(next) {
    setView(next)
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      // Sin almacenamiento (ventana privada, bloqueado): la vista vale solo esta sesión.
    }
  }

  function applyPeriodPreset(preset) {
    setCustomDatesOpen(false)
    const next = rangeForPreset(preset)
    setFrom(next.from)
    setTo(next.to)
  }

  function clearListFilters() {
    setKindFilter(KIND_FILTER.all)
    setConceptFilter(CONCEPT_FILTER.all)
    setRubroFilter(RUBRO_ALL)
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

  // El rubro es la categoría que escribe quien carga el asiento: sólo existe en
  // los movimientos manuales, así que filtrar por rubro deja únicamente esos.
  const ledgerRows = useMemo(() => {
    const filtered =
      rubroFilter === RUBRO_ALL
        ? conceptScopedRows
        : conceptScopedRows.filter(
            (row) => row.manual && String(row.category ?? '') === rubroFilter,
          )
    return withRunningBalance(filtered)
  }, [conceptScopedRows, rubroFilter])

  const displayTotals = useMemo(() => {
    if (
      kindFilter === KIND_FILTER.all &&
      conceptFilter === CONCEPT_FILTER.all &&
      rubroFilter === RUBRO_ALL
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
  }, [conceptFilter, kindFilter, ledgerRows, report?.totals, rubroFilter])

  const conceptBreakdown = useMemo(() => {
    const buckets = new Map()
    for (const row of kindScopedRows) {
      if (row.manual) continue
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
      [KIND_FILTER.income, t('admin.ledger.kindFilterIncome'), kindCounts.income],
      [KIND_FILTER.expense, t('admin.ledger.kindFilterExpense'), kindCounts.expense],
    ],
    [kindCounts.all, kindCounts.expense, kindCounts.income, t],
  )

  // Rubros ya usados en el período: alimentan el filtro y las sugerencias de la
  // fila de carga (escribir "Logística" dos veces con distinta grafía parte
  // el rubro en dos).
  const manualCategories = useMemo(() => {
    const seen = new Set()
    for (const row of report?.rows ?? []) {
      const category = String(row.category ?? '').trim()
      if (row.manual && category) seen.add(category)
    }
    return [...seen].sort((a, b) => a.localeCompare(b, 'es'))
  }, [report?.rows])

  const rubroOptions = useMemo(() => {
    const keys = new Set()
    for (const row of kindScopedRows) {
      const category = String(row.category ?? '').trim()
      if (row.manual && category) keys.add(category)
    }
    // Un rubro elegido que dejó de existir en este alcance sigue visible: si
    // no, el select mostraría "Todos" mientras la tabla queda filtrada.
    if (rubroFilter !== RUBRO_ALL) keys.add(rubroFilter)
    if (keys.size === 0) return []
    return [
      [RUBRO_ALL, t('admin.ledger.expenseCategoryAll')],
      ...[...keys].sort((a, b) => a.localeCompare(b, 'es')).map((key) => [key, key]),
    ]
  }, [kindScopedRows, rubroFilter, t])

  // Un solo selector reemplaza la fila de "composición" y el de rubro: los
  // cobros se filtran por concepto y lo cargado a mano por su rubro.
  const categoryValue =
    rubroFilter !== RUBRO_ALL
      ? `${CATEGORY_RUBRO_PREFIX}${rubroFilter}`
      : conceptFilter !== CONCEPT_FILTER.all
        ? `${CATEGORY_CONCEPT_PREFIX}${conceptFilter}`
        : 'all'

  function changeCategory(value) {
    if (value.startsWith(CATEGORY_RUBRO_PREFIX)) {
      setConceptFilter(CONCEPT_FILTER.all)
      setRubroFilter(value.slice(CATEGORY_RUBRO_PREFIX.length))
      return
    }
    setRubroFilter(RUBRO_ALL)
    setConceptFilter(
      value.startsWith(CATEGORY_CONCEPT_PREFIX)
        ? value.slice(CATEGORY_CONCEPT_PREFIX.length)
        : CONCEPT_FILTER.all,
    )
  }

  const sourceRowCount = report?.rows?.length ?? 0
  const movementCount = ledgerRows.length
  const listFiltersActive =
    kindFilter !== KIND_FILTER.all ||
    conceptFilter !== CONCEPT_FILTER.all ||
    rubroFilter !== RUBRO_ALL ||
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
    if (rubroFilter !== RUBRO_ALL) {
      labels.push(rubroFilter)
    }
    if (searchInput.trim()) {
      labels.push(`“${searchInput.trim()}”`)
    }
    return labels
  }, [conceptFilter, kindFilter, rubroFilter, searchInput, t])

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
          [t('admin.ledger.colCategory')]: row.manual ? row.category : conceptLabel(t, key, row.category),
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

  const deleteSuffix = entrySuffix(deleteTarget)

  /**
   * Celda de la grilla. Los asientos manuales se editan en el lugar; los cobros
   * aprobados (que salen del ledger de pagos) son navegables pero de solo
   * lectura, para que las flechas recorran la tabla entera sin saltos.
   */
  function gridCell(
    row,
    { column, field, label, text, display, type, value, validate, list, maxLength, align },
  ) {
    const editable = Boolean(canEdit && row.manual && field)
    return (
      <LedgerGridCell
        column={column}
        label={label}
        text={text}
        editable={editable}
        type={type}
        value={value}
        list={list}
        maxLength={maxLength}
        align={align}
        validate={validate}
        onCommit={(next) =>
          commitCell(row, { [field]: field === 'amount' ? Number(next) : String(next).trim() })
        }
      >
        {display}
      </LedgerGridCell>
    )
  }

  return (
    <section
      className={`admin-finance admin-finance--ledger admin-finance--view-${view}`}
      aria-labelledby="admin-finance-title"
    >
      <div className="admin-finance__summary">
        <header className="admin-finance__header">
          <div className="admin-finance__intro">
            <h2 id="admin-finance-title">{t('admin.ledger.title')}</h2>
          </div>
          <div className="admin-finance__header-actions">
            <AdminReadOnlyTag hint={!canEdit ? t('admin.sections.finance.readOnlyHint') : null} />
            <div
              className="admin-finance__views"
              role="group"
              aria-label={t('admin.ledger.viewLabel')}
            >
              {[
                ['summary', LayoutDashboard, t('admin.ledger.viewSummary')],
                ['table', Table2, t('admin.ledger.viewTable')],
              ].map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`admin-finance__view${view === value ? ' is-active' : ''}`}
                  aria-pressed={view === value}
                  onClick={() => changeView(value)}
                >
                  <Icon size={14} aria-hidden />
                  {label}
                </button>
              ))}
            </div>
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
              {incomeRatio > 0 ? (
                <span
                  className="admin-finance__proportion-segment admin-finance__proportion-segment--income"
                  style={{ flexGrow: incomeRatio }}
                />
              ) : null}
              {expenseRatio > 0 ? (
                <span
                  className="admin-finance__proportion-segment admin-finance__proportion-segment--expense"
                  style={{ flexGrow: expenseRatio }}
                />
              ) : null}
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
              <button
                type="button"
                className={`admin-finance__preset${
                  activePreset === PERIOD_PRESET.custom || customDatesOpen ? ' is-active' : ''
                }`}
                aria-pressed={activePreset === PERIOD_PRESET.custom || customDatesOpen}
                onClick={() => setCustomDatesOpen((open) => !open)}
              >
                {t('admin.ledger.presetCustom')}
              </button>
            </div>
          </div>
          {activePreset === PERIOD_PRESET.custom || customDatesOpen ? (
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
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="form-submit-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="admin-finance__ledger" onPaste={handlePaste}>
        {canEdit ? (
          <>
            <LedgerEntryComposer
              categories={manualCategories}
              busy={saving}
              onSubmit={submitEntry}
              onKindChange={setComposerKind}
            />
            {composerError ? (
              <p className="form-submit-error" role="alert">
                {composerError}
              </p>
            ) : null}
            <p className="admin-finance__grid-hint">{t('admin.ledger.gridHint')}</p>
          </>
        ) : null}

        {pasteRows ? (
          <LedgerPastePreview
            rows={pasteRows}
            truncated={pasteTruncated}
            busy={pasteBusy}
            error={pasteError}
            onConfirm={() => void confirmPaste()}
            onDiscard={() => setPasteRows(null)}
            onRemoveRow={(index) =>
              setPasteRows((current) => {
                const next = current.filter((_, position) => position !== index)
                return next.length > 0 ? next : null
              })
            }
          />
        ) : null}

        <div className="admin-finance__toolbar">
          <AdminFilterSearch
            placeholder={t('admin.ledger.search')}
            query={searchInput}
            onQueryChange={setSearchInput}
          />
          <div
            className="admin-finance__kinds"
            role="group"
            aria-label={t('admin.ledger.kindFilterLabel')}
          >
            {kindFilterOptions.map(([value, label, count]) => {
              const selected = kindFilter === value
              return (
                <button
                  key={value}
                  type="button"
                  className={`admin-finance__kind${selected ? ' is-active' : ''}`}
                  aria-pressed={selected}
                  onClick={() => setKindFilter(value)}
                >
                  {label}
                  <span className="admin-finance__kind-count">{count}</span>
                </button>
              )
            })}
          </div>
          {conceptBreakdown.length > 0 || rubroOptions.length > 0 ? (
            <div className={`admin-filters__select${categoryValue !== 'all' ? ' is-active' : ''}`}>
              <div className="admin-filters__select-control">
                <select
                  id={categoryFilterId}
                  value={categoryValue}
                  aria-label={t('admin.ledger.conceptFilterLabel')}
                  onChange={(event) => changeCategory(event.target.value)}
                >
                  <option value="all">{t('admin.ledger.categoryAll')}</option>
                  {conceptBreakdown.length > 0 ? (
                    <optgroup label={t('admin.ledger.groupPayments')}>
                      {conceptBreakdown.map((item) => (
                        <option key={item.key} value={`${CATEGORY_CONCEPT_PREFIX}${item.key}`}>
                          {conceptLabel(t, item.key)}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {rubroOptions.length > 0 ? (
                    <optgroup label={t('admin.ledger.groupManual')}>
                      {rubroOptions
                        .filter(([key]) => key !== RUBRO_ALL)
                        .map(([key, label]) => (
                          <option key={key} value={`${CATEGORY_RUBRO_PREFIX}${key}`}>
                            {label}
                          </option>
                        ))}
                    </optgroup>
                  ) : null}
                </select>
                <ChevronDown className="admin-filters__select-icon" size={14} aria-hidden />
              </div>
            </div>
          ) : null}
        </div>

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

        <div className="admin-finance__grid" onKeyDown={handleGridKeyDown}>
        {initialLoading ? (
          <TableSkeleton rows={6} columns={6} />
        ) : (
          <AdminDataTable
            className="admin-data-table--ledger"
            density="compact"
            stickyHeader
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
                render: (row) =>
                  gridCell(row, {
                    column: 'date',
                    field: 'occurredOn',
                    label: t('admin.ledger.colDate'),
                    text: formatLedgerDate(row.occurredOn, locale),
                    display: formatLedgerDate(row.occurredOn, locale),
                    type: 'date',
                    value: rowDateKey(row),
                    validate: validateCellDate,
                  }),
              },
              {
                // El detalle y su referencia son un solo dato: la referencia
                // tenía columna propia y venía vacía en todo asiento manual.
                key: 'description',
                label: t('admin.ledger.colConcept'),
                mobile: 'primary',
                render: (row) =>
                  gridCell(row, {
                    column: 'description',
                    field: 'description',
                    label: t('admin.ledger.colConcept'),
                    text: row.description,
                    display: (
                      <div className="admin-finance__concept">
                        <span className="admin-finance__concept-text">{row.description}</span>
                        {row.reference ? <AdminMonoCell>{row.reference}</AdminMonoCell> : null}
                      </div>
                    ),
                    value: row.description,
                    maxLength: CELL_LIMITS.description.max,
                    validate: validateCellText('description'),
                  }),
              },
              {
                key: 'category',
                label: t('admin.ledger.colCategory'),
                mobile: 'badge',
                mobileMeta: 'labeled',
                render: (row) => {
                  const categoryText = row.manual
                    ? row.category
                    : conceptLabel(t, resolveConceptKey(row), row.category)
                  return gridCell(row, {
                    column: 'category',
                    field: 'category',
                    label: t('admin.ledger.colCategory'),
                    text: categoryText,
                    display: <span className="admin-finance__category">{categoryText}</span>,
                    value: row.category,
                    list: categoryListId,
                    maxLength: CELL_LIMITS.category.max,
                    validate: validateCellText('category'),
                  })
                },
              },
              {
                key: 'amount',
                label: t('admin.ledger.colAmount'),
                mobile: 'default',
                mobileMeta: 'labeled',
                desktop: 'numeric',
                align: 'end',
                sortable: true,
                sortAccessor: (row) => signedAmount(row),
                className: 'admin-finance__col-money',
                render: (row) => {
                  const amountText = `${row.kind === 'income' ? '+' : '−'} ${money(row.amount, locale)}`
                  return gridCell(row, {
                    column: 'amount',
                    field: 'amount',
                    label: t('admin.ledger.colAmount'),
                    text: amountText,
                    display: (
                      <span className={`admin-finance__money admin-finance__money--${row.kind}`}>
                        {amountText}
                      </span>
                    ),
                    type: 'number',
                    value: String(row.amount),
                    align: 'end',
                    validate: validateCellAmount,
                  })
                },
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
              ...(canEdit
                ? [
                    {
                      key: 'actions',
                      label: t('admin.ledger.colActions'),
                      mobile: 'action',
                      render: (row) => {
                        // Los cobros aprobados son de solo lectura: salen del
                        // ledger de pagos y se corrigen desde Cobros. Sólo los
                        // asientos cargados a mano se editan acá.
                        if (!row.manual) return null
                        const suffix = entrySuffix(row)
                        return (
                          <AdminTableActions aria-label={t('admin.ledger.colActions')}>
                            <AdminIconButton
                              icon={PencilLine}
                              label={t(`admin.ledger.edit${suffix}`)}
                              onClick={() => {
                                setDialogError('')
                                setEditorRow(row)
                              }}
                              variant="ghost"
                            />
                            <AdminIconButton
                              icon={Trash2}
                              label={t(`admin.ledger.delete${suffix}`)}
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

        <datalist id={categoryListId}>
          {manualCategories.map((category) => (
            <option key={category} value={category} />
          ))}
        </datalist>

        <p className="ledger-sr" role="status" aria-live="polite">
          {cellStatus}
        </p>

        {!initialLoading ? (
          <LedgerTotalsBar
            income={displayTotals.income}
            expense={displayTotals.expense}
            balance={displayTotals.balance}
            count={movementCount}
            total={sourceRowCount}
            filtered={listFiltersActive}
          />
        ) : null}
      </div>

      {editorRow ? (
        <AdminExpenseDialog
          expense={editorRow}
          kind={editorRow.kind}
          busy={saving}
          error={dialogError}
          onCancel={() => {
            if (!saving) setEditorRow(null)
          }}
          onConfirm={(payload) => void submitEdit(payload)}
        />
      ) : null}

      {deleteTarget ? (
        <AdminDeleteConfirmDialog
          busy={deleting}
          error={deleteError}
          title={t(`admin.ledger.delete${deleteSuffix}Title`)}
          description={t(`admin.ledger.delete${deleteSuffix}Description`, {
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
