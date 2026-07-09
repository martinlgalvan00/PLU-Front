import DataTable from './DataTable.jsx'

const columns = [
  { key: 'name', label: 'Nombre' },
  { key: 'category', label: 'Categoría' },
  { key: 'total', label: 'Total' },
]

const rows = [
  { id: '1', name: 'Juan Pérez', category: '-83kg', total: '540kg' },
  { id: '2', name: 'María Gómez', category: '-63kg', total: '320kg' },
  { id: '3', name: 'Carlos Ruiz', category: '-93kg', total: '610kg' },
]

export default {
  title: 'UI/DataTable',
  component: DataTable,
  tags: ['autodocs'],
  args: { columns, rows },
}

export const Default = {}

export const Admin = {
  args: { variant: 'admin' },
}

export const Empty = {
  args: { rows: [], emptyMessage: 'No hay registros disponibles.' },
}
