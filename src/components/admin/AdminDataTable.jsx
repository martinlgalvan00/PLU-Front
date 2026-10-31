import { Pagination, Table } from 'antd'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import AdminCompactCard from './AdminCompactCard.jsx'
import StatusBadge from '../ui/StatusBadge.jsx'
import { useHorizontalScroll } from '../../hooks/useHorizontalScroll'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import '../../styles/pages/admin-table-dense.css'

const DEFAULT_PAGE_SIZE = 25
const PAGE_SIZE_OPTIONS = ['10', '25', '50', '100']

/** Mismo umbral que `.data-table-cards` en plu-ui.css (viewport). */
const VIEWPORT_CARDS_BREAKPOINT = 720
/**
 * Ancho útil del panel: el rail abierto achica el contenido sin achicar el
 * viewport. Alineado al `@container admin-panel (max-width: 899px)`.
 */
const CONTAINER_CARDS_BREAKPOINT = 899

function usePreferCompactCards(containerRef) {
  const [preferCards, setPreferCards] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= VIEWPORT_CARDS_BREAKPOINT,
  )

  useEffect(() => {
    const sync = () => {
      const el = containerRef.current
      const containerWidth = el?.clientWidth ?? 0
      // En tests / primer paint el shell puede medir 0: caer al viewport.
      if (containerWidth > 0) {
        setPreferCards(containerWidth <= CONTAINER_CARDS_BREAKPOINT)
        return
      }
      setPreferCards(window.innerWidth <= VIEWPORT_CARDS_BREAKPOINT)
    }

    const el = containerRef.current
    let ro
    if (el && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(sync)
      ro.observe(el)
    }
    window.addEventListener('resize', sync)
    sync()
    return () => {
      ro?.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [containerRef])

  return preferCards
}

// antd solo acepta 'left' | 'right' | 'center' en `align` — los column defs
// del admin usan el vocabulario semántico de DataTable.jsx ('end'/'start'),
// heredado del layout con clases `data-table__column--*`.
function resolveAntdAlign(align) {
  if (align === 'end') return 'right'
  if (align === 'start') return 'left'
  if (align === 'right' || align === 'center' || align === 'left') return align
  return undefined
}

// Misma convención que `columnClassName` en components/ui/DataTable.jsx:
// admin-minimal.css estiliza columnas por rol (`--primary`, `--status`,
// `--action`, `--numeric`…) y por alineación (`--end`) además de la clase
// explícita que declare cada sección — sin esto las columnas caen todas al
// mismo tratamiento genérico, aunque la hoja de estilos ya las distinga.
function isActionColumn(col) {
  return col.mobile === 'action' || col.key === 'action' || col.key === 'actions'
}

function resolveColumnClassName(col, index) {
  const role =
    col.desktop ??
    (col.mobile === 'primary'
      ? 'primary'
      : col.mobile === 'badge'
        ? 'status'
        : isActionColumn(col)
          ? 'action'
          : 'standard')

  return [
    'data-table__column',
    `data-table__column--${role}`,
    col.align ? `data-table__column--${col.align}` : '',
    index === 0 ? 'data-table__column--first' : '',
    col.className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
}

function hasMobileLayout(columns) {
  return columns.some((col) => col.mobile)
}

/**
 * Ancho mínimo de la tabla antes de que aparezca scroll horizontal. En modo
 * `compact` las columnas son más angostas y el mínimo baja: en un panel de
 * ~1000px la tabla entra sin scroll en vez de empujar 960px.
 */
function resolveTableScrollX(columns, preferCards, { compact = false, minWidth } = {}) {
  const visible = columns.filter(
    (col) => !col.cardOnly && (col.mobile !== 'hidden' || !preferCards),
  )
  const widths = compact
    ? { action: 104, primary: 200, status: 132, standard: 92, minimum: 600 }
    : { action: 132, primary: 240, status: 180, standard: 120, minimum: 960 }
  let total = 0

  for (const col of visible) {
    if (col.width != null) {
      total += col.width
      continue
    }
    if (isActionColumn(col)) {
      total += widths.action
      continue
    }
    if (col.mobile === 'primary' || col.desktop === 'primary') {
      total += widths.primary
      continue
    }
    if (col.mobile === 'badge' || col.desktop === 'status') {
      total += widths.status
      continue
    }
    total += widths.standard
  }

  return Math.max(minWidth ?? widths.minimum, total)
}

// Contenedor de scroll del shell admin; si no existe (tests, Storybook sin shell)
// cae a la ventana, que es el default de antd.
function resolveStickyContainer() {
  if (typeof document === 'undefined') return window
  return document.getElementById('admin-main-content') ?? window
}

function resolveRowClassName(rowClassName, getRowClassName, record, index) {
  const fromProp =
    typeof rowClassName === 'function' ? rowClassName(record, index) : rowClassName
  const fromLegacy = typeof getRowClassName === 'function' ? getRowClassName(record) : ''
  return [fromProp, fromLegacy].filter(Boolean).join(' ')
}

function resolveRowKey(row) {
  return row.id ?? row.key ?? JSON.stringify(row)
}

function mergeToggleKeys(selectedKeys, keys, { select } = {}) {
  const current = Array.isArray(selectedKeys) ? selectedKeys : []
  const currentSet = new Set(current)
  const shouldSelect = select ?? !keys.every((key) => currentSet.has(key))
  if (shouldSelect) {
    const next = new Set(current)
    for (const key of keys) next.add(key)
    return [...next]
  }
  const remove = new Set(keys)
  return current.filter((key) => !remove.has(key))
}

function sameRowKeys(left, right) {
  if (left === right) return true
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
  return left.every((key, index) => key === right[index])
}

const CARD_CLICK_IGNORE =
  'button, a, input, label, .admin-icon-btn, .ant-checkbox-wrapper, .admin-table-actions__more'

function SelectPageCheckbox({ checked, indeterminate, onChange, ariaLabel, label, count }) {
  const inputRef = useRef(null)

  useEffect(() => {
    if (inputRef.current) inputRef.current.indeterminate = Boolean(indeterminate)
  }, [indeterminate])

  return (
    <label className="admin-data-table-shell__select-page">
      <span className="admin-data-table-shell__select-page-check">
        <input
          ref={inputRef}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          aria-label={ariaLabel}
        />
      </span>
      <span className="admin-data-table-shell__select-page-copy">
        <span className="admin-data-table-shell__select-page-label">{label}</span>
        <span className="admin-data-table-shell__select-page-count">{count}</span>
      </span>
    </label>
  )
}

const FIT_DEFAULT_ROWS = 12
const FIT_MIN_ROWS = 6
const FIT_MAX_ROWS = 100
const FIT_HEAD_HEIGHT = 40
const FIT_PAGER_HEIGHT = 56
const FIT_ROW_HEIGHT = 52
const FIT_BOTTOM_GAP = 16

/**
 * Cuántas filas entran entre el borde superior de la tabla y el pie del panel,
 * para que la planilla se vea completa sin scroll vertical. Mide el alto real de
 * una fila (las de dos líneas son más altas que las de una) y se recalcula al
 * redimensionar y cuando cambia lo que hay encima (la barra de filtros).
 */
function useFitPageSize(shellRef, enabled, rowCount) {
  const [size, setSize] = useState(null)

  useEffect(() => {
    if (!enabled) return undefined
    const shell = shellRef.current
    if (!shell) return undefined

    function measure() {
      const host = document.getElementById('admin-main-content')
      const hostRect = host?.getBoundingClientRect()
      const shellRect = shell.getBoundingClientRect()
      const viewportBottom = hostRect
        ? Math.min(hostRect.bottom, window.innerHeight)
        : window.innerHeight
      const top = hostRect ? shellRect.top - hostRect.top + (host?.scrollTop ?? 0) : shellRect.top
      const hostHeight = hostRect ? viewportBottom - hostRect.top : viewportBottom
      const rowEl = shell.querySelector('.ant-table-tbody > tr.ant-table-row')
      const rowHeight = rowEl?.getBoundingClientRect().height || FIT_ROW_HEIGHT
      const available = hostHeight - top - FIT_HEAD_HEIGHT - FIT_PAGER_HEIGHT - FIT_BOTTOM_GAP
      const next = Math.max(
        FIT_MIN_ROWS,
        Math.min(FIT_MAX_ROWS, Math.floor(available / rowHeight)),
      )
      setSize((current) => (current === next ? current : next))
    }

    measure()
    const frame = window.requestAnimationFrame(measure)
    window.addEventListener('resize', measure)
    let observer
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure)
      const section = shell.closest('.admin-list-section') ?? shell.parentElement
      if (section) observer.observe(section)
      const host = document.getElementById('admin-main-content')
      if (host) observer.observe(host)
    }
    return () => {
      window.cancelAnimationFrame(frame)
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [enabled, rowCount, shellRef])

  return enabled ? (size ?? FIT_DEFAULT_ROWS) : null
}

function FitPager({ page, pageSize, total, onChange, t }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav className="admin-data-table-shell__pager" aria-label={t('admin.table.pagination')}>
      <span className="admin-data-table-shell__pager-range" aria-live="polite">
        {t('admin.table.range', { from, to, total })}
      </span>
      <button
        type="button"
        className="admin-data-table-shell__pager-btn"
        aria-label={t('admin.table.previousPage')}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={16} aria-hidden />
      </button>
      <span className="admin-data-table-shell__pager-page">
        {page} / {pages}
      </span>
      <button
        type="button"
        className="admin-data-table-shell__pager-btn"
        aria-label={t('admin.table.nextPage')}
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={16} aria-hidden />
      </button>
    </nav>
  )
}

export default function AdminDataTable({
  className = '',
  columns = [],
  rows = [],
  emptyMessage,
  onRowClick,
  rowClassName,
  getRowClassName,
  loading = false,
  pagination = true,
  pageSize: pageSizeProp = DEFAULT_PAGE_SIZE,
  rowSelection,
  /**
   * Si es true, el click en la fila/card tilda en vez de disparar `onRowClick`.
   * El checkbox nativo sigue disponible. Pensado para un modo "elegir".
   */
  selectOnRowClick = false,
  onVisibleRowKeysChange,
  getRowSelectLabel,
  selectVisibleAriaLabel,
  selectVisibleLabel,
  /** `table` fuerza la tabla también en anchos de celular (p. ej. puerta). */
  layout = 'auto',
  /**
   * Vuelve a la página 1 solo cuando cambia esta clave (búsqueda, filtro,
   * pestaña). Sin ella, cualquier lista nueva —también un refresco de las
   * mismas personas— reinicia la página.
   */
  pageResetKey,
  /**
   * `compact` apila filas de planilla (solo en modo tabla; las cards móviles
   * no cambian). Sin la prop, la tabla se ve igual que siempre.
   */
  density,
  /**
   * Cabecera fija mientras se scrollea el contenido del panel admin. Ancla al
   * contenedor de scroll real del shell (`#admin-main-content`), que queda
   * debajo de la barra superior.
   */
  stickyHeader = false,
  /**
   * Planilla ajustada: sin scroll horizontal (columnas de ancho fijo, la
   * primera absorbe el resto y todas truncan con puntos suspensivos) y con la
   * cantidad de filas por página calculada para que entre en pantalla sin
   * scroll vertical. Solo en modo tabla; las cards móviles no cambian.
   */
  fit = false,
}) {
  const { t } = useI18n()
  const shellRef = useRef(null)
  const scrollRef = useHorizontalScroll()
  const selectedCount = rowSelection?.selectedRowKeys?.length ?? 0
  const preferCards = usePreferCompactCards(shellRef)
  const useCompactCards = layout !== 'table' && preferCards && hasMobileLayout(columns)
  const hideNarrowColumns = preferCards
  const [cardPage, setCardPage] = useState(1)
  const [cardPageSize, setCardPageSize] = useState(pageSizeProp)
  const [tablePage, setTablePage] = useState(1)
  const [tablePageSize, setTablePageSize] = useState(pageSizeProp)
  const fitActive = fit && pagination && !(layout !== 'table' && preferCards)
  const fitPageSize = useFitPageSize(shellRef, fitActive, rows.length)
  const effectivePageSize = fitPageSize ?? tablePageSize

  useEffect(() => {
    setCardPageSize(pageSizeProp)
    setTablePageSize(pageSizeProp)
  }, [pageSizeProp])

  useEffect(() => {
    if (pageResetKey !== undefined) return
    setCardPage(1)
  }, [rows, cardPageSize, useCompactCards, pageResetKey])

  useEffect(() => {
    if (pageResetKey !== undefined) return
    setTablePage(1)
  }, [rows, tablePageSize, useCompactCards, pageResetKey])

  useEffect(() => {
    if (pageResetKey === undefined) return
    setCardPage(1)
    setTablePage(1)
  }, [pageResetKey])

  useEffect(() => {
    if (pageResetKey === undefined) return
    const tablePages = Math.max(1, Math.ceil(rows.length / tablePageSize) || 1)
    const cardPages = Math.max(1, Math.ceil(rows.length / cardPageSize) || 1)
    setTablePage((current) => (current > tablePages ? tablePages : current))
    setCardPage((current) => (current > cardPages ? cardPages : current))
  }, [cardPageSize, pageResetKey, rows.length, tablePageSize])

  // Si el alto disponible cambia y la página actual deja de existir, vuelve a la última.
  useEffect(() => {
    if (!fitActive) return
    const pages = Math.max(1, Math.ceil(rows.length / effectivePageSize))
    setTablePage((current) => (current > pages ? pages : current))
  }, [effectivePageSize, fitActive, rows.length])

  const antdColumns = useMemo(() => {
    return columns
      .filter((col) => !col.cardOnly)
      .filter((col) => col.mobile !== 'hidden' || !hideNarrowColumns)
      .map((col, index) => ({
        title: col.label,
        dataIndex: col.key,
        key: col.key,
        className: resolveColumnClassName(col, index),
        sorter: col.sortable
          ? (a, b) => {
              const valA = col.sortAccessor ? col.sortAccessor(a) : a[col.key]
              const valB = col.sortAccessor ? col.sortAccessor(b) : b[col.key]
              if (valA == null && valB == null) return 0
              if (valA == null) return -1
              if (valB == null) return 1
              if (typeof valA === 'number' && typeof valB === 'number') return valA - valB
              return String(valA).localeCompare(String(valB))
            }
          : false,
        defaultSortOrder:
          col.defaultSort === 'asc' ? 'ascend' : col.defaultSort === 'desc' ? 'descend' : null,
        ...(col.width != null
          ? { width: col.width }
          : isActionColumn(col)
            ? { width: 132 }
            : {}),
        ...(col.fixed ? { fixed: col.fixed } : {}),
        ...(fitActive && !isActionColumn(col) && col.mobile !== 'select' && col.ellipsis !== false
          ? { ellipsis: { showTitle: false } }
          : {}),
        render: (text, record) => (
          <div className="data-table__cell-content">
            {col.render ? col.render(record) : text}
          </div>
        ),
        align: resolveAntdAlign(col.align),
      }))
  }, [columns, fitActive, hideNarrowColumns])

  const dataSource = useMemo(() => {
    return rows.map((row) => ({ ...row, key: row.id ?? JSON.stringify(row) }))
  }, [rows])

  const selectedKeySet = useMemo(
    () => new Set(rowSelection?.selectedRowKeys ?? []),
    [rowSelection?.selectedRowKeys],
  )
  // A partir de 2 filas seleccionadas es "modo lote": la tabla suma un borde
  // celeste. En cards el tinte va en cada fila tildada, aunque sea una sola.
  const isBulkMode = selectedCount > 1
  const hasRowSelection = Boolean(rowSelection)

  function commitSelection(nextKeys) {
    rowSelection?.onChange?.(nextKeys)
  }

  function toggleRowSelection(row) {
    if (!rowSelection) return
    if (rowSelection.getCheckboxProps?.(row)?.disabled) return
    commitSelection(mergeToggleKeys(rowSelection.selectedRowKeys, [resolveRowKey(row)]))
  }

  const tableScrollX = useMemo(
    () =>
      resolveTableScrollX(columns, preferCards, {
        compact: density === 'compact',
        minWidth: layout === 'table' && preferCards ? 0 : undefined,
      }),
    [columns, density, layout, preferCards],
  )

  // En modo cards no hay Table de antd: paginamos acá para no montar
  // cientos de tarjetas (el ledger de caja llegaba a ~8k px de alto).
  const cardRows = useMemo(() => {
    if (!pagination || !useCompactCards) return rows
    const start = (cardPage - 1) * cardPageSize
    return rows.slice(start, start + cardPageSize)
  }, [cardPage, cardPageSize, pagination, rows, useCompactCards])

  const visibleRows = useMemo(() => {
    if (useCompactCards) return cardRows
    if (!pagination) return rows
    const start = (tablePage - 1) * effectivePageSize
    return rows.slice(start, start + effectivePageSize)
  }, [cardRows, effectivePageSize, pagination, rows, tablePage, useCompactCards])

  const visibleRowKeys = useMemo(() => visibleRows.map(resolveRowKey), [visibleRows])
  const onVisibleRowKeysChangeRef = useRef(onVisibleRowKeysChange)
  const lastNotifiedVisibleKeysRef = useRef(null)
  onVisibleRowKeysChangeRef.current = onVisibleRowKeysChange

  useEffect(() => {
    if (sameRowKeys(lastNotifiedVisibleKeysRef.current, visibleRowKeys)) return
    lastNotifiedVisibleKeysRef.current = visibleRowKeys
    onVisibleRowKeysChangeRef.current?.(visibleRowKeys)
  }, [visibleRowKeys])

  const visibleSelectedCount = visibleRowKeys.filter((key) => selectedKeySet.has(key)).length
  const allVisibleSelected =
    visibleRowKeys.length > 0 && visibleSelectedCount === visibleRowKeys.length
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected

  const cardColumns = useMemo(() => {
    const visible = columns.filter((col) => col.mobile !== 'hidden' && !col.tableOnly)
    if (!rowSelection || visible.some((col) => col.mobile === 'select')) return visible
    return [
      {
        key: '__rowSelection',
        mobile: 'select',
        render: (row) => {
          const rowKey = resolveRowKey(row)
          const extra = rowSelection.getCheckboxProps?.(row) ?? {}
          return (
            <label className="admin-schedule-select" onClick={(event) => event.stopPropagation()}>
              <input
                type="checkbox"
                checked={selectedKeySet.has(rowKey)}
                disabled={Boolean(extra.disabled)}
                aria-label={
                  getRowSelectLabel?.(row) ??
                  extra['aria-label'] ??
                  extra.name ??
                  t('admin.table.selectRow', { name: row.fullName ?? row.name ?? '' })
                }
                onChange={() => {
                  if (extra.disabled) return
                  rowSelection.onChange?.(
                    mergeToggleKeys(rowSelection.selectedRowKeys, [rowKey]),
                  )
                }}
              />
            </label>
          )
        },
      },
      ...visible,
    ]
  }, [columns, getRowSelectLabel, rowSelection, selectedKeySet, t])

  function handleCardActivate(row) {
    if (selectOnRowClick && rowSelection) {
      toggleRowSelection(row)
      return
    }
    onRowClick?.(row)
  }

  const shellClass = [
    'admin-data-table-shell',
    fitActive ? 'admin-data-table-shell--fit' : '',
    useCompactCards ? 'admin-data-table-shell--cards' : '',
    selectOnRowClick && hasRowSelection ? 'admin-data-table-shell--picking' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div ref={shellRef} className={shellClass}>

      {useCompactCards ? (
        <>
          {hasRowSelection && cardRows.length > 0 ? (
            <SelectPageCheckbox
              checked={allVisibleSelected}
              indeterminate={someVisibleSelected}
              label={selectVisibleLabel ?? t('admin.table.selectPage')}
              count={visibleRowKeys.length}
              ariaLabel={
                selectVisibleAriaLabel ??
                t('admin.table.selectPageAria', { count: visibleRowKeys.length })
              }
              onChange={() =>
                commitSelection(
                  mergeToggleKeys(rowSelection.selectedRowKeys, visibleRowKeys, {
                    select: !allVisibleSelected,
                  }),
                )
              }
            />
          ) : null}
          <div className="data-table-cards data-table-cards--admin" aria-busy={loading || undefined}>
            {loading && rows.length === 0 ? (
              <div className="admin-data-table-shell__empty">{emptyMessage || 'Sin datos'}</div>
            ) : null}
            {!loading && rows.length === 0 ? (
              <div className="admin-data-table-shell__empty">{emptyMessage || 'Sin datos'}</div>
            ) : null}
            {cardRows.map((row) => {
              const rowKey = resolveRowKey(row)
              const isSelected = selectedKeySet.has(rowKey)
              const canActivate = Boolean(onRowClick) || (selectOnRowClick && hasRowSelection)
              const articleClass = [
                'data-table-card',
                'data-table-card--admin',
                'data-table-card--compact',
                resolveRowClassName(rowClassName, getRowClassName, row),
                isSelected ? 'data-table__row--bulk-selected' : '',
                canActivate ? 'data-table__row--clickable' : '',
              ]
                .filter(Boolean)
                .join(' ')

              const interactionProps = canActivate
                ? {
                    onClick: (event) => {
                      if (event.target.closest(CARD_CLICK_IGNORE)) return
                      handleCardActivate(row)
                    },
                    ...(hasRowSelection
                      ? {}
                      : {
                          onKeyDown: (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              handleCardActivate(row)
                            }
                          },
                          tabIndex: 0,
                          role: 'button',
                        }),
                  }
                : {}

              return (
                <AdminCompactCard
                  key={rowKey}
                  columns={cardColumns}
                  row={row}
                  className={articleClass}
                  interactionProps={interactionProps}
                />
              )
            })}
          </div>
          {pagination && rows.length > 0 ? (
            <div className="admin-data-table-shell__pagination">
              <Pagination
                current={cardPage}
                pageSize={cardPageSize}
                total={rows.length}
                hideOnSinglePage
                showSizeChanger
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                align="center"
                onChange={(page, nextSize) => {
                  setCardPage(page)
                  if (nextSize && nextSize !== cardPageSize) setCardPageSize(nextSize)
                }}
              />
            </div>
          ) : null}
        </>
      ) : (
        <div ref={scrollRef}>
          <Table
            className={[
              'admin-data-table',
              isBulkMode ? 'admin-data-table--bulk-active' : '',
              density === 'compact' ? 'admin-data-table--compact' : '',
              fitActive ? 'admin-data-table--fit' : '',
              stickyHeader ? 'admin-data-table--sticky-head' : '',
              className,
            ]
              .filter(Boolean)
              .join(' ')}
            columns={antdColumns}
            dataSource={dataSource}
            loading={loading}
            locale={{ emptyText: emptyMessage || 'Sin datos' }}
            onRow={(record) => {
              return {
                onClick: (event) => {
                  // El checkbox de selección vive dentro de la fila: sin este guard,
                  // tildarlo también dispara onRowClick (ej. navegar a la ficha).
                  if (event.target.closest('.ant-checkbox-wrapper')) return
                  if (selectOnRowClick && rowSelection) {
                    toggleRowSelection(record)
                    return
                  }
                  onRowClick?.(record)
                },
                style: {
                  cursor:
                    onRowClick || (selectOnRowClick && hasRowSelection) ? 'pointer' : 'default',
                },
              }
            }}
            rowClassName={(record, index) => {
              const base = resolveRowClassName(rowClassName, getRowClassName, record, index)
              const isBulkSelected = isBulkMode && selectedKeySet.has(record.key)
              return [base, isBulkSelected ? 'data-table__row--bulk-selected' : '']
                .filter(Boolean)
                .join(' ')
            }}
            rowSelection={rowSelection}
            pagination={
              pagination
                ? {
                    current: tablePage,
                    pageSize: effectivePageSize,
                    placement: ['bottomCenter'],
                    hideOnSinglePage: true,
                    // En modo ajustado el pie lo dibuja `FitPager`; el de antd
                    // sigue montado (ordena y pagina sobre todo el set) pero oculto.
                    className: fitActive ? 'admin-data-table__native-pager' : undefined,
                    showSizeChanger: !fitActive,
                    pageSizeOptions: PAGE_SIZE_OPTIONS,
                    onChange: (page, nextSize) => {
                      setTablePage(page)
                      if (!fitActive && nextSize && nextSize !== tablePageSize) {
                        setTablePageSize(nextSize)
                      }
                    },
                  }
                : false
            }
            scroll={fitActive ? undefined : { x: tableScrollX }}
            tableLayout={fitActive ? 'fixed' : undefined}
            sticky={stickyHeader ? { getContainer: resolveStickyContainer } : undefined}
          />
          {fitActive ? (
            <FitPager
              page={tablePage}
              pageSize={effectivePageSize}
              total={rows.length}
              onChange={setTablePage}
              t={t}
            />
          ) : null}
        </div>
      )}
    </div>
  )
}

export { StatusBadge }
