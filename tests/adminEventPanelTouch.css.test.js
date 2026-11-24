import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Panel de eventos en mobile: nada de opciones escondidas detrás del borde ni
 * blancos táctiles por debajo de 44px. Se anclan las reglas que lo garantizan.
 */

const read = (file) => fs.readFileSync(path.resolve(file), 'utf8')
const consoleCss = read('src/styles/pages/admin-event-console.css')
const quickCss = read('src/styles/pages/admin-event-quick.css')
const securityCss = read('src/styles/pages/admin-event-security.css')
const shellCss = read('src/styles/layout/admin-shell.css')
const workspace = read('src/components/admin/AdminEventWorkspace.jsx')
const quickCreate = read('src/components/admin/AdminEventQuickCreate.jsx')

describe('alta de evento · tipo de evento', () => {
  it('los chips bajan de renglón en vez de quedar en un riel que esconde opciones', () => {
    expect(quickCreate).toContain('admin-event-quick__section--presets')
    expect(quickCss).toMatch(
      /\.admin-event-quick__section--presets \.admin-filter-chips\s*\{[^}]*flex-wrap:\s*wrap/s,
    )
    expect(quickCss).toMatch(/\.admin-event-quick__section--presets[^{]*\{[^}]*mask-image:\s*none/s)
  })
})

describe('workspace · rieles deslizables', () => {
  it('acciones, pestañas y capítulos se funden en el borde mientras queda contenido', () => {
    expect(consoleCss).toMatch(/@property --admin-rail-fade\s*\{[^}]*initial-value:\s*0px/s)
    expect(consoleCss).toMatch(/animation-timeline:\s*scroll\(self inline\)/)
    for (const rail of [
      '.admin-event-bar',
      '.admin-event-workspace__nav',
      '.admin-event-workspace__chapters',
    ]) {
      expect(consoleCss).toContain(rail)
    }
    expect(consoleCss).toMatch(/@supports \(animation-timeline: scroll\(self inline\)\)/)
  })
})

describe('blancos táctiles de 44px', () => {
  it('el workspace carga la hoja del botón "Abrir control de puerta" que usa', () => {
    expect(workspace).toContain("import '../../styles/pages/admin-event-security.css'")
  })

  it('control de puerta, check-in, íconos e idioma llegan a 44px con puntero grueso', () => {
    expect(securityCss).toMatch(
      /@media \(pointer: coarse\)\s*\{\s*\.admin-event-security__launch\s*\{\s*min-height:\s*44px/s,
    )
    expect(consoleCss).toMatch(
      /@media \(pointer: coarse\)\s*\{\s*\.admin-event-workspace__security-link\s*\{\s*min-height:\s*44px/s,
    )
    expect(shellCss).toMatch(/\.admin-shell__icon-button::after\s*\{[^}]*inset:\s*-4px/s)
    expect(shellCss).toMatch(
      /\.admin-shell__header-actions \.locale-switch__segment-option::after\s*\{[^}]*inset:\s*-9px 0/s,
    )
  })
})
