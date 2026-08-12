import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * El flujo de acceso (login, recuperar, restablecer, invitación de staff,
 * cambio de contraseña obligatorio y puerta de seguridad) comparte el bloque
 * `.login-*` de `pages/design-phase2.css`.
 *
 * Ese bloque fijaba `color: #fff` y `rgba(255,255,255,…)`, y una segunda hoja
 * (`themes/design-pages-theme.css`) lo repintaba entero para light. Cuando las
 * dos capas se desincronizaban, el texto tipeado quedaba blanco sobre canvas
 * claro. Ahora hay una sola capa con tokens: este test evita que vuelva la
 * segunda.
 */

// `import.meta.url` no es un file:// URL bajo el entorno jsdom del proyecto.
const designPhase2 = readFileSync(
  resolve(process.cwd(), 'src/styles/pages/design-phase2.css'),
  'utf8',
)
const designPagesTheme = readFileSync(
  resolve(process.cwd(), 'src/styles/themes/design-pages-theme.css'),
  'utf8',
)

/** Devuelve el cuerpo de la primera regla que coincide exactamente con el selector. */
function ruleBody(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`))
  return match ? match[2] : null
}

describe('tokens de tema del flujo de acceso', () => {
  it('el texto tipeado y el placeholder salen de tokens, no de blanco fijo', () => {
    const input = ruleBody(designPhase2, '.login-field__control input')
    expect(input).toBeTruthy()
    expect(input).toContain('var(--color-text-primary)')
    expect(input).not.toMatch(/#fff\b|rgba\(255,\s*255,\s*255/)

    const placeholder = ruleBody(designPhase2, '.login-field__control input::placeholder')
    expect(placeholder).toBeTruthy()
    expect(placeholder).not.toMatch(/#fff\b|rgba\(255,\s*255,\s*255/)
  })

  it('el control, el ojo y el botón de volver tampoco fijan blanco', () => {
    for (const selector of [
      '.login-field__control',
      '.login-field__toggle',
      '.login-form__back',
      '.login-page__footer',
      '.login-submit--oauth',
    ]) {
      const body = ruleBody(designPhase2, selector)
      expect(body, `falta la regla ${selector}`).toBeTruthy()
      expect(body, `${selector} volvió a fijar blanco`).not.toMatch(
        /#fff\b|rgba\(255,\s*255,\s*255/,
      )
    }
  })

  it('design-pages-theme ya no mantiene una capa light paralela de campos', () => {
    const parallelField = designPagesTheme.match(
      /\[data-theme='light'\]\s*(\.auth-immersive-glass\s+)?\.login-field/g,
    )
    expect(parallelField).toBeNull()
  })
})
