import { useId, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox } from 'lucide-react'
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

function initialSortFromColumns(columns) {
  const column = columns.find((item) => item.sortable && item.defaultSort)
  if (!column) return null
  return {
    key: column.key,
    direction: column.defaultSort === 'asc' ? 'asc' : 'desc',
  }
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
                {cellValue(col, row)}
              </div>
            ))}
          </div>
        )}
      </div>

      {metaCols.length > 0 && (
        <div className="data-table-card__meta data-table-card__meta--inline">
          {metaCols.map((col, index) => (
            <span key={col.key} className="data-table-card__meta-value">
              {index > 0 ? (
                <span className="data-table-card__meta-sep" aria-hidden>
                  ·
                </span>
              ) : null}
              {cellValue(col, row)}
            </span>
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
  const sortToolbarLabelId = useId()
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
  /** En mobile solo se ofrecen campos que la card muestra (y no opt-out). */
  const mobileSortColumns = sortableColumns.filter(
    (column) => column.mobile !== 'hidden' && column.mobileSortable !== false,
  )

  const [sort, setSort] = useState(() => initialSortFromColumns(columns))
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const activeSortColumn = sort ? columns.find((item) => item.key === sort.key) : null
  const singleMobileSortColumn =
    mobileSortColumns.length === 1 ? mobileSortColumns[0] : null
  // Un solo campo con orden por defecto (ej. pagos por fecha): sin toolbar.
  const showMobileSortToolbar =
    useCompactCards &&
    (mobileSortColumns.length > 1 ||
      Boolean(singleMobileSortColumn && !singleMobileSortColumn.defaultSort))

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
      if (current?.key !== col.key) {
        return {
          key: col.key,
          direction: col.defaultSort === 'asc' ? 'asc' : col.defaultSort ? 'desc' : 'asc',
        }
      }
      // Con defaultSort (ej. historial por fecha) solo flip; no tiene sentido "orden original".
      if (col.defaultSort) {
        return { key: col.key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
      }
      if (current.direction === 'asc') return { key: col.key, direction: 'desc' }
      return null
    })
  }

  function chooseMobileSort(col) {
    const isSame = sort?.key === col.key
    if (!isSame) {
      setSort({ key: col.key, direction: 'asc' })
      setSortMenuOpen(false)
      return
    }
    if (sort.direction === 'asc') {
      setSort({ key: col.key, direction: 'desc' })
      return
    }
    setSort(null)
    setSortMenuOpen(false)
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

      {showMobileSortToolbar ? (
        singleMobileSortColumn ? (
          <div
            className={`data-table-mobile-toolbar data-table-mobile-toolbar--single${sort ? ' is-sorted' : ''}`}
          >
            <button
              type="button"
              className="data-table-mobile-toolbar__trigger"
              aria-pressed={Boolean(sort)}
              aria-label={
                sort?.direction === 'asc'
                  ? t('admin.table.sortDescending')
                  : t('admin.table.sortAscending')
              }
              onClick={() => toggleSort(singleMobileSortColumn)}
            >
              <span className="data-table-mobile-toolbar__trigger-label">
                {singleMobileSortColumn.mobileSortLabel ?? singleMobileSortColumn.label}
              </span>
              {sort?.key === singleMobileSortColumn.key ? (
                sort.direction === 'asc' ? (
                  <ArrowUp size={13} aria-hidden className="data-table-mobile-toolbar__trigger-icon" />
                ) : (
                  <ArrowDown size={13} aria-hidden className="data-table-mobile-toolbar__trigger-icon" />
                )
              ) : (
                <ChevronsUpDown size={13} aria-hidden className="data-table-mobile-toolbar__trigger-icon" />
              )}
            </button>
          </div>
        ) : (
          <div
            className={`data-table-mobile-toolbar${sort ? ' is-sorted' : ''}${sortMenuOpen ? ' is-open' : ''}`}
          >
            <div className="data-table-mobile-toolbar__bar">
              <button
                type="button"
                className="data-table-mobile-toolbar__trigger"
                aria-controls={sortToolbarLabelId}
                aria-expanded={sortMenuOpen}
                onClick={() => setSortMenuOpen((open) => !open)}
              >
                <span className="data-table-mobile-toolbar__trigger-label">
                  {activeSortColumn
                    ? t('admin.table.sortedBy', {
                        field: activeSortColumn.mobileSortLabel ?? activeSortColumn.label,
                      })
                    : t('admin.table.sortLabel')}
                </span>
                {activeSortColumn ? (
                  sort.direction === 'asc' ? (
                    <ArrowUp size={13} aria-hidden className="data-table-mobile-toolbar__trigger-icon" />
                  ) : (
                    <ArrowDown size={13} aria-hidden className="data-table-mobile-toolbar__trigger-icon" />
                  )
                ) : (
                  <ChevronsUpDown size={13} aria-hidden className="data-table-mobile-toolbar__trigger-icon" />
                )}
              </button>

              {sort ? (
                <button
                  type="button"
                  className="data-table-mobile-toolbar__clear"
                  onClick={() => {
                    setSort(null)
                    setSortMenuOpen(false)
                  }}
                >
                  {t('admin.table.clearSort')}
                </button>
              ) : null}
            </div>

            {sortMenuOpen ? (
              <div
                id={sortToolbarLabelId}
                className="data-table-mobile-toolbar__chips"
                role="group"
                aria-label={t('admin.table.sortLabel')}
              >
                {mobileSortColumns.map((column) => {
                  const active = sort?.key === column.key
                  return (
                    <button
                      key={column.key}
                      type="button"
                      className={`data-table-mobile-toolbar__chip${active ? ' is-active' : ''}`}
                      aria-pressed={active}
                      onClick={() => chooseMobileSort(column)}
                    >
                      <span>{column.mobileSortLabel ?? column.label}</span>
                      {active ? (
                        sort.direction === 'asc' ? (
                          <ArrowUp size={12} aria-hidden className="data-table-mobile-toolbar__chip-icon" />
                        ) : (
                          <ArrowDown size={12} aria-hidden className="data-table-mobile-toolbar__chip-icon" />
                        )
                      ) : null}
                    </button>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      ) : null}

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
