import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * El drawer phone del admin ya se rompió una vez: `display: block` sobre
 * `.admin-shell__brand-copy` dejaba "PLU ARG" y "OPERATIVO" en la misma
 * línea, y el footer pintaba `--admin-sidebar-surface` opaco contra el
 * vidrio del aside. Este test clava esas dos invariantes en el CSS.
 */

const shellCss = fs.readFileSync(path.resolve('src/styles/layout/admin-shell.css'), 'utf8')
const institutionalCss = fs.readFileSync(
  path.resolve('src/styles/pages/admin-institutional.css'),
  'utf8',
)

function mediaBlock(css, query) {
  const start = css.indexOf(query)
  expect(start).toBeGreaterThan(-1)
  return css.slice(start)
}

describe('drawer phone del AdminShell', () => {
  const phoneShell = mediaBlock(shellCss, '@media (max-width: 767px)')
  const phoneInstitutional = mediaBlock(institutionalCss, '@media (max-width: 767px)')

  it('restaura la marca como grilla, no como spans en línea', () => {
    expect(phoneShell).toMatch(
      /\.admin-shell--collapsed \.admin-shell__brand-copy\s*\{[^}]*display:\s*grid/,
    )
    expect(phoneShell).not.toMatch(
      /\.admin-shell--collapsed \.admin-shell__brand-copy\s*,[\s\S]{0,280}display:\s*block/,
    )
    expect(shellCss).toMatch(
      /\.admin-shell__brand-name,\s*\.admin-shell__brand-subtitle\s*\{[^}]*display:\s*block/,
    )
  })

  it('no pinta el footer como una losa distinta al sidebar', () => {
    expect(institutionalCss).not.toMatch(
      /\.admin-shell \.admin-shell__footer\s*\{[^}]*admin-sidebar-surface/,
    )
    expect(phoneInstitutional).toMatch(
      /\.admin-shell \.admin-shell__footer[\s\S]{0,220}background:\s*transparent/,
    )
  })
})
