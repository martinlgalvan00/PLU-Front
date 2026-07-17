import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox } from 'lucide-react'
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
  columns,
  rows,
  emptyIcon: EmptyIcon = Inbox,
  emptyMessage = 'Sin registros',
  getRowClassName,
  onRowClick,
  rowClassName = '',
  variant = 'default',
}) {
  const tableClass = `data-table ${variant === 'admin' ? 'data-table--admin' : ''}`.trim()
  const cardsClass = `data-table-cards ${variant === 'admin' ? 'data-table-cards--admin' : ''}`.trim()
  const useCompactCards = variant === 'admin' && hasMobileLayout(columns)

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

  if (!rows.length) {
    return (
      <div className={`data-table__empty-wrap ${variant === 'admin' ? 'data-table__empty-wrap--admin' : ''}`.trim()}>
        <span className="data-table__empty-icon" aria-hidden>
          <EmptyIcon size={20} strokeWidth={1.5} />
        </span>
        <p className={`data-table__empty ${variant === 'admin' ? 'data-table__empty--admin' : ''}`.trim()}>
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
        <table>
          <thead>
            <tr>
              {columns.map((col) => {
                const isSorted = sort?.key === col.key
                if (!col.sortable) {
                  return (
                    <th key={col.key} scope="col">
                      {col.label}
                    </th>
                  )
                }
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={isSorted ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button type="button" className="data-table__sort-btn" onClick={() => toggleSort(col)}>
                      {col.label}
                      {isSorted ? (
                        sort.direction === 'asc' ? (
                          <ArrowUp size={11} aria-hidden className="data-table__sort-icon" />
                        ) : (
                          <ArrowDown size={11} aria-hidden className="data-table__sort-icon" />
                        )
                      ) : (
                        <ChevronsUpDown size={11} aria-hidden className="data-table__sort-icon data-table__sort-icon--idle" />
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
                {columns.map((col) => (
                  <td key={col.key} data-label={col.label}>
                    {cellValue(col, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={cardsClass} aria-label="Lista de registros">
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
