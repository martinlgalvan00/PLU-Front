import { Table } from 'antd'
import { StatusBadge } from '../ui/DataTable.jsx'
import { useMemo } from 'react'

import { useHorizontalScroll } from '../../hooks/useHorizontalScroll'

export default function AdminDataTable({
  className = '',
  columns = [],
  rows = [],
  emptyMessage,
  onRowClick,
  rowClassName,
  loading = false,
}) {
  const scrollRef = useHorizontalScroll()

  const antdColumns = useMemo(() => {
    return columns
      .filter((col) => col.mobile !== 'hidden' || window.innerWidth > 768) // Simplificación rápida para responsive
      .map((col) => ({
        title: col.label,
        dataIndex: col.key,
        key: col.key,
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
        align: col.align || 'left',
      }))
  }, [columns])

  const dataSource = useMemo(() => {
    return rows.map((row) => ({ ...row, key: row.id ?? JSON.stringify(row) }))
  }, [rows])

  return (
    <div ref={scrollRef}>
      <Table
        className={`admin-data-table ${className}`}
        columns={antdColumns}
        dataSource={dataSource}
        loading={loading}
        locale={{ emptyText: emptyMessage || 'Sin datos' }}
        onRow={(record) => {
          return {
            onClick: () => {
              if (onRowClick) onRowClick(record)
            },
            style: { cursor: onRowClick ? 'pointer' : 'default' },
          }
        }}
        rowClassName={rowClassName}
        pagination={{
          placement: ['bottomCenter'],
          hideOnSinglePage: true,
          showSizeChanger: true,
        }}
        scroll={{ x: 'max-content' }}
      />
    </div>
  )
}

export { StatusBadge }
