import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import DocumentsPendingBanner from '../src/components/ui/DocumentsPendingBanner.jsx'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'

const athlete = {
  id: 'ath-1',
  birthDate: '1994-04-12',
  documents: [],
}

function renderBanner(props = {}) {
  return render(
    <I18nProvider>
      <DocumentsPendingBanner athlete={athlete} onComplete={() => {}} {...props} />
    </I18nProvider>,
  )
}

afterEach(() => {
  cleanup()
})

describe('aviso de legajo', () => {
  it('sin afiliación vigente dice que falta el DNI para afiliarse', () => {
    renderBanner()
    expect(screen.getByText('Falta el DNI para afiliarte')).toBeTruthy()
    expect(screen.queryByText(/sigue vigente/i)).toBeNull()
  })

  it('con afiliación vigente invita a completar el legajo sin cortarla', () => {
    renderBanner({ membershipCurrent: true })
    expect(screen.getByText('Falta el DNI en tu legajo')).toBeTruthy()
    expect(screen.getByText(/sigue vigente/i)).toBeTruthy()
    expect(screen.queryByText('Falta el DNI para afiliarte')).toBeNull()
  })

  it('no aparece si el legajo obligatorio ya está', () => {
    renderBanner({
      athlete: {
        ...athlete,
        documents: [{ kind: 'dni_front' }, { kind: 'dni_back' }],
      },
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('si el DNI ya está y es menor, pide la autorización y no el DNI', () => {
    renderBanner({
      athlete: {
        ...athlete,
        birthDate: '2012-06-01',
        documents: [{ kind: 'dni_front' }, { kind: 'dni_back' }],
      },
    })
    expect(screen.getByText('Falta la autorización del tutor')).toBeTruthy()
    expect(screen.queryByText('Falta el DNI para afiliarte')).toBeNull()
  })

  it('la ficha avisa completar los datos y no pide el DNI', () => {
    renderBanner({ step: 'file' })
    expect(screen.getByText('Falta la ficha para afiliarte')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Completar ficha' })).toBeTruthy()
    expect(screen.queryByText('Falta el DNI para afiliarte')).toBeNull()
  })
})
