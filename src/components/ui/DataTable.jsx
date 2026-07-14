import { Inbox } from 'lucide-react'
import StatusBadge from './StatusBadge.jsx'

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
              {columns.map((col) => (
                <th key={col.key} scope="col">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className={[rowClassName, getRowClassName?.(row)].filter(Boolean).join(' ')}
                {...getRowInteractionProps(row)}
              >
                {columns.map((col) => (
                  <td key={col.key} data-label={col.label}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={cardsClass} aria-label="Lista de registros">
        {rows.map((row) => (
          <article
            key={row.id}
            className={[
              'data-table-card',
              rowClassName,
              getRowClassName?.(row),
              variant === 'admin' ? 'data-table-card--admin' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            {...getRowInteractionProps(row)}
          >
            {columns.map((col) => (
              <div key={col.key} className="data-table-card__field">
                <span className="data-table-card__label">{col.label}</span>
                <span className="data-table-card__value">
                  {col.render ? col.render(row) : row[col.key]}
                </span>
              </div>
            ))}
          </article>
        ))}
      </div>
    </>
  )
}

export { StatusBadge }
