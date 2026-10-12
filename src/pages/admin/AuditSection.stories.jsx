import { expect, userEvent, waitFor, within } from 'storybook/test'
import AuditSection from './AuditSection.jsx'
import { AdminPreviewShell, installAdminMockApi } from './adminPreviewShell.jsx'
import {
  PREVIEW_AUDIT_OVERVIEW_ATTENTION,
  PREVIEW_AUDIT_OVERVIEW_HEALTHY,
} from './adminPreviewFixtures.js'

/**
 * Bitácora dentro del shell real. Los endpoints se interceptan a nivel `fetch`:
 * el componente recorre el camino completo (service → normalización → feed).
 * Orden de lectura: estado de la operación, filtros, eventos agrupados por día.
 */

export default {
  title: 'Admin/Auditoría',
  parameters: { layout: 'fullscreen' },
}

function Screen() {
  return (
    <AdminPreviewShell section="audit">
      <AuditSection canEdit ticketEvents={[]} />
    </AdminPreviewShell>
  )
}

export const RequiereRevision = {
  beforeEach: () => installAdminMockApi({ auditOverview: PREVIEW_AUDIT_OVERVIEW_ATTENTION }),
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Requiere revisión')).toBeTruthy()
    // Una sola línea de estado, con el desglose de qué requiere revisión.
    await expect(canvas.getByText(/3 incidencias de negocio/)).toBeTruthy()
    // Con incidencias abiertas, la lista arranca recortada a lo que falló.
    await expect(await canvas.findByRole('heading', { level: 3, name: /^Hoy/ })).toBeTruthy()
    await expect(canvas.getByText('Webhook de pago fallido')).toBeTruthy()
  },
}

export const TodoEnOrden = {
  beforeEach: () => installAdminMockApi({ auditOverview: PREVIEW_AUDIT_OVERVIEW_HEALTHY }),
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Sin incidencias')).toBeTruthy()
    await expect(await canvas.findByText('Pago acreditado')).toBeTruthy()
  },
}

export const ConDetalle = {
  // Estado sano: con incidencias abiertas la lista se recorta sola a lo que
  // falló al terminar de cargar, y la fila elegida se desmontaría antes del clic.
  beforeEach: () => installAdminMockApi({ auditOverview: PREVIEW_AUDIT_OVERVIEW_HEALTHY }),
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const rows = await canvas.findAllByRole('button', { name: /Ver detalle y contexto/ })
    await userEvent.click(rows[0])
    // Los ids técnicos viven en el diálogo, no repetidos en cada fila. El diálogo
    // es `aria-modal` y se monta en un portal: se lo busca por su panel.
    await waitFor(() => expect(document.querySelector('.audit-detail__panel')).toBeTruthy())
  },
}

export const SinRegistros = {
  beforeEach: () =>
    installAdminMockApi({ auditRows: [], auditOverview: PREVIEW_AUDIT_OVERVIEW_HEALTHY }),
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(
      await canvas.findByText('No hay registros que coincidan con los filtros'),
    ).toBeTruthy()
  },
}
