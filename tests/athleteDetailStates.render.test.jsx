import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import AthleteDetailSection from '../src/pages/admin/AthleteDetailSection.jsx'
import { derivePaymentProgress } from '../src/lib/paymentProgress.js'

/**
 * La ficha que se reportó: "Michelle Sofía Correa tiene la afiliación como
 * estado Activa pero en su sección de pagos dice cancelada".
 *
 * Los datos son los de la fila real. Lo que se verifica es que las dos cosas
 * sigan diciendo lo que dicen -- porque las dos son ciertas -- y que la pantalla
 * agregue el tercer hecho que las une, que es el que faltaba.
 */

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  }
})

afterEach(cleanup)

const ORDER_ID = '321e2026-0db4-4968-9f7e-a57d874cf3cc'

const athlete = {
  id: '734ce483-038a-47cb-8016-93a8df5e8597',
  fullName: 'Michelle Sofía Correa',
  documentId: '41575917',
  gym: 'Strength',
  status: 'afiliado_activo',
}

function order(overrides = {}) {
  return {
    status: 'cancelado',
    method: 'mercado_pago',
    expiresAt: '2026-08-20T19:36:32.131105+00:00',
    updatedAt: '2026-08-20T19:39:00.100422+00:00',
    cancellationCode: 'resolved_off_platform',
    cancellationReason: null,
    ...overrides,
  }
}

function detailFor({ membershipOverride, cancellationCode = 'resolved_off_platform' } = {}) {
  const membership = {
    id: 'd5fe8171-fd58-4906-a3bd-2d08f5c66073',
    year: '2026',
    status: 'activa',
    memberCode: 'PLU-ARG-2026-00000792',
    startDate: '2026-08-20',
    expirationDate: '2027-08-20',
    paymentOrderId: ORDER_ID,
    manualOverride: membershipOverride,
  }

  const raw = order({ cancellationCode })

  return {
    athlete,
    memberships: [membership],
    registrations: [],
    payments: [
      {
        id: ORDER_ID,
        athleteId: athlete.id,
        concept: 'Afiliación anual 2026',
        conceptType: 'membership',
        amount: 85000,
        method: 'mercado_pago',
        status: 'cancelado',
        reference: 'MORD-c943ca6cde2df28c',
        createdAt: '2026-08-20T19:06:32.131105+00:00',
        cancellationCode: raw.cancellationCode,
        progress: derivePaymentProgress({
          order: raw,
          attempts: [],
          outcome: {
            kind: 'membership',
            status: membership.status,
            manualOverride: membershipOverride,
          },
        }),
      },
    ],
  }
}

function renderDetail(detail) {
  return render(
    <I18nProvider>
      <AthleteDetailSection detail={detail} canEdit={false} onBack={() => {}} />
    </I18nProvider>,
  )
}

/**
 * La ficha abre en Perfil, así que las tablas de los otros tabs no están en el
 * DOM hasta que se las pide. El aviso de divergencia, en cambio, vive arriba de
 * los tabs a propósito -- es lo único que no hay que ir a buscar.
 */
function openTab(name) {
  fireEvent.click(screen.getByRole('tab', { name: new RegExp(`^${name}`) }))
}

const EXPLAINED_OVERRIDE = {
  status: 'activa',
  channel: 'bank_transfer',
  reason: 'Pagó por transferencia el 20/08, comprobante en el grupo.',
  by: 'cmss0uv370000ib04nfhrk133:maximalstrengthcorp@gmail.com',
  at: '2026-08-20T23:35:55.487078+00:00',
}

describe('ficha del atleta: afiliación activa con el pago cancelado', () => {
  it('avisa de la divergencia antes de los tabs, sin que haya que compararlos a mano', () => {
    renderDetail(detailFor({ membershipOverride: EXPLAINED_OVERRIDE }))

    const notice = document.querySelector('.athlete-detail__divergence')
    expect(notice).toBeTruthy()
    expect(notice.textContent).toContain('Afiliación')
    expect(notice.textContent).toContain('Activa')
    expect(notice.textContent).toContain('Cancelado')
    // Quién lo resolvió y por qué: el mail, no el id interno.
    expect(notice.textContent).toContain('maximalstrengthcorp@gmail.com')
    expect(notice.textContent).toContain('Pagó por transferencia el 20/08')
    expect(document.querySelector('.athlete-detail__divergence-quote p')?.textContent).toContain(
      'Pagó por transferencia el 20/08',
    )
  })

  it('marca como pendiente la divergencia que nadie explicó', () => {
    renderDetail(
      detailFor({
        membershipOverride: {
          ...EXPLAINED_OVERRIDE,
          channel: null,
          reason: 'Sin motivo registrado (anterior a 20260910100000).',
        },
      }),
    )

    const notice = document.querySelector('.athlete-detail__divergence')
    expect(notice.dataset.unexplained).toBe('true')
    expect(notice.textContent).toContain('Nadie dejó anotado por qué')
  })

  it('no muestra el aviso cuando el cobro respalda la afiliación', () => {
    const detail = detailFor({ membershipOverride: null })
    detail.payments[0].status = 'aprobado'
    detail.payments[0].progress = derivePaymentProgress({
      order: order({ status: 'aprobado', cancellationCode: null }),
      attempts: [],
      outcome: { kind: 'membership', status: 'activa' },
    })

    renderDetail(detail)

    expect(document.querySelector('.athlete-detail__divergence')).toBeNull()
  })

  it('el estado del cobro nunca aparece sin su motivo', () => {
    renderDetail(detailFor({ membershipOverride: EXPLAINED_OVERRIDE }))
    openTab('Pagos')

    // El badge sigue diciendo Cancelado -- es lo que pasó -- pero ya no viaja
    // solo: al lado va por qué, y que no corresponde acreditarlo.
    const reasons = [...document.querySelectorAll('.admin-state-cell__reason')].map(
      (node) => node.textContent,
    )
    expect(reasons.some((text) => text.includes('el derecho se otorgó a mano'))).toBe(true)
    expect(reasons.some((text) => text.includes('No corresponde acreditar esta orden'))).toBe(true)

    // Y no lo dice dos veces: la nota de "quedó activa por otra vía" repetía el
    // mismo hecho y duplicaba el alto de la fila en una tabla que se lee
    // comparando filas.
    const notes = [...document.querySelectorAll('.admin-state-cell__note')].map(
      (node) => node.textContent,
    )
    expect(notes.some((text) => text.includes('no hay que volver a cobrar'))).toBe(false)
  })

  it('sí avisa que se resolvió por otra vía cuando el motivo no lo dice', () => {
    // Orden que venció sola pero el derecho quedó otorgado: acá el motivo habla
    // del vencimiento y no del otorgamiento, así que la nota es la única que
    // evita que la ficha se contradiga entre tabs.
    renderDetail(
      detailFor({
        membershipOverride: EXPLAINED_OVERRIDE,
        cancellationCode: 'expired_without_payment',
      }),
    )
    openTab('Pagos')

    const notes = [...document.querySelectorAll('.admin-state-cell__note')].map(
      (node) => node.textContent,
    )
    expect(notes.some((text) => text.includes('no hay que volver a cobrar'))).toBe(true)
  })

  it('la afiliación dice que la activó una persona, con fecha y canal', () => {
    renderDetail(detailFor({ membershipOverride: EXPLAINED_OVERRIDE }))
    openTab('Afiliaciones')

    const stamps = [...document.querySelectorAll('.admin-state-cell__reason')].map(
      (node) => node.textContent,
    )
    expect(stamps.some((text) => text.includes('A mano'))).toBe(true)
    expect(stamps.some((text) => text.includes('maximalstrengthcorp@gmail.com'))).toBe(true)
    expect(stamps.some((text) => text.includes('Transferencia bancaria'))).toBe(true)
  })

  it('explica un vencimiento sin pago como vencimiento, no como rechazo', () => {
    renderDetail(
      detailFor({ membershipOverride: null, cancellationCode: 'expired_without_payment' }),
    )
    openTab('Pagos')

    const reasons = [...document.querySelectorAll('.admin-state-cell__reason')].map(
      (node) => node.textContent,
    )
    expect(reasons.some((text) => text.includes('sin un solo intento de pago registrado'))).toBe(
      true,
    )
  })
})
