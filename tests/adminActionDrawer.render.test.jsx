import { cleanup, render, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import AdminActionDrawer from '../src/components/admin/AdminActionDrawer.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import MotionProvider from '../src/motion/MotionProvider.tsx'

beforeAll(() => {
  window.matchMedia ??= (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    dispatchEvent: () => false,
  })
})

afterEach(cleanup)

function item(id, priority = 'high') {
  return {
    id,
    type: 'payment',
    priority,
    subject: `Atleta ${id}`,
    summary: 'Validar pago manual',
    detail: 'Afiliación anual',
    meta: '$ 75.000',
    section: 'payments',
    paymentId: id,
    hasProof: false,
  }
}

describe('AdminActionDrawer', () => {
  it('pone la cola en un cuerpo scrolleable y no duplica el título', () => {
    render(
      <I18nProvider>
        <MotionProvider>
          <AdminActionDrawer
            open
            items={[
              item('p1'),
              item('p2'),
              item('p3'),
              item('p4', 'medium'),
              item('p5', 'medium'),
            ]}
            canEdit
            onClose={vi.fn()}
            onNavigate={vi.fn()}
            onApprovePayment={vi.fn()}
            onApproveTicketOrder={vi.fn()}
          />
        </MotionProvider>
      </I18nProvider>,
    )

    const drawer = document.getElementById('admin-action-drawer')
    expect(drawer).toBeTruthy()

    const body = drawer.querySelector('.admin-action-drawer__body')
    expect(body).toBeTruthy()
    expect(body.querySelector('.action-queue')).toBeTruthy()

    expect(within(drawer).getAllByRole('heading', { name: /requiere atención/i })).toHaveLength(1)
    expect(within(body).getByText('Atleta p5')).toBeTruthy()
  })
})
