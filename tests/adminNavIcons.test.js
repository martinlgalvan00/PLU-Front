import fs from 'node:fs'
import path from 'node:path'
import * as lucide from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { ADMIN_NAV_GROUPS as ADMIN_NAV_GROUPS_ES } from '../src/lib/content/es.js'
import { ADMIN_NAV_GROUPS as ADMIN_NAV_GROUPS_EN } from '../src/lib/content/en.js'

/**
 * adminNavIcons.test.js — PLU ARG
 *
 * El ícono de cada ítem del panel viaja como STRING en `content/*.js` y
 * `AdminShell` lo resuelve contra un mapa local. El lookup no tiene fallback:
 * una clave que falta devuelve `undefined`, React lo rechaza como tipo de
 * elemento y se cae la shell entera —no el ítem— con "Element type is
 * invalid".
 *
 * Ya pasó: la sección `grid` se sumó a la navegación con `LayoutGrid` y el
 * ícono nunca se agregó al mapa, así que el panel no abría.
 */

const shell = fs.readFileSync(path.resolve('src/components/layout/AdminShell.jsx'), 'utf8')

// Las claves del objeto `ICONS = { ... }`, que es shorthand: `LayoutGrid,`.
const mappedIcons = new Set(
  /const ICONS = \{([\s\S]*?)\n\}/
    .exec(shell)[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean),
)

const navIcons = [
  ...new Set(
    [...ADMIN_NAV_GROUPS_ES, ...ADMIN_NAV_GROUPS_EN].flatMap((group) =>
      group.items.map(([, , icon]) => icon),
    ),
  ),
]

describe('íconos de la navegación del panel', () => {
  it('encuentra al menos un ícono en cada lado, o el test no está midiendo nada', () => {
    expect(navIcons.length).toBeGreaterThan(0)
    expect(mappedIcons.size).toBeGreaterThan(0)
  })

  it.each(navIcons)('%s está en el mapa de AdminShell', (icon) => {
    expect(mappedIcons).toContain(icon)
  })

  it.each(navIcons)('%s existe en lucide-react', (icon) => {
    // Los íconos de lucide son `forwardRef`, o sea objetos, no funciones: lo
    // que importa es que React reciba algo y no `undefined`.
    expect(lucide[icon]).toBeTruthy()
  })

  it('usa los mismos íconos en los dos idiomas', () => {
    const iconsOf = (groups) => groups.flatMap((group) => group.items.map(([key, , icon]) => `${key}:${icon}`))
    expect(iconsOf(ADMIN_NAV_GROUPS_EN)).toEqual(iconsOf(ADMIN_NAV_GROUPS_ES))
  })
})
