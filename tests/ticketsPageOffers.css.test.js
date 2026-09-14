import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * En tablet/phone la vidriera de tipos no puede seguir siendo una grilla de
 * cards editoriales: tres entradas ocupaban más de 500px de alto.
 */

const css = fs.readFileSync(path.resolve('src/styles/pages/tickets.css'), 'utf8')

function mediaBlock(query) {
  const start = css.indexOf(query)
  expect(start).toBeGreaterThan(-1)
  return css.slice(start)
}

describe('vidriera de entradas en mobile', () => {
  it('pasa a listado de una columna bajo 860px', () => {
    const stacked = mediaBlock('@media (max-width: 860px)')
    expect(stacked).toMatch(
      /\.tickets-page \.tickets-page__offers-grid\s*\{[^}]*grid-template-columns:\s*1fr/s,
    )
    expect(stacked).toMatch(
      /\.tickets-page \.ticket-type-options__head\s*\{[^}]*display:\s*contents/s,
    )
    expect(stacked).toMatch(
      /\.tickets-page \.ticket-type-options__option\s*\{[^}]*padding:\s*12px 0/s,
    )
  })
})
