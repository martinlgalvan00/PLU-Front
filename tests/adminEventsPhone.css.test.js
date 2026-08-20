import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * En el rail colapsado y en teléfonos de ~300px los chips de estado
 * del evento tienen que ser usables: grilla 2 cols en anchos medios,
 * rail horizontal bajo ~430px para no comprimir etiquetas largas.
 * También se asertan los bloques `@container` para no quedar ciegos
 * al caso viewport amplio + contenido ~685px.
 */

const css = fs.readFileSync(path.resolve('src/styles/pages/admin-minimal.css'), 'utf8')

function mediaBlock(query) {
  const start = css.indexOf(query)
  expect(start).toBeGreaterThan(-1)
  return css.slice(start)
}

describe('Eventos en teléfono', () => {
  it('envuelve los chips de estado en grilla de 2 columnas bajo 900px', () => {
    const stacked = mediaBlock('@media (max-width: 900px)')
    expect(stacked).toMatch(
      /\.admin-event-state \.admin-filter-chips\s*\{[^}]*grid-template-columns:\s*repeat\(2/,
    )
  })

  it('vuelve al rail horizontal bajo 430px para no comprimir etiquetas', () => {
    const phone = mediaBlock('@media (max-width: 430px)')
    expect(phone).toMatch(
      /\.admin-event-state \.admin-filter-chips\s*\{[^}]*display:\s*flex[^}]*overflow-x:\s*auto/s,
    )
    expect(phone).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/)
    expect(phone).toMatch(/overflow-x:\s*clip/)
  })

  it('repite la grilla de estados en container query para ~685px de contenido', () => {
    const stacked = mediaBlock('@container admin-panel (max-width: 899px)')
    expect(stacked).toMatch(
      /\.admin-event-state \.admin-filter-chips\s*\{[^}]*grid-template-columns:\s*repeat\(2/,
    )
  })

  it('repite el rail de estados en container query bajo 430px', () => {
    const phone = mediaBlock('@container admin-panel (max-width: 430px)')
    expect(phone).toMatch(
      /\.admin-event-state \.admin-filter-chips\s*\{[^}]*display:\s*flex[^}]*overflow-x:\s*auto/s,
    )
  })
})

/**
 * Mínimo táctil de los controles de acceso al meet.
 *
 * `.admin-filter-chip` no declara `min-height`: la altura sale del padding y
 * queda en 26px. En la consola de operación eso ya estaba resuelto; en el
 * editor —un modal que también se usa en tablet— los chips de estado público y
 * de acceso quedaban por debajo del target táctil. El bump va solo bajo
 * `pointer: coarse` para no engordar la densidad del panel con mouse.
 */
describe('Target táctil de los chips de acceso', () => {
  const adminCss = fs.readFileSync(path.resolve('src/styles/pages/admin.css'), 'utf8')

  function coarseBlock(source) {
    const start = source.indexOf('@media (pointer: coarse)')
    expect(start).toBeGreaterThan(-1)
    return source.slice(start, source.indexOf('}\n}', start) + 3)
  }

  it('la consola de operación lleva chips, publicación y acciones a 44px en touch', () => {
    const coarse = coarseBlock(css)
    expect(coarse).toContain('.admin-event-state .admin-filter-chip')
    expect(coarse).toContain('.admin-event-state__visibility')
    expect(coarse).toContain('.admin-event-state__registration-action')
    expect(coarse).toMatch(/min-height:\s*44px/)
  })

  it('el editor lleva sus chips a 44px en touch', () => {
    const coarse = coarseBlock(adminCss)
    expect(coarse).toMatch(/\.admin-event-form \.admin-filter-chip\s*\{[^}]*min-height:\s*44px/)
  })

  // Con mouse la densidad del panel se conserva: el bump no puede estar en la
  // regla base o el editor entero crecería 18px por fila de chips.
  it('no toca la altura con puntero fino', () => {
    expect(adminCss).not.toMatch(/^\.admin-filter-chip \{[^}]*min-height/m)
  })
})
