import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { consumeSignedOutFlag, markSignedOut } from '../src/lib/sessionNotice.js'

const STORAGE_KEY = 'plu-signed-out'

beforeEach(() => {
  window.sessionStorage.removeItem(STORAGE_KEY)
})

afterEach(cleanup)

const SessionNotice = (await import('../src/components/ui/SessionNotice.jsx')).default

describe('aviso de cierre de sesión', () => {
  it('guarda y consume el flag entre layouts', () => {
    expect(consumeSignedOutFlag()).toBe(false)
    markSignedOut()
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe('1')
    expect(consumeSignedOutFlag()).toBe(true)
    expect(consumeSignedOutFlag()).toBe(false)
  })

  it('muestra el aviso cuando acaba de cerrarse la sesión', () => {
    markSignedOut()
    render(
      <I18nProvider>
        <SessionNotice />
      </I18nProvider>,
    )

    expect(screen.getByRole('status').textContent).toMatch(/cerraste sesión/i)
  })

  it('aparece al disparar el evento en la misma pantalla', async () => {
    render(
      <I18nProvider>
        <SessionNotice />
      </I18nProvider>,
    )

    expect(screen.queryByRole('status')).toBeNull()
    markSignedOut()
    expect((await waitFor(() => screen.getByRole('status'))).textContent).toMatch(/cerraste sesión/i)
  })
})
