import { Pagination, Table } from 'antd'
import { useEffect, useMemo, useRef, useState } from 'react'

import AdminCompactCard from './AdminCompactCard.jsx'
import StatusBadge from '../ui/StatusBadge.jsx'
import { useHorizontalScroll } from '../../hooks/useHorizontalScroll'
import { useI18n } from '../../i18n/I18nProvider.jsx'

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

function resolveTableScrollX(columns, preferCards, { minWidth = 960 } = {}) {
  const visible = columns.filter((col) => col.mobile !== 'hidden' || !preferCards)
  let total = 0

  for (const col of visible) {
    if (col.width != null) {
      total += col.width
      continue
    }
    if (isActionColumn(col)) {
      total += 132
      continue
    }
    if (col.mobile === 'primary' || col.desktop === 'primary') {
      total += 240
      continue
    }
    if (col.mobile === 'badge' || col.desktop === 'status') {
      total += 180
      continue
    }
    total += 120
  }

  return Math.max(minWidth, total)
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

  useEffect(() => {
    setCardPageSize(pageSizeProp)
    setTablePageSize(pageSizeProp)
  }, [pageSizeProp])

  useEffect(() => {
    setCardPage(1)
  }, [rows, cardPageSize, useCompactCards])

  useEffect(() => {
    setTablePage(1)
  }, [rows, tablePageSize, useCompactCards])

  const antdColumns = useMemo(() => {
    return columns
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
        render: (text, record) => (
          <div className="data-table__cell-content">
            {col.render ? col.render(record) : text}
          </div>
        ),
        align: resolveAntdAlign(col.align),
      }))
  }, [columns, hideNarrowColumns])

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
        minWidth: layout === 'table' && preferCards ? 0 : 960,
      }),
    [columns, layout, preferCards],
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
    const start = (tablePage - 1) * tablePageSize
    return rows.slice(start, start + tablePageSize)
  }, [cardRows, pagination, rows, tablePage, tablePageSize, useCompactCards])

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
    const visible = columns.filter((col) => col.mobile !== 'hidden')
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
              <p className="admin-data-table-shell__empty">{emptyMessage || 'Sin datos'}</p>
            ) : null}
            {!loading && rows.length === 0 ? (
              <p className="admin-data-table-shell__empty">{emptyMessage || 'Sin datos'}</p>
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
            className={`admin-data-table ${isBulkMode ? 'admin-data-table--bulk-active' : ''} ${className}`}
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
                    pageSize: tablePageSize,
                    placement: ['bottomCenter'],
                    hideOnSinglePage: true,
                    showSizeChanger: true,
                    pageSizeOptions: PAGE_SIZE_OPTIONS,
                    onChange: (page, nextSize) => {
                      setTablePage(page)
                      if (nextSize && nextSize !== tablePageSize) setTablePageSize(nextSize)
                    },
                  }
                : false
            }
            scroll={{ x: tableScrollX }}
          />
        </div>
      )}
    </div>
  )
}

export { StatusBadge }
