import StatusBadge from './StatusBadge.jsx'

export default function DataTable({
  columns,
  rows,
  emptyMessage = 'Sin registros',
  onRowClick,
  rowClassName = '',
}) {
  if (!rows.length) {
    return <p className="data-table__empty">{emptyMessage}</p>
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
      <div className="data-table">
        <table>
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className={rowClassName} {...getRowInteractionProps(row)}>
                {columns.map((col) => (
                  <td key={col.key}>
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="data-table-cards" aria-label="Lista de registros">
        {rows.map((row) => (
          <article
            key={row.id}
            className={`data-table-card${rowClassName ? ` ${rowClassName}` : ''}`}
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
