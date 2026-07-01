import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('browser env', () => {
  it('no expone secretos privados en config cliente', () => {
    const source = readFileSync(join(process.cwd(), 'src/config/env.js'), 'utf8')

    expect(source).not.toContain('VITE_MERCADO_PAGO_ACCESS_TOKEN')
    expect(source).not.toContain('VITE_BREVO_API_KEY')
    expect(source).not.toContain('accessToken')
    expect(source).not.toContain('apiKey')
  })
})
