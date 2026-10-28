import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useState } from 'react'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import AdminEventEditor from '../src/components/admin/AdminEventEditor.jsx'
import { buildAdminEventDraft } from '../src/services/eventAdminService.js'

/**
 * Venta → Cobro dentro de la consola del evento (editor en modo acordeón).
 * Antes el alta de una cuenta de Mercado Pago existía solo en el editor modal:
 * desde la página del evento no había forma de vincular una cuenta nueva.
 */

const EVENT = {
  id: 'evt-1',
  slug: 'barbell-submission-2027',
  title: 'Barbell Submission',
  venue: 'Virtus Fitness',
  location: 'Berazategui / Buenos Aires',
  status: 'inscripcion_abierta',
  published: true,
  slots: 120,
  startsAt: '2027-03-06T12:00:00.000Z',
  endsAt: '2027-03-06T23:00:00.000Z',
  pricing: { membership: 75000, registration: 75000, combo: 120000 },
}

beforeAll(() => {
  window.matchMedia ??= () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
  Element.prototype.scrollIntoView ??= () => {}
})

let originalFetch
beforeEach(() => {
  originalFetch = globalThis.fetch
  globalThis.fetch = vi.fn(async (input) => {
    const url = String(input)
    const body = url.includes('/api/payment-profiles')
      ? {
          profiles: [],
          secretsKeyConfigured: true,
          mercadoPagoOAuth: { available: true, missing: [] },
        }
      : {}
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
})

afterEach(() => {
  globalThis.fetch = originalFetch
  cleanup()
})

function Console({ eventScoped = false }) {
  const [draft, setDraft] = useState(() => buildAdminEventDraft(EVENT))
  return (
    <AdminEventEditor
      accordion
      embedded
      canEdit
      eventScoped={eventScoped}
      draft={draft}
      forcedTab="sales"
      forcedChapter="payment"
      sourceEvent={EVENT}
      onCancel={() => {}}
      onChange={setDraft}
      onSubmit={async () => ({ event: EVENT })}
    />
  )
}

function renderConsole(props) {
  return render(
    <I18nProvider>
      <Console {...props} />
    </I18nProvider>,
  )
}

describe('Venta → Cobro en la consola del evento', () => {
  it('ofrece vincular o cargar una cuenta de Mercado Pago sin salir del evento', async () => {
    renderConsole()
    expect(
      await screen.findByRole('button', { name: /conectar cuenta de mercado pago/i }),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: /cargar credenciales a mano/i })).toBeTruthy()
  })

  it('el interruptor "Solo anuncio" no deja el checkbox nativo a la vista', async () => {
    renderConsole()
    const toggle = await screen.findByRole('checkbox', { name: /solo anuncio/i })
    expect(toggle.classList.contains('admin-event-form__toggle-input')).toBe(true)
  })

  it('valida las credenciales antes de habilitar "Crear perfil MP"', async () => {
    renderConsole()
    fireEvent.click(await screen.findByRole('button', { name: /cargar credenciales a mano/i }))

    const create = screen.getByRole('button', { name: /crear perfil mp/i })
    expect(create.disabled).toBe(true)

    const publicKey = screen.getByLabelText(/public key/i)
    const accessToken = screen.getByLabelText(/access token/i)

    fireEvent.change(publicKey, { target: { value: 'pk-pegada-mal' } })
    expect(screen.getByText(/la public key empieza con app_usr-/i)).toBeTruthy()

    // Par de entornos distintos: uno de prueba y otro de producción.
    fireEvent.change(publicKey, { target: { value: 'TEST-1234abcd-ef' } })
    fireEvent.change(accessToken, { target: { value: 'APP_USR-99887766-aa' } })
    expect(screen.getByText(/son de entornos distintos/i)).toBeTruthy()
    expect(create.disabled).toBe(true)

    fireEvent.change(accessToken, { target: { value: 'TEST-99887766-aa' } })
    await waitFor(() => expect(create.disabled).toBe(false))
  })

  it('"Cancelar" cierra la carga manual', async () => {
    renderConsole()
    fireEvent.click(await screen.findByRole('button', { name: /cargar credenciales a mano/i }))
    fireEvent.click(screen.getByRole('button', { name: /^cancelar$/i }))
    expect(screen.queryByRole('button', { name: /crear perfil mp/i })).toBeNull()
  })

  it('una cuenta por evento (organizador) vincula por Mercado Pago pero no carga credenciales sueltas', async () => {
    renderConsole({ eventScoped: true })
    expect(
      await screen.findByRole('button', { name: /conectar cuenta de mercado pago/i }),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: /cargar credenciales a mano/i })).toBeNull()
  })
})

describe('Venta → Cobro: tabla de medios con su estado', () => {
  it('cada medio dice si está listo o qué falta, en su propia fila', async () => {
    renderConsole()
    const transfer = (await screen.findByText(/falta elegir una cuenta o cargar un alias/i)).closest(
      '.admin-event-form__channel-row',
    )
    expect(transfer.dataset.state).toBe('missing')
    expect(screen.getByText(/1 por completar/i)).toBeTruthy()
  })

  it('"Configurar" lleva al bloque del medio y deja el foco en su primer campo', async () => {
    renderConsole()
    const row = (await screen.findByText(/falta elegir una cuenta o cargar un alias/i)).closest(
      '.admin-event-form__channel-row',
    )
    fireEvent.click(within(row).getByRole('button', { name: /configurar/i }))
    const block = document.getElementById('event-payment-config-bank_transfer')
    expect(block).toBeTruthy()
    expect(block.contains(document.activeElement)).toBe(true)
  })
})
