import FinanceSection from './FinanceSection.jsx'
import '../../styles/pages/admin.css'

/**
 * Caja del período. El service está mockeado por historia interceptando
 * `fetch` — el componente ejercita el camino real (service + estado), no un
 * doble que se puede desincronizar del contrato.
 */

const ROWS = [
  {
    id: 'income-1',
    kind: 'income',
    occurredOn: '2026-08-10',
    category: 'Cobro aprobado',
    description: 'Afiliación anual — Ana Torres',
    amount: 42000,
    currency: 'ARS',
    reference: 'ORD-1042',
  },
  {
    id: 'income-2',
    kind: 'income',
    occurredOn: '2026-08-08',
    category: 'Cobro aprobado',
    description: 'Entrada Pitbull Classic — Lucas Ferro',
    amount: 45000,
    currency: 'ARS',
    reference: 'TCK-2210',
  },
  {
    id: 'income-3',
    kind: 'income',
    occurredOn: '2026-08-04',
    category: 'Cobro aprobado',
    description: 'Afiliación anual — Camila Ruiz',
    amount: 42000,
    currency: 'ARS',
    reference: 'ORD-1051',
  },
  {
    id: 'expense-1',
    kind: 'expense',
    occurredOn: '2026-08-05',
    category: 'Logística',
    description: 'Alquiler de plataforma y discos',
    amount: 38000,
    currency: 'ARS',
    reference: null,
  },
  {
    id: 'expense-2',
    kind: 'expense',
    occurredOn: '2026-08-02',
    category: 'Premios',
    description: 'Medallas y trofeos categoría Open',
    amount: 21000,
    currency: 'ARS',
    reference: null,
  },
]

function totalsFor(rows) {
  const totals = rows.reduce((acc, row) => ({ ...acc, [row.kind]: acc[row.kind] + row.amount }), {
    income: 0,
    expense: 0,
  })
  return { ...totals, balance: totals.income - totals.expense }
}

function withReport(rows) {
  const totals = totalsFor(rows)
  return (Story) => {
    const original = globalThis.fetch
    globalThis.fetch = async (input, init) => {
      const url = String(typeof input === 'string' ? input : (input?.url ?? ''))
      if (url.includes('/api/finance/expenses')) {
        return new Response(JSON.stringify({ expense: { id: 'expense-new' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (url.includes('/api/finance')) {
        return new Response(JSON.stringify({ rows, totals }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return original ? original(input, init) : new Response('{}', { status: 200 })
    }
    return <Story />
  }
}

export default {
  title: 'Admin/Finanzas',
  component: FinanceSection,
  parameters: { layout: 'padded' },
}

/** Caja con movimientos mixtos y permiso de carga de egresos. */
export const Operativa = {
  args: { canEdit: true },
  decorators: [withReport(ROWS)],
}

/** Rol sin permiso de aprobación: sin formulario de carga. */
export const SoloLectura = {
  args: { canEdit: false },
  decorators: [withReport(ROWS)],
}

/** Período sin movimientos. */
export const SinMovimientos = {
  args: { canEdit: true },
  decorators: [withReport([])],
}
