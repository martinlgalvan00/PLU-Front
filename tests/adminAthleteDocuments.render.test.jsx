import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import AdminAthleteDocuments, {
  AdminAthleteDocumentsDialog,
} from '../src/components/admin/AdminAthleteDocuments.jsx'

const adult = {
  id: 'athlete-1',
  fullName: 'Melisa Quispe',
  birthDate: '1998-04-12',
  documentsGrandfathered: false,
  documents: [
    {
      kind: 'dni_front',
      contentType: 'image/jpeg',
      originalName: 'frente.jpg',
      uploadedAt: '2026-08-20T18:04:00.000Z',
    },
    {
      kind: 'dni_back',
      contentType: 'application/pdf',
      originalName: 'dorso.pdf',
      uploadedAt: '2026-08-20T18:05:00.000Z',
    },
  ],
}

function renderDocuments(athlete) {
  return render(
    <I18nProvider>
      <AdminAthleteDocuments athlete={athlete} />
    </I18nProvider>,
  )
}

afterEach(() => {
  cleanup()
})

describe('legajo en la ficha admin', () => {
  it('muestra la foto del DNI y el PDF que se subió en el perfil', () => {
    renderDocuments(adult)

    expect(screen.getByRole('heading', { name: 'Documentos de afiliación' })).toBeTruthy()
    expect(screen.getByText('Legajo completo')).toBeTruthy()
    const photo = screen.getByRole('link', { name: 'Ver DNI frente' })
    expect(photo.getAttribute('href')).toContain('/api/athletes/admin/athlete-1/documents/dni_front')
    expect(photo.querySelector('img')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Abrir PDF' }).getAttribute('href')).toContain(
      'dni_back',
    )
    expect(screen.getByText(/frente\.jpg/)).toBeTruthy()
    expect(screen.getByText('Opcional')).toBeTruthy()
    expect(screen.queryByText('Autorización del tutor')).toBeNull()
  })

  it('si la foto no carga, deja el enlace para abrir el archivo', () => {
    renderDocuments(adult)
    fireEvent.error(screen.getByRole('link', { name: 'Ver DNI frente' }).querySelector('img'))
    expect(screen.getAllByRole('link', { name: 'Ver' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('link', { name: 'Ver DNI frente' })).toBeNull()
  })

  it('pide la autorización cuando la persona es menor', () => {
    renderDocuments({
      ...adult,
      birthDate: '2012-06-01',
      documents: [],
    })

    expect(screen.getByText('Faltan archivos')).toBeTruthy()
    expect(screen.getByText('Autorización del tutor')).toBeTruthy()
    expect(screen.getAllByText('Sin archivo').length).toBeGreaterThan(0)
  })

  it('no inventa faltantes si el padrón no trajo el legajo', () => {
    renderDocuments({ ...adult, documents: undefined })
    expect(screen.getByText(/no incluyó los archivos/i)).toBeTruthy()
    expect(screen.queryByText('Sin archivo')).toBeNull()
    expect(screen.queryByText('Opcional')).toBeNull()
  })

  it('abre el legajo en un diálogo con el nombre de la persona', () => {
    render(
      <I18nProvider>
        <AdminAthleteDocumentsDialog athlete={adult} onClose={() => {}} />
      </I18nProvider>,
    )

    expect(screen.getByRole('dialog', { name: 'Documentos de Melisa Quispe' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Ver DNI frente' })).toBeTruthy()
  })
})
