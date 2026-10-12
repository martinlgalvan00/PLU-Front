import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * El drawer phone del admin ya se rompió una vez: `display: block` sobre
 * `.admin-shell__brand-copy` dejaba "PLU ARG" y "OPERATIVO" en la misma
 * línea, y el footer pintaba un fondo opaco distinto al del aside.
 *
 * Además el Drawer de antd monta el sidebar en un portal, FUERA de
 * `.admin-shell`: si las reglas del cromo cuelgan de ese ancestro, el menú
 * del teléfono queda sin estilos. Estas invariantes clavan las tres cosas.
 */

const shellCss = fs.readFileSync(path.resolve('src/styles/layout/admin-shell.css'), 'utf8')

function ruleBody(css, selector) {
  const start = css.indexOf(`\n${selector} {`)
  expect(start, `no existe la regla ${selector}`).toBeGreaterThan(-1)
  const open = css.indexOf('{', start)
  return css.slice(open + 1, css.indexOf('}', open))
}

describe('drawer phone del AdminShell', () => {
  it('muestra la marca como grilla de dos líneas, no como spans en línea', () => {
    expect(ruleBody(shellCss, '.admin-shell__brand-copy')).toMatch(/display:\s*grid/)
    expect(shellCss).toMatch(
      /\.admin-shell__brand-name,\s*\.admin-shell__brand-subtitle\s*\{[^}]*display:\s*block/,
    )
  })

  it('no pinta el footer como una losa distinta al sidebar', () => {
    const footer = ruleBody(shellCss, '.admin-shell__footer')
    expect(footer).not.toMatch(/background/)
    expect(footer).not.toMatch(/admin-sidebar-surface/)
  })

  it('estiliza el menú sin depender de `.admin-shell` como ancestro (el drawer es un portal)', () => {
    const chromeRules = shellCss.match(
      /^\.admin-shell__(?:brand|footer|account|exit|nav|pin|scroll)[^{]*\{/gm,
    )
    expect(chromeRules?.length).toBeGreaterThan(10)
    for (const selector of chromeRules) {
      expect(selector).not.toMatch(/^\.admin-shell\s+\./)
    }
    expect(shellCss).toMatch(/\.admin-shell__drawer \.ant-drawer-body\s*\{/)
  })
})
