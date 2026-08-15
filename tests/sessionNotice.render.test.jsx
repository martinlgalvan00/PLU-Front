import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import { consumeSignedOutFlag, markSignedOut } from '../src/lib/sessionNotice.js'

const STORAGE_KEY = 'plu-signed-out'

beforeEach(() => {
  window.sessionStorage.removeItem(STORAGE_KEY)
})

afterEach(cleanup)

const SessionNotice = (await import('../src/components/ui/SessionNotice.jsx')).default

function wrap(ui) {
  return <I18nProvider>{ui}</I18nProvider>
}

describe('aviso de cierre de sesión', () => {
  it('guarda y consume el flag entre layouts', () => {
    expect(consumeSignedOutFlag()).toBe(false)
    markSignedOut('Martina')
    // El flag viaja como JSON con el nombre: el toast saluda a quien salió.
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY))).toEqual({ name: 'Martina' })
    expect(consumeSignedOutFlag()).toEqual({ name: 'Martina' })
    expect(consumeSignedOutFlag()).toBe(false)
  })

  it('muestra el aviso cuando acaba de cerrarse la sesión', () => {
    markSignedOut()
    render(wrap(<SessionNotice />))

    expect(screen.getByRole('status').textContent).toMatch(/sesión cerrada/i)
    expect(screen.getByRole('status').textContent).toMatch(/hasta pronto/i)
  })

  it('saluda por nombre a quien cerró sesión', async () => {
    markSignedOut('Martina')
    render(wrap(<SessionNotice />))

    expect((await waitFor(() => screen.getByRole('status'))).textContent).toMatch(
      /hasta pronto, martina/i,
    )
  })

  it('aparece al disparar el evento en la misma pantalla', async () => {
    render(wrap(<SessionNotice />))

    expect(screen.queryByRole('status')).toBeNull()
    markSignedOut('Nicolás')
    expect((await waitFor(() => screen.getByRole('status'))).textContent).toMatch(
      /hasta pronto, nicolás/i,
    )
  })

  it('ofrece reingreso directo cuando hay navegación', () => {
    markSignedOut()
    render(wrap(<SessionNotice onNavigate={() => {}} />))

    expect(screen.getByRole('button', { name: /volver a ingresar/i })).toBeTruthy()
  })

  it('muestra el contador inicial oculto a lectores de pantalla', () => {
    markSignedOut()
    render(wrap(<SessionNotice />))

    const countdown = document.querySelector('.session-notice__countdown')
    expect(countdown).toBeTruthy()
    expect(countdown.getAttribute('aria-hidden')).toBe('true')
    expect(countdown.textContent).toBe('8')
  })

  it('se cierra desde el control de esquina', async () => {
    markSignedOut()
    render(wrap(<SessionNotice onNavigate={() => {}} />))

    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }))

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull())
  })

  it('sigue visible si el layout se remonta después del logout', async () => {
    const first = render(wrap(<SessionNotice />))

    markSignedOut()
    expect((await waitFor(() => screen.getByRole('status'))).textContent).toMatch(/hasta pronto/i)

    first.unmount()
    render(wrap(<SessionNotice />))

    expect(screen.getByRole('status').textContent).toMatch(/hasta pronto/i)
  })
})
