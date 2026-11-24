import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import PersonalDataSection from '../src/pages/profile/PersonalDataSection.jsx'

/**
 * La división no se pide en el perfil: se deduce de la fecha de nacimiento y se
 * elige (junto con Open) al inscribirse a cada torneo.
 */

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  }
})

afterEach(() => cleanup())

const athlete = {
  id: 'ath-1',
  fullName: 'Ana Torres',
  documentId: '30111222',
  birthDate: '2005-06-01',
  country: 'Argentina',
  email: 'ana@plu.test',
  phone: '1155551234',
  city: 'Banfield',
  province: 'Buenos Aires',
  gym: 'Maximal',
  sex: 'Femenino',
  division: '',
  category: 'Raw',
  estimatedWeight: 60,
}

function renderSection(props = {}) {
  const onUpdateProfile = vi.fn(async () => ({}))
  render(
    <I18nProvider>
      <PersonalDataSection
        athlete={athlete}
        onUpdatePhoto={vi.fn()}
        onRemovePhoto={vi.fn()}
        onUpdateProfile={onUpdateProfile}
        {...props}
      />
    </I18nProvider>,
  )
  return { onUpdateProfile }
}

describe('PersonalDataSection — división', () => {
  it('no pide la división: es el mismo dato que la fecha de nacimiento', () => {
    renderSection()
    expect(document.querySelector('select[name="division"]')).toBeNull()
    expect(screen.queryByLabelText(/^División/i)).toBeNull()
  })

  it('la categoría de competencia sigue siendo un dato del perfil', () => {
    renderSection()
    expect(document.querySelector('select[name="category"]')).toBeTruthy()
    expect(screen.getByLabelText(/categoría de competencia/i)).toBeTruthy()
  })

  it('los documentos de afiliación se cargan en Afiliación, no en esta ficha', () => {
    renderSection()
    expect(screen.queryByRole('heading', { name: 'Documentos de afiliación' })).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Tu legajo' })).toBeNull()
  })

  it('quien ya está afiliado carga el DNI en el perfil', () => {
    render(
      <I18nProvider>
        <PersonalDataSection
          athlete={{ ...athlete, documents: [] }}
          onUpdateProfile={vi.fn()}
          onUpdatePhoto={vi.fn()}
          onRemovePhoto={vi.fn()}
          onUploadDocument={vi.fn()}
          showMemberDocuments
        />
      </I18nProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Tu legajo' })).toBeTruthy()
    expect(screen.getAllByLabelText('Subir').length).toBeGreaterThan(0)
  })

  it('explica que la división sale de la edad y que Open se elige al inscribirse', () => {
    renderSection()
    expect(screen.getByText(/tu división por edad es junior/i)).toBeTruthy()
  })

  it('un perfil sin división guardada queda completo y guarda la calculada por edad', async () => {
    const { onUpdateProfile } = renderSection()
    fireEvent.submit(document.querySelector('form'))
    await waitFor(() => expect(onUpdateProfile).toHaveBeenCalled())
    const [, payload] = onUpdateProfile.mock.calls[0]
    expect(payload.division).toBe('Junior')
    expect(payload.category).toBe('Raw')
  })
})
