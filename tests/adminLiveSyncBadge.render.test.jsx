import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

afterEach(cleanup)

const AdminLiveSyncBadge = (await import('../src/components/admin/AdminLiveSyncBadge.jsx')).default

function wrap(ui) {
  return <I18nProvider>{ui}</I18nProvider>
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('aviso de sincronización del panel', () => {
  it('no renderiza nada sin actividad', () => {
    const { container } = render(wrap(<AdminLiveSyncBadge />))
    expect(container.querySelector('.admin-live-sync')).toBeNull()
  })

  it('muestra el punto pulsante mientras sincroniza', () => {
    render(wrap(<AdminLiveSyncBadge refreshing />))

    expect(screen.getByRole('status').textContent).toMatch(/sincronizando/i)
    expect(screen.getByRole('status').querySelector('.admin-live-sync__dot')).toBeTruthy()
  })

  it('confirma con check al terminar y se desvanece solo', async () => {
    render(wrap(<AdminLiveSyncBadge syncedAt={Date.now()} />))

    const badge = screen.getByRole('status')
    expect(badge.textContent).toMatch(/actualizado/i)
    expect(badge.querySelector('.admin-live-sync__check')).toBeTruthy()
    expect(badge.className).toContain('admin-live-sync--settled')

    vi.advanceTimersByTime(2700)
    await act(async () => {})
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('la sincronización activa tiene prioridad sobre el settle previo', () => {
    render(wrap(<AdminLiveSyncBadge refreshing syncedAt={Date.now()} />))

    const badge = screen.getByRole('status')
    expect(badge.textContent).toMatch(/sincronizando/i)
    expect(badge.className).not.toContain('admin-live-sync--settled')
  })
})
