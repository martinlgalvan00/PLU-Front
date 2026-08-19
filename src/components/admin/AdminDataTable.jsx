import { Table } from 'antd'
import { StatusBadge } from '../ui/DataTable.jsx'
import { useMemo } from 'react'

import { useHorizontalScroll } from '../../hooks/useHorizontalScroll'

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
function resolveColumnClassName(col, index) {
  const role =
    col.desktop ??
    (col.mobile === 'primary'
      ? 'primary'
      : col.mobile === 'badge'
        ? 'status'
        : col.mobile === 'action' || col.key === 'action'
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

export default function AdminDataTable({
  className = '',
  columns = [],
  rows = [],
  emptyMessage,
  onRowClick,
  rowClassName,
  loading = false,
  pagination = true,
  rowSelection,
}) {
  const scrollRef = useHorizontalScroll()
  const selectedCount = rowSelection?.selectedRowKeys?.length ?? 0

  const antdColumns = useMemo(() => {
    return columns
      .filter((col) => col.mobile !== 'hidden' || window.innerWidth > 768) // Simplificación rápida para responsive
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
        render: (text, record) => {
          return col.render ? col.render(record) : text
        },
        align: resolveAntdAlign(col.align),
      }))
  }, [columns])

  const dataSource = useMemo(() => {
    return rows.map((row) => ({ ...row, key: row.id ?? JSON.stringify(row) }))
  }, [rows])

  const selectedKeySet = useMemo(
    () => new Set(rowSelection?.selectedRowKeys ?? []),
    [rowSelection?.selectedRowKeys],
  )
  // A partir de 2 filas seleccionadas es "modo lote": la fila suma un acento
  // y la tabla un borde celeste — la selección de una sola fila no necesita
  // ese refuerzo visual, ya la marca el tinte de fondo.
  const isBulkMode = selectedCount > 1

  return (
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
              if (onRowClick && !event.target.closest('.ant-checkbox-wrapper')) {
                onRowClick(record)
              }
            },
            style: { cursor: onRowClick ? 'pointer' : 'default' },
          }
        }}
        rowClassName={(record, index) => {
          const base = typeof rowClassName === 'function' ? rowClassName(record, index) : rowClassName
          const isBulkSelected = isBulkMode && selectedKeySet.has(record.key)
          return [base, isBulkSelected ? 'data-table__row--bulk-selected' : ''].filter(Boolean).join(' ')
        }}
        rowSelection={rowSelection}
        pagination={
          pagination
            ? {
                placement: ['bottomCenter'],
                hideOnSinglePage: true,
                showSizeChanger: true,
              }
            : false
        }
        scroll={{ x: 'max-content' }}
      />
    </div>
  )
}

export { StatusBadge }
