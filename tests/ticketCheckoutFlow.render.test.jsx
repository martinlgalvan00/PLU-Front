import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

/**
 * El checkout editorial se lee en tres capítulos con un riel de avance. Lo que
 * se cuida acá es que el riel refleje lo cargado y que NADA se esconda: todos
 * los campos siguen montados, así el orden guía pero no bloquea.
 */

vi.mock('../src/components/ui/TicketPassPreview.jsx', () => ({
  default: () => <div data-testid="ticket-pass-preview" />,
}))
vi.mock('../src/components/ui/MercadoPagoEmbeddedCheckout.jsx', () => ({
  default: () => <div data-testid="mp-embedded" />,
}))

const TicketPurchaseSection = (await import('../src/components/ui/TicketPurchaseSection.jsx'))
  .default

const event = { slug: 'pitbull-classic-2026', title: 'Pitbull Classic 2026' }
const pricing = {
  eventDays: [],
  ticketTypes: [{ id: 'general', name: 'General', price: 20000 }],
  addons: [],
}

function renderSection(props = {}) {
  return render(
    <I18nProvider>
      <TicketPurchaseSection
        editorial
        showPassPreview={false}
        event={event}
        pricing={pricing}
        tickets={[]}
        createdOrder={null}
        onSubmit={() => {}}
        onUploadPaymentProof={() => {}}
        {...props}
      />
    </I18nProvider>,
  )
}

const input = (name) => document.querySelector(`input[name="${name}"]`)
const rail = () => screen.getByRole('navigation', { name: /pasos de la compra/i })
const stepState = (label) =>
  within(rail())
    .getByRole('button', { name: new RegExp(label, 'i') })
    .closest('li')
    .getAttribute('data-state')

afterEach(cleanup)

describe('checkout de entradas en capítulos', () => {
  it('muestra tres capítulos y mantiene todos los campos montados', () => {
    renderSection()
    expect(document.querySelectorAll('.ticket-flow-chapter')).toHaveLength(3)
    expect(input('attendee-0-fullName')).not.toBeNull()
    expect(input('buyer-email')).not.toBeNull()
    expect(document.querySelector('input[name="ticket-payment"]')).not.toBeNull()
  })

  it('arranca en las entradas y el total del riel sigue a la orden', () => {
    renderSection()
    expect(stepState('Entradas')).toBe('current')
    expect(stepState('Tus datos')).toBe('todo')
    expect(rail().querySelector('.ticket-flow-rail__total strong').textContent).toMatch(/20\.000/)
  })

  it('marca las entradas como completas y pasa al comprador', () => {
    renderSection()
    fireEvent.change(input('attendee-0-fullName'), { target: { value: 'Julián Mas' } })
    fireEvent.change(input('attendee-0-dni'), { target: { value: '30111222' } })

    expect(stepState('Entradas')).toBe('done')
    expect(stepState('Tus datos')).toBe('current')
  })

  it('con todo cargado los tres pasos quedan completos', () => {
    renderSection()
    fireEvent.change(input('attendee-0-fullName'), { target: { value: 'Julián Mas' } })
    fireEvent.change(input('attendee-0-dni'), { target: { value: '30111222' } })
    fireEvent.change(input('buyer-name'), { target: { value: 'Camila Rearte' } })
    fireEvent.change(input('buyer-email'), { target: { value: 'camila@example.com' } })

    expect(stepState('Entradas')).toBe('done')
    expect(stepState('Tus datos')).toBe('done')
    expect(stepState('Pago')).toBe('done')
    expect(
      rail().querySelector('.ticket-flow-rail__line').style.getPropertyValue('--ticket-flow-fill'),
    ).toBe('1')
  })

  it('un email inválido deja el paso de datos pendiente', () => {
    renderSection()
    fireEvent.change(input('buyer-name'), { target: { value: 'Camila Rearte' } })
    fireEvent.change(input('buyer-email'), { target: { value: 'camila' } })
    expect(stepState('Tus datos')).not.toBe('done')
  })

  it('el riel salta al capítulo elegido', () => {
    renderSection()
    const target = document.getElementById('ticket-chapter-payment')
    target.scrollIntoView = vi.fn()
    fireEvent.click(within(rail()).getByRole('button', { name: /pago/i }))
    expect(target.scrollIntoView).toHaveBeenCalled()
  })

  it('la variante no editorial no agrega riel ni capítulos', () => {
    renderSection({ editorial: false })
    expect(document.querySelector('.ticket-flow-rail')).toBeNull()
    expect(document.querySelector('.ticket-flow-chapter')).toBeNull()
    expect(input('buyer-email')).not.toBeNull()
  })
})
