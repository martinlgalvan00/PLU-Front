function cellValue(col, row) {
  return col.render ? col.render(row) : row[col.key]
}

/**
 * Card compacta mobile para listados admin.
 * Usa el contrato `mobile: 'select'|'primary'|'badge'|'default'|'action'|'hidden'`
 * y `mobileMeta: 'labeled'` declarado en las columnas de cada sección.
 */
export default function AdminCompactCard({ columns, row, className, interactionProps }) {
  const primary = columns.filter((col) => col.mobile === 'primary')
  const badges = columns.filter((col) => col.mobile === 'badge')
  const selectCols = columns.filter((col) => col.mobile === 'select')
  // `key === 'action'` es fallback legacy; si `mobile` está definido, esa
  // colocación gana (evita duplicar badge + footer cuando key es "action").
  const actions = columns.filter((col) => {
    if (col.mobile === 'action') return true
    if (col.mobile != null) return false
    return col.key === 'action'
  })
  const usedKeys = new Set([...selectCols, ...primary, ...badges, ...actions].map((col) => col.key))

  const primaryCols = primary.length
    ? primary
    : columns.filter((col) => !usedKeys.has(col.key)).slice(0, 1)
  primaryCols.forEach((col) => usedKeys.add(col.key))

  const metaCols = columns.filter((col) => !usedKeys.has(col.key) && col.mobile !== 'hidden')
  const labeledMeta = metaCols.some((col) => col.mobileMeta === 'labeled')
  const metaItems = metaCols
    .map((col) => ({ col, value: cellValue(col, row) }))
    .filter((item) => item.value != null && item.value !== '')
  const actionItems = actions
    .map((col) => ({ key: col.key, value: cellValue(col, row) }))
    .filter((item) => item.value != null)

  return (
    <article className={className} {...interactionProps}>
      <div className="data-table-card__top">
        {selectCols.length > 0 ? (
          <div className="data-table-card__select">
            {selectCols.map((col) => (
              <div key={col.key} className="data-table-card__select-control">
                {cellValue(col, row)}
              </div>
            ))}
          </div>
        ) : null}
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

      {metaItems.length > 0 && (
        <div
          className={
            labeledMeta
              ? 'data-table-card__meta'
              : 'data-table-card__meta data-table-card__meta--inline'
          }
        >
          {labeledMeta
            ? metaItems.map(({ col, value }) => (
                <div key={col.key} className="data-table-card__meta-item" data-column={col.key}>
                  {typeof col.label === 'string' && col.label ? (
                    <span className="data-table-card__meta-label">{col.label}</span>
                  ) : null}
                  <span className="data-table-card__meta-value">{value}</span>
                </div>
              ))
            : metaItems.map(({ col, value }, index) => (
                <span key={col.key} className="data-table-card__meta-value" data-column={col.key}>
                  {index > 0 ? (
                    <span className="data-table-card__meta-sep" aria-hidden>
                      ·
                    </span>
                  ) : null}
                  {value}
                </span>
              ))}
        </div>
      )}

      {actionItems.length > 0 ? (
        <div className="data-table-card__footer">
          {actionItems.map((item) => (
            <div key={item.key} className="data-table-card__action">
              {item.value}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  )
}
