import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import AdminEventEditor from '../src/components/admin/AdminEventEditor.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { buildAdminEventDraft } from '../src/services/eventAdminService.js'
import { invalidatePlatformPaymentChannels } from '../src/hooks/usePlatformPaymentChannels.js'

/**
 * Seguimiento del guardado: qué cambió, qué falló, dónde está el problema y
 * qué sí alcanzó a guardarse. Antes un rechazo del servidor era una línea roja
 * sin contexto, en una pestaña que podía no ser la del campo que faltaba.
 */
vi.mock('../src/services/platformSettingsAdminService.js', async (importOriginal) => {
  const original = await importOriginal()
  return {
    ...original,
    fetchPlatformFeatureToggles: vi.fn(async () => ({
      checkoutEnabled: true,
      environmentHolds: [],
      paymentChannels: Object.fromEntries(
        original.PAYMENT_CONCEPTS.map((concept) => [
          concept,
          Object.fromEntries(original.PAYMENT_CHANNELS.map((channel) => [channel, true])),
        ]),
      ),
    })),
  }
})

beforeAll(() => {
  globalThis.IntersectionObserver ??= class {
    constructor(callback) {
      this.callback = callback
    }

    observe() {
      this.callback?.([{ isIntersecting: true }], this)
    }

    disconnect() {}
  }
})

afterEach(() => {
  invalidatePlatformPaymentChannels()
  cleanup()
})

const SOURCE = {
  id: 'evt-1',
  slug: 'barbell-submission-2027',
  title: 'Barbell Submission',
  venue: 'Virtus Fitness',
  location: 'Berazategui',
  status: 'proximamente',
  slots: 180,
  startsAt: '2027-03-06T12:00:00.000Z',
  endsAt: '2027-03-06T23:00:00.000Z',
  pricing: { membership: 75000, registration: 75000, combo: 120000, ticketsEnabled: false },
}

function Harness({ onSubmit, extra = {} }) {
  const [draft, setDraft] = useState(() => buildAdminEventDraft(SOURCE))
  return (
    <I18nProvider>
      <AdminEventEditor
        canEdit
        canManageUsers={false}
        draft={draft}
        sourceEvent={null}
        onCancel={() => {}}
        onChange={setDraft}
        onListSecurityUsers={async () => []}
        onSubmit={onSubmit}
        {...extra}
      />
    </I18nProvider>
  )
}

function changeTitle(value = 'Barbell Submission II') {
  fireEvent.change(screen.getByLabelText(/título público/i), { target: { value } })
}

function save() {
  fireEvent.submit(document.querySelector('form.admin-event-form'))
}

function serverRejection() {
  const error = new Error('La transferencia está abierta pero no tiene a dónde cobrar.')
  error.status = 400
  error.body = {
    code: 'EVENT_BANK_TRANSFER_ALIAS_REQUIRED',
    fields: { bankTransferProfileId: 'Falta el destino de cobro.' },
  }
  return error
}

describe('seguimiento del guardado', () => {
  it('sin tocar nada dice que no hay cambios pendientes', () => {
    render(<Harness onSubmit={vi.fn()} />)
    expect(screen.getAllByText(/sin cambios pendientes/i).length).toBeGreaterThan(0)
  })

  it('con cambios, dice en qué parte están', () => {
    render(<Harness onSubmit={vi.fn()} />)
    changeTitle()
    expect(screen.getAllByText(/sin guardar: datos/i).length).toBeGreaterThan(0)
  })

  it('un rechazo del servidor lleva al capítulo donde falta el dato', async () => {
    const onSubmit = vi.fn(async () => {
      throw serverRejection()
    })
    render(<Harness onSubmit={onSubmit} />)
    changeTitle()
    save()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/no tiene a dónde cobrar/i)
    const go = within(alert).getByRole('button', { name: /ir a cobro/i })

    fireEvent.click(go)

    await waitFor(() => {
      const panel = document.getElementById('event-section-sales-payment')
      expect(panel).not.toBeNull()
      expect(panel.hasAttribute('hidden')).toBe(false)
    })
  })

  it('si el estado y el acceso ya se habían guardado, lo dice', async () => {
    const onSubmit = vi.fn(async () => {
      throw serverRejection()
    })
    const onExtraSave = vi.fn(async () => ({}))
    render(<Harness onSubmit={onSubmit} extra={{ extraDirty: true, onExtraSave }} />)
    changeTitle()
    save()

    const alert = await screen.findByRole('alert')
    expect(onExtraSave).toHaveBeenCalledTimes(1)
    expect(alert.textContent).toMatch(/el estado y el acceso sí se guardaron/i)
  })

  it('un error común no ofrece un salto que no existe', async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error('Otra persona modificó este evento.')
    })
    render(<Harness onSubmit={onSubmit} />)
    changeTitle()
    save()

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toMatch(/otra persona modificó/i)
    expect(within(alert).queryByRole('button')).toBeNull()
  })

  it('un guardado con avisos dice qué falta y a dónde ir, sin marcarlo como error', async () => {
    const onSubmit = vi.fn(async () => ({
      warnings: [
        {
          code: 'EVENT_BANK_TRANSFER_ALIAS_REQUIRED',
          message: 'La transferencia está abierta pero no tiene a dónde cobrar.',
          field: 'bankTransferProfileId',
        },
      ],
    }))
    render(<Harness onSubmit={onSubmit} />)
    changeTitle()
    save()

    const notice = await screen.findByText(/se guardó, pero falta completar algo/i)
    expect(screen.queryByRole('alert')).toBeNull()
    const box = notice.closest('[role="status"]')
    expect(box.textContent).toMatch(/no tiene a dónde cobrar/i)
    expect(within(box).getByRole('button', { name: /ir a cobro/i })).toBeTruthy()
  })
})
