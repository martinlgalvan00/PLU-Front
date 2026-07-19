import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox, SlidersHorizontal } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import StatusBadge from './StatusBadge.jsx'

function cellValue(col, row) {
  return col.render ? col.render(row) : row[col.key]
}

function sortValue(col, row) {
  return col.sortAccessor ? col.sortAccessor(row) : row[col.key]
}

function compareValues(a, b) {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

function hasMobileLayout(columns) {
  return columns.some((col) => col.mobile)
}

function columnClassName(column, index) {
  const role =
    column.desktop ??
    (column.mobile === 'primary'
      ? 'primary'
      : column.mobile === 'badge'
        ? 'status'
        : column.mobile === 'action' || column.key === 'action'
          ? 'action'
          : 'standard')

  return [
    'data-table__column',
    `data-table__column--${role}`,
    column.align ? `data-table__column--${column.align}` : '',
    index === 0 ? 'data-table__column--first' : '',
    column.className ?? '',
  ]
    .filter(Boolean)
    .join(' ')
}

function AdminCompactCard({ columns, row, className, interactionProps }) {
  const primary = columns.filter((col) => col.mobile === 'primary')
  const badges = columns.filter((col) => col.mobile === 'badge')
  const actions = columns.filter((col) => col.mobile === 'action' || col.key === 'action')
  const usedKeys = new Set([...primary, ...badges, ...actions].map((col) => col.key))

  const primaryCols = primary.length
    ? primary
    : columns.filter((col) => !usedKeys.has(col.key)).slice(0, 1)
  primaryCols.forEach((col) => usedKeys.add(col.key))

  const metaCols = columns.filter((col) => !usedKeys.has(col.key))

  return (
    <article className={className} {...interactionProps}>
      <div className="data-table-card__top">
        <div className="data-table-card__primary">
          {primaryCols.map((col) => (
            <div key={col.key} className="data-table-card__primary-value">
              {cellValue(col, row)}
            </div>
          ))}
        </div>
        {badges.length > 0 && (
          <div className="data-table-card__badges">
            {badges.map((col) => (
              <div key={col.key} className="data-table-card__badge">
                <span className="data-table-card__badge-label">{col.mobileLabel ?? col.label}</span>
                {cellValue(col, row)}
              </div>
            ))}
          </div>
        )}
      </div>

      {metaCols.length > 0 && (
        <div className="data-table-card__meta">
          {metaCols.map((col) => (
            <div key={col.key} className="data-table-card__meta-item">
              <span className="data-table-card__meta-label">{col.label}</span>
              <span className="data-table-card__meta-value">{cellValue(col, row)}</span>
            </div>
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <div className="data-table-card__footer">
          {actions.map((col) => (
            <div key={col.key} className="data-table-card__action">
              {cellValue(col, row)}
            </div>
          ))}
        </div>
      )}
    </article>
  )
}

export default function DataTable({
  ariaLabel,
  className = '',
  columns,
  density = 'comfortable',
  rows,
  emptyIcon: EmptyIcon = Inbox,
  emptyMessage = 'Sin registros',
  getRowClassName,
  onRowClick,
  rowClassName = '',
  stickyPrimary = false,
  variant = 'default',
}) {
  const { t } = useI18n()
  const tableClass = [
    'data-table',
    variant === 'admin' ? 'data-table--admin' : '',
    `data-table--density-${density}`,
    `data-table--columns-${Math.min(columns.length, 8)}`,
    stickyPrimary ? 'data-table--sticky-primary' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const cardsClass =
    `data-table-cards ${variant === 'admin' ? 'data-table-cards--admin' : ''}`.trim()
  const useCompactCards = variant === 'admin' && hasMobileLayout(columns)
  const sortableColumns = columns.filter((column) => column.sortable)

  const [sort, setSort] = useState(null)

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((item) => item.key === sort.key)
    if (!col) return rows
    const factor = sort.direction === 'desc' ? -1 : 1
    return [...rows].sort((a, b) => factor * compareValues(sortValue(col, a), sortValue(col, b)))
  }, [rows, sort, columns])

  function toggleSort(col) {
    if (!col.sortable) return
    setSort((current) => {
      if (current?.key !== col.key) return { key: col.key, direction: 'asc' }
      if (current.direction === 'asc') return { key: col.key, direction: 'desc' }
      return null
    })
  }

  function handleMobileSortChange(event) {
    const key = event.target.value
    setSort(key ? { key, direction: 'asc' } : null)
  }

  if (!rows.length) {
    return (
      <div
        className={`data-table__empty-wrap ${variant === 'admin' ? 'data-table__empty-wrap--admin' : ''}`.trim()}
      >
        <span className="data-table__empty-icon" aria-hidden>
          <EmptyIcon size={20} strokeWidth={1.5} />
        </span>
        <p
          className={`data-table__empty ${variant === 'admin' ? 'data-table__empty--admin' : ''}`.trim()}
        >
          {emptyMessage}
        </p>
      </div>
    )
  }

  function getRowInteractionProps(row) {
    if (!onRowClick) return {}

    return {
      onClick: () => onRowClick(row),
      onKeyDown: (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onRowClick(row)
        }
      },
      tabIndex: 0,
      role: 'button',
    }
  }

  return (
    <>
      <div className={tableClass}>
        <table aria-label={ariaLabel}>
          <thead>
            <tr>
              {columns.map((col, index) => {
                const isSorted = sort?.key === col.key
                if (!col.sortable) {
                  return (
                    <th key={col.key} scope="col" className={columnClassName(col, index)}>
                      <span className="data-table__column-label">{col.label}</span>
                    </th>
                  )
                }
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={columnClassName(col, index)}
                    aria-sort={
                      isSorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <button
                      type="button"
                      className="data-table__sort-btn"
                      onClick={() => toggleSort(col)}
                    >
                      {col.label}
                      {isSorted ? (
                        sort.direction === 'asc' ? (
                          <ArrowUp size={11} aria-hidden className="data-table__sort-icon" />
                        ) : (
                          <ArrowDown size={11} aria-hidden className="data-table__sort-icon" />
                        )
                      ) : (
                        <ChevronsUpDown
                          size={11}
                          aria-hidden
                          className="data-table__sort-icon data-table__sort-icon--idle"
                        />
                      )}
                    </button>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row) => (
              <tr
                key={row.id}
                className={[rowClassName, getRowClassName?.(row)].filter(Boolean).join(' ')}
                {...getRowInteractionProps(row)}
              >
                {columns.map((col, index) => (
                  <td
                    key={col.key}
                    data-label={col.mobileLabel ?? col.label}
                    className={columnClassName(col, index)}
                  >
                    <div className="data-table__cell-content">{cellValue(col, row)}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {useCompactCards && sortableColumns.length > 0 && (
        <div className="data-table-mobile-toolbar">
          <label className="data-table-mobile-toolbar__select">
            <SlidersHorizontal size={14} aria-hidden />
            <span>{t('admin.table.sortLabel')}</span>
            <select value={sort?.key ?? ''} onChange={handleMobileSortChange}>
              <option value="">{t('admin.table.defaultOrder')}</option>
              {sortableColumns.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="data-table-mobile-toolbar__direction"
            aria-label={
              sort?.direction === 'desc'
                ? t('admin.table.sortAscending')
                : t('admin.table.sortDescending')
            }
            disabled={!sort}
            onClick={() =>
              setSort(
                (current) =>
                  current && {
                    ...current,
                    direction: current.direction === 'asc' ? 'desc' : 'asc',
                  },
              )
            }
          >
            {sort?.direction === 'desc' ? (
              <ArrowDown size={15} aria-hidden />
            ) : (
              <ArrowUp size={15} aria-hidden />
            )}
          </button>
        </div>
      )}

      <div className={cardsClass} aria-label={t('admin.table.listAria')}>
        {sortedRows.map((row) => {
          const articleClass = [
            'data-table-card',
            rowClassName,
            getRowClassName?.(row),
            variant === 'admin' ? 'data-table-card--admin' : '',
            useCompactCards ? 'data-table-card--compact' : '',
          ]
            .filter(Boolean)
            .join(' ')

          if (useCompactCards) {
            return (
              <AdminCompactCard
                key={row.id}
                columns={columns.filter((col) => col.mobile !== 'hidden')}
                row={row}
                className={articleClass}
                interactionProps={getRowInteractionProps(row)}
              />
            )
          }

          return (
            <article key={row.id} className={articleClass} {...getRowInteractionProps(row)}>
              {columns.map((col) => (
                <div key={col.key} className="data-table-card__field">
                  <span className="data-table-card__label">{col.label}</span>
                  <span className="data-table-card__value">{cellValue(col, row)}</span>
                </div>
              ))}
            </article>
          )
        })}
      </div>
    </>
  )
}

export { StatusBadge }
