import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider, useI18n } from '../src/i18n/I18nProvider.jsx'
import AdminEventEditor from '../src/components/admin/AdminEventEditor.jsx'
import PaymentAccountsPanel from '../src/components/admin/payment-accounts/PaymentAccountsPanel.jsx'
import MercadoPagoLinkResultPage from '../src/pages/MercadoPagoLinkResultPage.jsx'
import { buildAdminEventDraft } from '../src/services/eventAdminService.js'
import { invalidatePlatformPaymentChannels } from '../src/hooks/usePlatformPaymentChannels.js'
import { publishMercadoPagoOAuthResult } from '../src/lib/mercadoPagoOAuthChannel.js'
import {
  deletePaymentProfile,
  fetchPaymentProfiles,
  startMercadoPagoOAuth,
  updatePaymentProfile,
} from '../src/services/paymentProfileService.js'

vi.mock('../src/services/paymentProfileService.js', () => ({
  fetchPaymentProfiles: vi.fn(),
  createPaymentProfile: vi.fn(),
  updatePaymentProfile: vi.fn(async () => ({})),
  deletePaymentProfile: vi.fn(async () => ({ deleted: true })),
  refreshMercadoPagoProfile: vi.fn(async () => ({ refreshed: true })),
  startMercadoPagoOAuth: vi.fn(),
}))

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

const OAUTH_PROFILE = {
  id: '00000000-0000-4000-8000-0000000000a1',
  name: 'Club Anfitrión',
  kind: 'mercado_pago',
  active: true,
  connectionStatus: 'needs_reconnect',
  config: {
    publicKey: 'APP_USR-pub',
    collectorId: '241983636',
    connection: 'oauth',
    accountNickname: 'CLUBANFITRION',
    liveMode: true,
  },
  usage: {
    events: [{ id: 'e1', title: 'Pitbull Classic', finished: false }],
    shop: false,
    pinnedOrders: 3,
  },
}

const MANUAL_PROFILE = {
  id: '00000000-0000-4000-8000-0000000000a2',
  name: 'Cuenta vieja',
  kind: 'mercado_pago',
  active: true,
  connectionStatus: 'manual',
  config: { publicKey: 'APP_USR-manual-public-key', collectorId: '' },
  usage: { events: [], shop: false, pinnedOrders: 0 },
}

const BANK_PROFILE = {
  id: '00000000-0000-4000-8000-0000000000b1',
  name: 'Transferencia PLU',
  kind: 'bank_transfer',
  active: true,
  config: { alias: 'plu.arg', cbu: '0000003100000000000001', holder: 'PLU ARG' },
  usage: { events: [], shop: false, pinnedOrders: 0 },
}

function profilesResponse({ kind, oauth = true }) {
  return {
    profiles: kind === 'mercado_pago' ? [OAUTH_PROFILE, MANUAL_PROFILE] : [BANK_PROFILE],
    secretsKeyConfigured: true,
    mercadoPagoOAuth: oauth
      ? { available: true, missing: [] }
      : { available: false, missing: ['MERCADO_PAGO_CLIENT_ID'] },
  }
}

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

beforeEach(() => {
  vi.mocked(fetchPaymentProfiles).mockImplementation(async ({ kind }) => profilesResponse({ kind }))
})

afterEach(() => {
  cleanup()
  invalidatePlatformPaymentChannels()
  vi.restoreAllMocks()
  vi.mocked(updatePaymentProfile).mockClear()
  vi.mocked(deletePaymentProfile).mockClear()
})

function renderEditor({ onChange = vi.fn(), mercadoPagoProfileId = null } = {}) {
  const draft = buildAdminEventDraft({
    id: 'evt-1',
    slug: 'pitbull-classic-2026',
    title: 'Pitbull Classic',
    status: 'inscripcion_abierta',
    slots: 120,
    startsAt: '2026-09-15T12:00:00.000Z',
    endsAt: '2026-09-15T23:00:00.000Z',
    pricing: { membership: 75000, registration: 75000, combo: 120000, ticketsEnabled: true },
    mercadoPagoProfileId,
  })
  render(
    <I18nProvider>
      <AdminEventEditor
        canEdit
        canManageUsers={false}
        draft={{ ...draft, mercadoPagoProfileId }}
        onCancel={() => {}}
        onChange={onChange}
        onListSecurityUsers={async () => []}
        onSubmit={() => {}}
      />
    </I18nProvider>,
  )
  fireEvent.click(
    within(screen.getByRole('tablist', { name: /secciones del detalle/i })).getByRole('tab', {
      name: /ventas y cupos/i,
    }),
  )
  fireEvent.click(
    within(screen.getByRole('tablist', { name: /capítulos de ventas y cupos/i })).getByRole('tab', {
      name: /^cobro/i,
    }),
  )
  return { onChange }
}

describe('editor del evento — cuenta de Mercado Pago', () => {
  it('dice en qué cuenta cobra y pide reconectar la que MP dejó de autorizar', async () => {
    renderEditor({ mercadoPagoProfileId: OAUTH_PROFILE.id })

    const alert = await screen.findByText(/dejó de autorizar a CLUBANFITRION/i)
    expect(alert.closest('[role="alert"]')).not.toBeNull()
    expect(screen.getByRole('button', { name: /^reconectar$/i })).toBeTruthy()
    // La opción del selector dice quién cobra, no la public key.
    expect(screen.getByRole('option', { name: 'Club Anfitrión · CLUBANFITRION' })).toBeTruthy()
  })

  it('sin cuenta propia dice que cobra la cuenta general y ofrece conectar', async () => {
    renderEditor()
    expect(await screen.findByText('Cobra en la cuenta general de PLU.')).toBeTruthy()
    expect(await screen.findByRole('button', { name: /conectar cuenta de mercado pago/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /cargar credenciales a mano/i })).toBeTruthy()
  })

  it('vincular abre MP en otra ventana y deja elegida la cuenta nueva al volver', async () => {
    const popup = { closed: false, location: { href: 'about:blank' }, focus: vi.fn(), close: vi.fn() }
    vi.spyOn(window, 'open').mockReturnValue(popup)
    vi.mocked(startMercadoPagoOAuth).mockResolvedValue('https://auth.mercadopago.com/authorization?x=1')
    const { onChange } = renderEditor()

    fireEvent.click(await screen.findByRole('button', { name: /conectar cuenta de mercado pago/i }))
    // La ventana se abre en el mismo click (si no, el navegador la bloquea).
    expect(window.open).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(popup.location.href).toBe('https://auth.mercadopago.com/authorization?x=1'),
    )
    expect(screen.getByText(/completá la autorización/i)).toBeTruthy()

    publishMercadoPagoOAuthResult({ status: 'connected', profileId: 'nuevo-perfil', created: true })

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ mercadoPagoProfileId: 'nuevo-perfil' }),
      ),
    )
  })

  it('con el popup bloqueado ofrece abrir Mercado Pago a mano', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    vi.mocked(startMercadoPagoOAuth).mockResolvedValue('https://auth.mercadopago.com/authorization?y=2')
    renderEditor()

    fireEvent.click(await screen.findByRole('button', { name: /conectar cuenta de mercado pago/i }))
    const link = await screen.findByRole('link', { name: /abrir mercado pago/i })
    expect(link.getAttribute('href')).toBe('https://auth.mercadopago.com/authorization?y=2')
    expect(link.getAttribute('rel')).toContain('noopener')
  })
})

describe('panel de cuentas de cobro', () => {
  it('lista las cuentas por medio con su uso; eliminar solo si no se usa', async () => {
    render(
      <I18nProvider>
        <PanelWithI18n canEdit />
      </I18nProvider>,
    )

    const mpGroup = await screen.findByRole('group', { name: 'Mercado Pago' })
    const oauthRow = within(mpGroup).getByText('Club Anfitrión').closest('li')
    expect(within(oauthRow).getByText(/usada en 1 evento: pitbull classic/i)).toBeTruthy()
    // Con eventos u órdenes fijadas no se ofrece eliminar: solo archivar.
    expect(within(oauthRow).queryByRole('button', { name: /eliminar/i })).toBeNull()
    expect(within(oauthRow).getByRole('button', { name: /^reconectar$/i })).toBeTruthy()

    const manualRow = within(mpGroup).getByText('Cuenta vieja').closest('li')
    expect(within(manualRow).getByText(/credenciales cargadas a mano/i)).toBeTruthy()
    expect(within(manualRow).getByRole('button', { name: /eliminar/i })).toBeTruthy()

    const bankGroup = screen.getByRole('group', { name: 'Transferencia bancaria' })
    expect(within(bankGroup).getByText(/plu\.arg · PLU ARG · 0000003100000000000001/)).toBeTruthy()
  })

  it('archivar manda active:false y eliminar pasa por confirmación', async () => {
    render(
      <I18nProvider>
        <PanelWithI18n canEdit />
      </I18nProvider>,
    )
    const mpGroup = await screen.findByRole('group', { name: 'Mercado Pago' })
    const oauthRow = within(mpGroup).getByText('Club Anfitrión').closest('li')
    fireEvent.click(within(oauthRow).getByRole('button', { name: /^archivar$/i }))
    await waitFor(() =>
      expect(updatePaymentProfile).toHaveBeenCalledWith(OAUTH_PROFILE.id, { active: false }),
    )

    const manualRow = within(mpGroup).getByText('Cuenta vieja').closest('li')
    fireEvent.click(within(manualRow).getByRole('button', { name: /eliminar/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /^eliminar$/i }))
    await waitFor(() => expect(deletePaymentProfile).toHaveBeenCalledWith(MANUAL_PROFILE.id))
  })

  it('sin la app de MP configurada explica qué falta y no ofrece conectar', async () => {
    vi.mocked(fetchPaymentProfiles).mockImplementation(async ({ kind }) =>
      profilesResponse({ kind, oauth: false }),
    )
    render(
      <I18nProvider>
        <PanelWithI18n canEdit />
      </I18nProvider>,
    )
    expect(await screen.findByText(/MERCADO_PAGO_CLIENT_ID/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /conectar cuenta de mercado pago/i })).toBeNull()
  })

  it('una cuenta bancaria nueva exige alias', async () => {
    render(
      <I18nProvider>
        <PanelWithI18n canEdit />
      </I18nProvider>,
    )
    fireEvent.click(await screen.findByRole('button', { name: /agregar cuenta bancaria/i }))
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Club anfitrión' } })
    fireEvent.submit(screen.getByRole('form', { name: /nueva cuenta bancaria/i }))
    expect(await screen.findByText('La cuenta necesita un alias.')).toBeTruthy()
  })

  it('sin permiso de escritura no muestra acciones', async () => {
    render(
      <I18nProvider>
        <PanelWithI18n canEdit={false} />
      </I18nProvider>,
    )
    await screen.findByRole('group', { name: 'Mercado Pago' })
    expect(screen.queryByRole('button', { name: /archivar|eliminar|editar|conectar/i })).toBeNull()
  })
})

describe('ventana de vuelta de la vinculación', () => {
  it('avisa al panel y explica el resultado', async () => {
    window.history.pushState({}, '', '/admin/mercado-pago/vinculacion?status=cancelled&code=access_denied')
    const received = []
    const channel = new BroadcastChannel('plu:mercado-pago-oauth')
    channel.onmessage = (event) => received.push(event.data)
    try {
      render(
        <I18nProvider>
          <MercadoPagoLinkResultPage />
        </I18nProvider>,
      )
      expect(screen.getByRole('heading', { name: 'Vinculación cancelada' })).toBeTruthy()
      await waitFor(() => expect(received[0]).toMatchObject({ status: 'cancelled' }))
    } finally {
      channel.close()
      window.history.pushState({}, '', '/')
    }
  })
})

// El panel recibe `t` de la sección; acá se lo da el provider real.
function PanelWithI18n(props) {
  const { t } = useI18n()
  return <PaymentAccountsPanel t={t} {...props} />
}
