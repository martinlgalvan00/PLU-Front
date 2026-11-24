import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { useI18n } from '../src/i18n/I18nProvider.jsx'
import EventModulesBoard from '../src/components/admin/event-editor/EventModulesBoard.jsx'
import { resolveEventModules } from '../shared/eventModules.js'

afterEach(() => cleanup())

const PLATFORM = {
  status: 'ready',
  platform: {
    paymentChannels: {
      registration: {
        mercado_pago: true,
        bank_transfer: true,
        cash_pitbull: false,
        wise_transfer: false,
      },
      ticket: { mercado_pago: true, bank_transfer: true, cash_pitbull: true, wise_transfer: false },
    },
  },
}

const BASE_DRAFT = {
  salesIntent: 'charge',
  pricing: { ticketsEnabled: true },
  publicSurface: { schedule: true },
  paymentChannelOverrides: null,
  modules: { combo: true, ticketAddons: true, door: true },
  paymentPolicy: {
    registration: { maxInstallments: null },
    ticket: { maxInstallments: null },
  },
}

function Board(props) {
  const { t } = useI18n()
  return <EventModulesBoard t={t} {...props} />
}

function renderBoard({ draft = BASE_DRAFT, canEdit = true, onGoTo = vi.fn(), gotoSections } = {}) {
  const patchDraft = vi.fn()
  render(
    <I18nProvider>
      <Board
        canEdit={canEdit}
        draft={draft}
        gotoSections={gotoSections}
        onGoTo={onGoTo}
        patchDraft={patchDraft}
        platformChannels={PLATFORM}
      />
    </I18nProvider>,
  )
  return { patchDraft, onGoTo }
}

const moduleSwitch = (name) => screen.getByRole('switch', { name })

describe('EventModulesBoard', () => {
  it('muestra los seis módulos con su estado real', () => {
    renderBoard({ draft: { ...BASE_DRAFT, salesIntent: 'announce' } })
    expect(screen.getAllByRole('switch')).toHaveLength(6)
    expect(moduleSwitch(/^inscripciones$/i).getAttribute('aria-checked')).toBe('false')
    expect(moduleSwitch(/entradas de público/i).getAttribute('aria-checked')).toBe('true')
    // Combo prendido pero sin inscripciones: avisa que no tiene efecto.
    expect(screen.getByText(/sin efecto mientras inscripciones esté apagado/i)).toBeTruthy()
  })

  it('apagar Inscripciones pasa el evento a «solo anuncio», el mismo campo de siempre', () => {
    const { patchDraft } = renderBoard()
    fireEvent.click(moduleSwitch(/^inscripciones$/i))
    const next = patchDraft.mock.calls[0][0]
    expect(next.salesIntent).toBe('announce')
    expect(resolveEventModules(next).find((module) => module.key === 'registration').on).toBe(false)
  })

  it('apagar Entradas apaga `pricing.ticketsEnabled`, y Puerta va a `modules`', () => {
    const { patchDraft } = renderBoard()
    fireEvent.click(moduleSwitch(/entradas de público/i))
    expect(patchDraft.mock.calls[0][0].pricing.ticketsEnabled).toBe(false)
    fireEvent.click(moduleSwitch(/puerta/i))
    expect(patchDraft.mock.calls[1][0].modules.door).toBe(false)
    fireEvent.click(moduleSwitch(/cronograma público/i))
    expect(patchDraft.mock.calls[2][0].publicSurface.schedule).toBe(false)
  })

  it('cada módulo que vende tiene sus propios medios: cerrar uno no toca al otro', () => {
    const { patchDraft } = renderBoard()
    const registration = screen.getByRole('group', { name: /medios de cobro de inscripciones/i })
    const transfer = within(registration).getByRole('button', { name: /transferencia/i })
    expect(transfer.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(transfer)
    const overrides = patchDraft.mock.calls[0][0].paymentChannelOverrides
    expect(overrides.registration.bank_transfer).toBe(false)
    expect(overrides.ticket).toBeUndefined()
  })

  it('el tope de cuotas se elige por módulo y solo con Mercado Pago abierto', () => {
    const { patchDraft } = renderBoard()
    const selects = screen.getAllByRole('combobox', { name: /cuotas con tarjeta/i })
    expect(selects).toHaveLength(2)
    fireEvent.change(selects[0], { target: { value: '3' } })
    const next = patchDraft.mock.calls[0][0]
    expect(next.paymentPolicy.registration.maxInstallments).toBe(3)
    expect(next.paymentPolicy.ticket.maxInstallments).toBeNull()
  })

  it('sin Mercado Pago no ofrece cuotas', () => {
    renderBoard({
      draft: {
        ...BASE_DRAFT,
        paymentChannelOverrides: { registration: { mercado_pago: false } },
      },
    })
    expect(screen.getAllByRole('combobox', { name: /cuotas con tarjeta/i })).toHaveLength(1)
  })

  it('los atajos llevan al capítulo o sección que configura el módulo', () => {
    const { onGoTo } = renderBoard({ gotoSections: ['structure'] })
    fireEvent.click(screen.getByRole('button', { name: /tipos de entrada/i }))
    expect(onGoTo).toHaveBeenCalledWith({ chapter: 'tickets' })
    fireEvent.click(screen.getByRole('button', { name: /armar la grilla/i }))
    expect(onGoTo).toHaveBeenCalledWith({ section: 'structure' })
    // Zonas no está disponible: no se ofrece un atajo que no lleva a ningún lado.
    expect(screen.queryByRole('button', { name: /zonas y seguridad/i })).toBeNull()
  })

  it('solo lectura no deja cambiar nada', () => {
    renderBoard({ canEdit: false })
    for (const control of screen.getAllByRole('switch')) expect(control.disabled).toBe(true)
  })
})
