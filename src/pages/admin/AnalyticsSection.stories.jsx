import { expect, userEvent, within } from 'storybook/test'
import AnalyticsSection from './AnalyticsSection.jsx'
import { AdminPreviewShell, installAdminMockApi } from './adminPreviewShell.jsx'

/**
 * Informe de uso del sitio dentro del shell real. Lectura: la cifra que manda
 * (visitantes) con su variación → curva diaria → titulares del período →
 * embudo → calendario → operación. Los endpoints se interceptan a nivel
 * `fetch`; las fechas de la serie son relativas a hoy.
 */

export default {
  title: 'Admin/Analítica',
  parameters: { layout: 'fullscreen' },
  beforeEach: () => installAdminMockApi(),
}

const ATHLETES = [{ id: 'a-1', fullName: 'Camila Ruiz', documentId: '30111222' }]

function Screen(props) {
  return (
    <AdminPreviewShell section="analytics">
      <AnalyticsSection
        athletes={ATHLETES}
        canViewIdentity
        canViewPaymentFailures
        onNavigate={() => {}}
        {...props}
      />
    </AdminPreviewShell>
  )
}

export const Resumen = {
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // "Visitantes únicos" es la cifra del hero y también una pestaña del gráfico.
    await expect((await canvas.findAllByText('Visitantes únicos')).length).toBeGreaterThan(0)
    await expect(await canvas.findByText('Lo que se destaca')).toBeTruthy()
    // El embudo marca su tramo de mayor caída.
    await expect(await canvas.findByText('Mayor caída')).toBeTruthy()
    // La curva rotula su pico.
    await expect(canvasElement.querySelector('.admin-analytics__traffic-peak')).toBeTruthy()
  },
}

export const SinPermisosDeIdentidad = {
  render: () => <Screen canViewIdentity={false} canViewPaymentFailures={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect((await canvas.findAllByText('Visitantes únicos')).length).toBeGreaterThan(0)
    await expect(canvas.queryByRole('tab', { name: 'Atleta' })).toBeNull()
  },
}

export const SemanaCorta = {
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: 'Últimos 7 días' }))
    await expect((await canvas.findAllByText('Visitantes únicos')).length).toBeGreaterThan(0)
  },
}

export const PaginasYMapaDeCalor = {
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('tab', { name: 'Páginas' }))
    await expect(await canvas.findByText('Páginas más vistas')).toBeTruthy()
  },
}
