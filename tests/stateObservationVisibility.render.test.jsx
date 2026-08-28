import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import AthleteDetailSection from '../src/pages/admin/AthleteDetailSection.jsx'
import MembershipsSection from '../src/pages/admin/MembershipsSection.jsx'
import RegistrationsSection from '../src/pages/admin/RegistrationsSection.jsx'
import { resolveStateBacking } from '../src/services/stateCoherenceService.js'

/**
 * Las observaciones de una inscripción se guardaban y no se veían.
 *
 * El caso real: la organización marcó dos inscripciones como `observada` con su
 * motivo escrito ("EL PAGO LLEGÓ A NOMBRE DE MAURO GELVEZ"). El texto quedó
 * firmado en `event_registrations.manual_override_reason` -- la persistencia
 * nunca falló -- pero ninguna pantalla lo leía: la lista pintaba un badge
 * "Observada" pelado y la ficha del atleta descartaba el motivo porque
 * `resolveEntitlementBacking` sólo mira estados que otorgan un derecho, y
 * `observada` no es uno.
 *
 * Los datos de acá son los de las dos filas reales.
 */

vi.mock('../src/services/platformSettingsAdminService.js', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchPlatformFeatureToggles: vi.fn(async () => ({
      membershipValidationEnabled: true,
      registrationValidationEnabled: true,
      ticketValidationEnabled: true,
    })),
  }
})

beforeAll(() => {
  if (typeof window.matchMedia === 'function') return
  window.matchMedia = () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  })
})

afterEach(cleanup)

const OBSERVATION = 'EL PAGO LLEGÓ A NOMBRE DE MAURO GELVEZ'

const OVERRIDE = {
  status: 'observada',
  channel: null,
  reason: OBSERVATION,
  by: 'cmss0uv370000ib04nfhrk133:maximalstrengthcorp@gmail.com',
  at: '2026-08-27T00:59:23.511675+00:00',
}

function registration(overrides = {}) {
  return {
    id: '428a53ac-184d-43a0-8d6c-e7e35ffdeccf',
    athleteId: '57220358-ed7b-44ee-8c59-93287bda9a75',
    athlete: { fullName: 'Melisa Quispe', documentId: '36725446' },
    event: 'Pitbull Classic 2026',
    eventSlug: 'pitbull-classic-2026',
    paymentOrderId: 'affdc044-d9db-4e96-8a49-464e35539f01',
    category: 'Raw',
    division: 'Open',
    status: 'observada',
    schedule: null,
    manualOverride: OVERRIDE,
    ...overrides,
  }
}

const PAYMENT = {
  id: 'affdc044-d9db-4e96-8a49-464e35539f01',
  athleteId: '57220358-ed7b-44ee-8c59-93287bda9a75',
  event: 'Pitbull Classic 2026',
  method: 'mercado_pago',
  status: 'aprobado',
  amount: 45000,
  currency: 'ARS',
}

function renderRegistrations(rows) {
  return render(
    <I18nProvider>
      <RegistrationsSection
        canEdit
        filters={{ event: 'all', status: 'all', query: '' }}
        filteredRegistrations={rows}
        payments={[PAYMENT]}
        registrations={rows}
        registrationsCount={rows.length}
        onApprovePayment={() => {}}
        onExportAdmin={() => {}}
        onExportPluUsa={() => {}}
        onSetFilters={() => {}}
      />
    </I18nProvider>,
  )
}

function reasons() {
  return [...document.querySelectorAll('.admin-state-cell__reason')].map((node) => node.textContent)
}

function notes() {
  return [...document.querySelectorAll('.admin-state-cell__note')].map((node) => node.textContent)
}

describe('la observación de una inscripción se lee donde se opera', () => {
  it('la lista de Inscripciones muestra el motivo, con quién lo escribió y cuándo', () => {
    renderRegistrations([registration()])

    expect(screen.getAllByText('Observada').length).toBeGreaterThan(0)
    expect(reasons().some((text) => text.includes('maximalstrengthcorp@gmail.com'))).toBe(true)
    expect(notes()).toContain(OBSERVATION)
  })

  it('una inscripción sin observación sigue mostrando sólo su estado', () => {
    renderRegistrations([registration({ status: 'confirmada', manualOverride: null })])

    expect(screen.getAllByText('Confirmada').length).toBeGreaterThan(0)
    expect(document.querySelector('.admin-state-cell')).toBeNull()
  })

  it('la ficha del atleta la muestra en el tab de inscripciones', () => {
    render(
      <I18nProvider>
        <AthleteDetailSection
          canEdit={false}
          detail={{
            athlete: {
              id: '57220358-ed7b-44ee-8c59-93287bda9a75',
              fullName: 'Melisa Quispe',
              documentId: '36725446',
              status: 'afiliado_activo',
            },
            memberships: [],
            registrations: [registration()],
            payments: [],
          }}
          onBack={() => {}}
        />
      </I18nProvider>,
    )
    fireEvent.click(screen.getByRole('tab', { name: /^Inscripciones/ }))

    expect(notes()).toContain(OBSERVATION)
  })
})

describe('la afiliación dice por qué está en el estado que está', () => {
  const membership = {
    id: 'd5fe8171-fd58-4906-a3bd-2d08f5c66073',
    athleteId: '57220358-ed7b-44ee-8c59-93287bda9a75',
    athlete: { fullName: 'Melisa Quispe', documentId: '36725446' },
    memberCode: 'PLU-ARG-2026-00000792',
    year: '2026',
    status: 'activa',
    startDate: '2026-08-20',
    expirationDate: `${new Date().getFullYear() + 1}-12-31`,
    manualOverride: {
      ...OVERRIDE,
      status: 'activa',
      channel: 'bank_transfer',
      reason: 'Pagó por transferencia el 20/08, comprobante en el grupo.',
    },
  }

  it('la lista de Afiliaciones muestra el motivo de una activación manual', () => {
    render(
      <I18nProvider>
        <MembershipsSection canManage memberships={[membership]} />
      </I18nProvider>,
    )

    expect(reasons().some((text) => text.includes('A mano'))).toBe(true)
    expect(reasons().some((text) => text.includes('maximalstrengthcorp@gmail.com'))).toBe(true)
    expect(notes()).toContain('Pagó por transferencia el 20/08, comprobante en el grupo.')
  })
})

describe('resolveStateBacking', () => {
  it('devuelve la procedencia de un estado que no otorga ningún derecho', () => {
    const backing = resolveStateBacking(registration(), [PAYMENT])

    expect(backing.manualOverride.reason).toBe(OBSERVATION)
    expect(backing.explained).toBe(true)
    expect(backing.diverges).toBe(false)
  })

  it('un motivo de relleno del backfill no cuenta como explicación', () => {
    const backing = resolveStateBacking(
      registration({
        manualOverride: { ...OVERRIDE, reason: 'Sin motivo registrado (anterior a 20260910100000).' },
      }),
      [PAYMENT],
    )

    expect(backing.explained).toBe(false)
  })

  it('sin motivo escrito no hay nada que mostrar', () => {
    expect(resolveStateBacking(registration({ manualOverride: null }), [PAYMENT])).toBeNull()
  })
})
