import { expect, fn, userEvent, within } from 'storybook/test'
import RolesSection from './RolesSection.jsx'
import { AdminPreviewShell } from './adminPreviewShell.jsx'
import {
  PREVIEW_AUTHORIZATION,
  PREVIEW_ROLES,
  PREVIEW_ROLE_ACTIVITY,
} from './adminPreviewFixtures.js'
import { PERMISSION_CATALOG } from '../../lib/permissions.js'

/**
 * Roles y permisos dentro del shell real. Dos lecturas: comparar (quién puede
 * qué en todos los roles) y editar (un rol, por área). "Comunicación" trae a
 * propósito `athletes.delete` y `analytics.identity`: permisos que la matriz
 * anterior no podía mostrar.
 */

export default {
  title: 'Admin/Roles y permisos',
  parameters: { layout: 'fullscreen' },
}

function Screen(props) {
  return (
    <AdminPreviewShell section="roles">
      <RolesSection
        activity={PREVIEW_ROLE_ACTIVITY}
        authorization={PREVIEW_AUTHORIZATION}
        onCreateRole={fn(async (draft) => ({ id: 'nuevo', ...draft, permissions: [] }))}
        onUpdatePermissions={fn(async (id, permissions) => ({ id, permissions }))}
        onUpdateStatus={fn(async () => ({}))}
        permissionCatalog={PERMISSION_CATALOG}
        roles={PREVIEW_ROLES}
        {...props}
      />
    </AdminPreviewShell>
  )
}

export const Comparar = {
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(await canvas.findByText('Quién puede qué')).toBeTruthy()
    await expect(canvas.getByText('Eliminar atletas')).toBeTruthy()
    // Una columna por rol, con su cantidad de usuarios.
    await expect(canvas.getByRole('button', { name: /Comunicación/ })).toBeTruthy()
  },
}

export const Editar = {
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: /Comunicación/ }))
    await expect(
      await canvas.findByRole('heading', { level: 2, name: 'Comunicación' }),
    ).toBeTruthy()
    // Los permisos que antes no tenían columna ahora se ven y se editan.
    await expect(canvas.getByRole('checkbox', { name: 'Eliminar atletas' }).checked).toBe(true)
    await expect(
      canvas.getByRole('checkbox', { name: 'Ver el recorrido de un atleta' }).checked,
    ).toBe(true)
  },
}

export const CambiosSinGuardar = {
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('tab', { name: 'Editar rol' }))
    await userEvent.click(await canvas.findByRole('checkbox', { name: 'Eliminar eventos' }))
    await expect(await canvas.findByText('Hay cambios sin guardar')).toBeTruthy()
    // Una sola acción principal: aplicar. Descartar es secundaria.
    await expect(canvas.getByRole('button', { name: 'Aplicar cambios' })).toBeTruthy()
    await expect(canvas.getByRole('button', { name: 'Descartar' })).toBeTruthy()
  },
}

export const RolProtegido = {
  render: () => <Screen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(await canvas.findByRole('button', { name: /Super Admin/ }))
    await expect(await canvas.findByText(/Los permisos de este rol están protegidos/)).toBeTruthy()
    await expect(canvas.getAllByRole('checkbox').every((box) => box.disabled)).toBe(true)
  },
}
