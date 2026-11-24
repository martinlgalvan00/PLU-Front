import { useState } from 'react'
import AdminEventEditor from '../AdminEventEditor.jsx'
import { AdminPreviewShell } from '../../../pages/admin/adminPreviewShell.jsx'
import { buildAdminEventDraft } from '../../../services/eventAdminService.js'

/**
 * El bloque de Mercado Pago del editor del evento (Ventas → Cobro): en qué
 * cuenta cobra el evento, su estado y el botón para vincular una nueva.
 */

export default {
  title: 'Admin/Editor de evento/Cuenta de Mercado Pago',
  parameters: { layout: 'fullscreen' },
}

const DAY = 86_400_000

const PROFILES = [
  {
    id: 'mp-1',
    name: 'PLU · Pitbull Classic',
    kind: 'mercado_pago',
    active: true,
    connectionStatus: 'connected',
    config: {
      connection: 'oauth',
      accountNickname: 'PLUARGENTINA',
      collectorId: '241983636',
      liveMode: true,
      expiresAt: new Date(Date.now() + 150 * DAY).toISOString(),
    },
  },
  {
    id: 'mp-3',
    name: 'Club anfitrión Rosario',
    kind: 'mercado_pago',
    active: true,
    connectionStatus: 'needs_reconnect',
    config: { connection: 'oauth', accountEmail: 'tesoreria@clubrosario.test', status: 'needs_reconnect' },
  },
]

function mockProfiles({ oauthAvailable = true } = {}) {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input)
    if (!url.includes('/api/payment-profiles')) return originalFetch(input, options)
    const kind = new URL(url, 'http://local').searchParams.get('kind')
    return new Response(
      JSON.stringify({
        profiles: kind === 'mercado_pago' ? PROFILES : [],
        secretsKeyConfigured: true,
        mercadoPagoOAuth: { available: oauthAvailable, missing: [] },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )
  }
  return () => {
    globalThis.fetch = originalFetch
  }
}

function Screen({ profileId }) {
  const [draft, setDraft] = useState(() =>
    buildAdminEventDraft({
      id: 'evt-1',
      slug: 'open-rosario-2027',
      title: 'Open Rosario',
      venue: 'Club Rosario',
      location: 'Rosario / Santa Fe',
      status: 'proximamente',
      slots: 120,
      startsAt: '2027-04-10T12:00:00.000Z',
      endsAt: '2027-04-10T23:00:00.000Z',
      pricing: { membership: 75000, registration: 75000, combo: 120000 },
      mercadoPagoProfileId: profileId,
    }),
  )
  return (
    <AdminPreviewShell section="events">
      <AdminEventEditor
        canEdit
        draft={{ ...draft, mercadoPagoProfileId: draft.mercadoPagoProfileId ?? profileId }}
        onCancel={() => {}}
        onChange={setDraft}
        onSubmit={async () => ({ event: { id: 'evt-1' } })}
      />
    </AdminPreviewShell>
  )
}

/** Abre Ventas → Cobro para que la captura muestre el bloque. */
async function openPaymentChapter({ canvasElement }) {
  const root = canvasElement.ownerDocument
  const find = (selector, text) =>
    [...root.querySelectorAll(selector)].find((node) => text.test(node.textContent ?? ''))
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const tab = find('[role="tab"]', /ventas y cupos/i)
    if (tab) {
      tab.click()
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const chapter = find('[role="tab"]', /^cobro/i)
    if (chapter) {
      chapter.click()
      break
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/** Cuenta vinculada y al día: dice en qué cuenta entra la plata. */
export const CuentaVinculada = {
  render: () => <Screen profileId="mp-1" />,
  beforeEach: () => mockProfiles(),
  play: openPaymentChapter,
}

/** MP dejó de autorizar la cuenta: aviso y "Reconectar" en la misma línea. */
export const CuentaParaReconectar = {
  render: () => <Screen profileId="mp-3" />,
  beforeEach: () => mockProfiles(),
  play: openPaymentChapter,
}

/** Sin cuenta propia: cobra la cuenta general y se ofrece vincular una. */
export const CuentaGeneral = {
  render: () => <Screen profileId={null} />,
  beforeEach: () => mockProfiles(),
  play: openPaymentChapter,
}
