import FinanceSection from './FinanceSection.jsx'
import '../../styles/pages/admin.css'

/**
 * Libro de caja. El service está mockeado por historia interceptando
 * `fetch` — el componente ejercita el camino real (service + estado), no un
 * doble que se puede desincronizar del contrato.
 */

const ROWS = [
  {
    id: 'income-1',
    kind: 'income',
    occurredOn: '2026-08-10',
    category: 'Afiliación',
    conceptKey: 'membership',
    description: 'Afiliación — Ana Torres',
    amount: 42000,
    currency: 'ARS',
    reference: 'ORD-1042',
    party: 'Ana Torres',
  },
  {
    id: 'income-2',
    kind: 'income',
    occurredOn: '2026-08-08',
    category: 'Entrada',
    conceptKey: 'ticket',
    description: 'Entrada — Lucas Ferro',
    amount: 45000,
    currency: 'ARS',
    reference: 'TCK-2210',
    party: 'Lucas Ferro',
  },
  {
    id: 'income-3',
    kind: 'income',
    occurredOn: '2026-08-04',
    category: 'Afiliación',
    conceptKey: 'membership',
    description: 'Afiliación — Camila Ruiz',
    amount: 42000,
    currency: 'ARS',
    reference: 'ORD-1051',
    party: 'Camila Ruiz',
  },
  {
    id: 'income-4',
    kind: 'income',
    occurredOn: '2026-08-12',
    category: 'Inscripción',
    conceptKey: 'registration',
    description: 'Inscripción — Bruno Diaz',
    amount: 85000,
    currency: 'ARS',
    reference: 'ORD-1060',
    party: 'Bruno Diaz',
  },
  {
    id: 'income-5',
    kind: 'income',
    occurredOn: '2026-08-09',
    category: 'Afiliación + inscripción',
    conceptKey: 'combo',
    description: 'Afiliación + inscripción — Sofía Méndez',
    amount: 110000,
    currency: 'ARS',
    reference: 'ORD-1055',
    party: 'Sofía Méndez',
  },
  {
    id: 'expense-1',
    kind: 'expense',
    occurredOn: '2026-08-05',
    category: 'Logística',
    conceptKey: 'expense',
    description: 'Alquiler de plataforma y discos',
    amount: 38000,
    currency: 'ARS',
    reference: null,
    party: null,
  },
  {
    id: 'expense-2',
    kind: 'expense',
    occurredOn: '2026-08-02',
    category: 'Premios',
    conceptKey: 'expense',
    description: 'Medallas y trofeos categoría Open',
    amount: 21000,
    currency: 'ARS',
    reference: null,
    party: null,
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
        // Alta, edición y borrado comparten interceptor: el alta/edición
        // devuelve el asiento; el borrado, 204 sin cuerpo.
        if ((init?.method ?? 'POST').toUpperCase() === 'DELETE') {
          return new Response(null, { status: 204 })
        }
        return new Response(JSON.stringify({ expense: { id: 'expense-upserted' } }), {
          status: (init?.method ?? 'POST').toUpperCase() === 'PATCH' ? 200 : 201,
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
