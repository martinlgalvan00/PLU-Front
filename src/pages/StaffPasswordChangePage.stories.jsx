import { expect, fn, waitFor, within } from 'storybook/test'
import StaffPasswordChangePage from './StaffPasswordChangePage.jsx'

/**
 * Interstitial bloqueante: sólo aparece con una sesión real que tenga
 * `mustChangePassword`, así que no hay deep link con el que auditarlo. Esta
 * story es su única superficie de QA visual y de accesibilidad.
 */

export default {
  title: 'Pages/Staff/Cambio de contraseña obligatorio',
  component: StaffPasswordChangePage,
  parameters: { layout: 'fullscreen' },
  args: {
    session: { email: 'coordinacion@pluarg.com.ar', role: 'staff' },
    onChangePassword: fn(async () => {}),
    onLogout: fn(),
  },
}

export const Pendiente = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    // `waitFor`: los campos entran con la cascada de opacidad del acceso
    // (auth-field-enter, hasta 260ms de delay), así que arrancan en opacity 0.
    await waitFor(() => expect(canvas.getByLabelText(/^contraseña actual$/i)).toBeVisible())
    await waitFor(() => expect(canvas.getByLabelText(/^contraseña nueva$/i)).toBeVisible())
    await waitFor(() =>
      expect(canvas.getByRole('button', { name: /guardar|cambiar|continuar/i })).toBeEnabled(),
    )
  },
}

export const ConErroresDeValidacion = {
  play: async ({ canvasElement, userEvent }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: /guardar|cambiar|continuar/i }))
    await expect(await canvas.findAllByRole('alert')).not.toHaveLength(0)
  },
}
