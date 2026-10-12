import { expect, within } from 'storybook/test'
import PaymentExpiryPanel from './PaymentExpiryPanel.jsx'
import { AdminPreviewShell } from '../../pages/admin/adminPreviewShell.jsx'

/**
 * Cierre automático de órdenes dentro del shell real. El endpoint se intercepta
 * a nivel `fetch` para que el panel recorra su camino completo.
 */

export default {
  title: 'Admin/Vencimiento de órdenes',
  parameters: { layout: 'fullscreen' },
}

function mockOverview(overview) {
  const original = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    const url = String(typeof input === 'string' ? input : (input?.url ?? ''))
    if (url.includes('/api/platform-settings/expiry-overview')) {
      return new Response(JSON.stringify(overview), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    return original(input, init)
  }
  return () => {
    globalThis.fetch = original
  }
}

function Screen({ canEdit = true }) {
  return (
    <AdminPreviewShell section="payments">
      <PaymentExpiryPanel canEdit={canEdit} />
    </AdminPreviewShell>
  )
}

export const TodoEnCero = {
  beforeEach: () =>
    mockOverview({
      manualWindowMinutes: 7200,
      staleAttemptGraceMinutes: 30,
      expiredStillOpen: 0,
      heldForProof: 0,
      blockedByProvider: 0,
      reapableAttempts: 0,
      nextExpiringAt: '2026-10-11T22:42:00.000Z',
    }),
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Vencimiento de órdenes')).toBeTruthy()
    await expect(await canvas.findByText('5 días')).toBeTruthy()
  },
}

export const ConOrdenesTrabadas = {
  beforeEach: () =>
    mockOverview({
      manualWindowMinutes: 4320,
      staleAttemptGraceMinutes: 120,
      expiredStillOpen: 9,
      heldForProof: 2,
      blockedByProvider: 3,
      reapableAttempts: 1,
      nextExpiringAt: '2026-10-12T14:10:00.000Z',
    }),
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('3 días')).toBeTruthy()
  },
}

export const SoloLectura = {
  beforeEach: () =>
    mockOverview({
      manualWindowMinutes: 7200,
      staleAttemptGraceMinutes: 30,
      expiredStillOpen: 0,
      heldForProof: 0,
      blockedByProvider: 0,
      reapableAttempts: 0,
      nextExpiringAt: null,
    }),
  render: () => <Screen canEdit={false} />,
}
