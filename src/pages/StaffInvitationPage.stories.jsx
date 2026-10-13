import { expect, fn, waitFor, within } from 'storybook/test'
import StaffInvitationPage from './StaffInvitationPage.jsx'

/**
 * Página a la que llega quien recibe el enlace de invitación. No hay deep link
 * con el que auditarla (el token es de un solo uso), así que estas stories son
 * su superficie de QA visual: invitación nominal (el admin ya cargó nombre y
 * email) e invitación abierta (la persona completa sus datos).
 */

export default {
  title: 'Pages/Staff/Invitación al panel',
  component: StaffInvitationPage,
  parameters: { layout: 'fullscreen' },
  args: {
    token: 'token-firmado-de-ejemplo',
    onAccept: fn(async () => {}),
    onCancel: fn(),
  },
}

export const Nominal = {
  args: {
    onLoadInvitation: async () => ({
      invitation: {
        needsProfile: false,
        name: 'Lucía Fernández',
        email: 'lucia.fernandez@pluarg.com.ar',
        roleName: 'Super Admin',
      },
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByText('Lucía Fernández')).toBeVisible())
  },
}

export const Abierta = {
  args: {
    onLoadInvitation: async () => ({
      invitation: { needsProfile: true, name: '', email: '', roleName: 'Super Admin' },
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() => expect(canvas.getByLabelText('Nombre y apellido')).toBeVisible())
  },
}

export const EnlaceVencido = {
  args: {
    onLoadInvitation: async () => {
      throw Object.assign(new Error('invalid'), { status: 400 })
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await waitFor(() =>
      expect(canvas.getByText(/inválida, ya fue utilizada o venció/)).toBeVisible(),
    )
  },
}
