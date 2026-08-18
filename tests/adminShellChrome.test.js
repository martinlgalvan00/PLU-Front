import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * El chrome del panel tiene que quedar anclado al viewport: si el documento
 * scrollea entero, el rail se va y Resumen desaparece. Estas invariantes
 * clavan el layout de app (100dvh + overflow hidden) y el pin de dashboard
 * fuera de la región scrolleable del menú.
 */

const shell = fs.readFileSync(path.resolve('src/components/layout/AdminShell.jsx'), 'utf8')
const shellCss = fs.readFileSync(path.resolve('src/styles/layout/admin-shell.css'), 'utf8')

describe('chrome fijo del AdminShell', () => {
  it('bloquea el shell al viewport para que scrollee el contenido, no la página', () => {
    expect(shellCss).toMatch(/\.admin-shell\s*\{[^}]*height:\s*100dvh/)
    expect(shellCss).toMatch(/\.admin-shell\s*\{[^}]*overflow:\s*hidden/)
    expect(shellCss).toMatch(/\.admin-shell__main\s*\{[^}]*min-height:\s*0/)
    expect(shellCss).toMatch(/\.admin-shell__main\s*\{[^}]*overflow:\s*hidden/)
    expect(shellCss).toMatch(/\.admin-shell__content\.ant-layout-content\s*\{[^}]*overflow:\s*auto/)
    expect(shellCss).toMatch(/\.admin-shell__nav-scroll\s*\{[^}]*min-height:\s*0/)
    expect(shellCss).toMatch(/\.admin-shell__nav-scroll\s*\{[^}]*overflow-y:\s*auto/)
  })

  it('deja Resumen anclado fuera del menú scrolleable', () => {
    expect(shell).toMatch(/const PINNED_NAV_KEY = 'dashboard'/)
    expect(shell).toContain('admin-shell__nav-pin')
    expect(shell).toContain('admin-shell__nav-scroll')
    expect(shell).toContain('splitPinnedNav')
    expect(shell.indexOf('admin-shell__nav-pin')).toBeLessThan(
      shell.indexOf('admin-shell__nav-scroll'),
    )
  })

  it('no usa transition:all en el sider del chrome', () => {
    const siderBlock =
      /admin-shell__sidebar-component\.ant-layout-sider[\s\S]*?admin-shell__sidebar-inner/
    expect(shellCss).toMatch(siderBlock)
    const match = shellCss.match(
      /\.admin-shell__sidebar-component\.ant-layout-sider,\s*\.admin-shell__sidebar-component\.ant-layout-sider-collapsed\s*\{([^}]+)\}/,
    )
    expect(match).toBeTruthy()
    expect(match[1]).not.toMatch(/transition:\s*all/)
  })
})
