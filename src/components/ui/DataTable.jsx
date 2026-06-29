import StatusBadge from './StatusBadge.jsx'

export default function DataTable({ columns, rows, emptyMessage = 'Sin registros' }) {
  if (!rows.length) {
    return <p className="data-table__empty">{emptyMessage}</p>
  }

  return (
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
            <tr key={row.id}>
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
  )
}

export { StatusBadge }
