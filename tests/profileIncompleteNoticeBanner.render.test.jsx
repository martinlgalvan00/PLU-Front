import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import ProfileIncompleteNoticeBanner from '../src/components/ui/ProfileIncompleteNoticeBanner.jsx'

describe('ProfileIncompleteNoticeBanner', () => {
  afterEach(cleanup)
  it('muestra campos faltantes, nota del staff y marca el aviso como leído', () => {
    const onRead = vi.fn()
    const onDismiss = vi.fn()
    const onComplete = vi.fn()

    render(
      <I18nProvider>
        <ProfileIncompleteNoticeBanner
          athlete={{
            id: 'ath-1',
            profileNotices: [
              {
                id: 'notice-1',
                missingFields: ['phone', 'gym'],
                message: 'Completá el teléfono y el gimnasio.',
                readAt: null,
                dismissedAt: null,
                resolvedAt: null,
              },
            ],
          }}
          onRead={onRead}
          onDismiss={onDismiss}
          onComplete={onComplete}
        />
      </I18nProvider>,
    )

    expect(screen.getByText('Datos pendientes')).toBeTruthy()
    expect(screen.getByText(/Para inscribirte a un evento oficial faltan: Teléfono, Gimnasio o equipo/)).toBeTruthy()
    expect(screen.getByText('Completá el teléfono y el gimnasio.')).toBeTruthy()
    expect(onRead).toHaveBeenCalledWith('notice-1')

    fireEvent.click(screen.getByRole('button', { name: 'Completar datos' }))
    expect(onComplete).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))
    expect(onDismiss).toHaveBeenCalledWith('notice-1')
  })

  it('no renderiza si el aviso ya se descartó', () => {
    render(
      <I18nProvider>
        <ProfileIncompleteNoticeBanner
          athlete={{
            profileNotices: [
              {
                id: 'notice-1',
                missingFields: ['phone'],
                dismissedAt: '2026-09-08T12:00:00.000Z',
                resolvedAt: null,
              },
            ],
          }}
        />
      </I18nProvider>,
    )

    expect(screen.queryByText('Datos pendientes')).toBeNull()
  })
})
