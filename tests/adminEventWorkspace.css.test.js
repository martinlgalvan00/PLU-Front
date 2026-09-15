import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * El workspace del evento llena el content del shell. Si el tabpanel no es el
 * scrollport, el formulario se recorta y el wheel no mueve nada.
 */

const css = fs.readFileSync(
  path.resolve('src/styles/pages/admin-event-console.css'),
  'utf8',
)

const contract = css.slice(css.lastIndexOf('Contrato de scroll del workspace'))

describe('scroll del AdminEventWorkspace', () => {
  it('deja el tabpanel como único scrollport del evento', () => {
    expect(contract).toMatch(
      /\.admin-event-workspace--sidebar \.admin-event-workspace__body\s*\{[^}]*overflow-y:\s*auto/s,
    )
    expect(contract).toMatch(
      /\.admin-event-workspace--sidebar \.admin-event-workspace__panel\s*\{[^}]*overflow:\s*hidden/s,
    )
    expect(contract).toMatch(
      /\.admin-event-form__body\s*\{[^}]*overflow:\s*visible/s,
    )
  })

  it('no encoge el editor por debajo del contenido', () => {
    expect(contract).toMatch(/flex:\s*1 0 auto/)
    expect(contract).toMatch(/min-height:\s*auto/)
  })

  it('deja el pie de Guardar en el rail, no encima del formulario', () => {
    expect(css).toMatch(/\.admin-event-workspace__save:empty\s*\{[^}]*display:\s*none/s)
    expect(css).toMatch(
      /\.admin-event-workspace__save \.admin-event-form__actions\s*\{[^}]*position:\s*static/s,
    )
  })

  it('compacta el dock del rail en una fila baja', () => {
    expect(css).toMatch(
      /\.admin-event-workspace__save \.admin-event-form__action-buttons\s*\{[^}]*flex-direction:\s*row/s,
    )
    expect(css).toMatch(
      /\.admin-event-workspace__save \.admin-event-form__action-buttons \.btn\s*\{[^}]*min-height:\s*28px/s,
    )
  })

  it('deja los capítulos de Ventas visibles en notebook y desktop', () => {
    const chaptersBlock = css.slice(css.lastIndexOf('Capítulos de Ventas'))
    const nineHundred = chaptersBlock.match(
      /@media \(min-width: 900px\) \{[\s\S]*?\.admin-event-workspace__chapters\s*\{[\s\S]*?\}/,
    )

    expect(chaptersBlock).toMatch(
      /\.admin-event-workspace__chapters\s*\{[^}]*display:\s*flex/s,
    )
    expect(nineHundred).toBeNull()
  })
})
