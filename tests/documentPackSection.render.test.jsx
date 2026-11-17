import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../src/i18n/I18nProvider.jsx'
import DocumentsPendingBanner from '../src/components/ui/DocumentsPendingBanner.jsx'
import DocumentPackSection from '../src/pages/profile/DocumentPackSection.jsx'

vi.mock('../src/services/athleteDocumentService.js', () => ({
  athleteDocumentUrl: (kind) => `/docs/${kind}`,
  validateAthleteDocumentFile: () => ({ error: '' }),
}))

const adult = {
  id: 'athlete-1',
  birthDate: '1998-04-12',
  documentsGrandfathered: false,
  documents: [],
}

function renderPack(athlete, { membershipCurrent = false } = {}) {
  return render(
    <I18nProvider>
      <DocumentPackSection athlete={athlete} onUploadDocument={vi.fn()} />
      <DocumentsPendingBanner athlete={athlete} membershipCurrent={membershipCurrent} />
    </I18nProvider>,
  )
}

afterEach(() => {
  cleanup()
})

describe('legajo en el perfil', () => {
  it('pide el DNI y deja el certificado médico como opcional', () => {
    renderPack(adult)

    expect(screen.getByText('2 archivos pendientes')).toBeTruthy()
    expect(screen.getByText('DNI — frente')).toBeTruthy()
    expect(screen.getByText('DNI — dorso')).toBeTruthy()
    expect(screen.getByText('Opcional')).toBeTruthy()
    expect(screen.getByText('Certificado médico')).toBeTruthy()
    expect(screen.getByText('Falta el DNI para afiliarte')).toBeTruthy()
    expect(screen.queryByText('Autorización del tutor')).toBeNull()
  })

  it('marca el legajo completo con el DNI, aunque no haya certificado', () => {
    renderPack({
      ...adult,
      documents: [{ kind: 'dni_front' }, { kind: 'dni_back' }],
    })

    expect(screen.getByText('Legajo completo')).toBeTruthy()
    expect(screen.getAllByText('Certificado médico')).toHaveLength(1)
    expect(screen.queryByText('Falta el DNI para afiliarte')).toBeNull()
  })

  it('sin afiliación vigente, el aviso pide el DNI para renovar', () => {
    renderPack({ ...adult, documentsGrandfathered: true })

    expect(screen.getByText('Falta el DNI en tu legajo')).toBeTruthy()
    expect(screen.getByText(/para renovar/)).toBeTruthy()
    expect(screen.queryByText('Falta el DNI para afiliarte')).toBeNull()
  })

  it('quien ya tiene el legajo completo ve los documentos y la foto solo al abrirla', () => {
    render(
      <I18nProvider>
        <DocumentPackSection
          athlete={{
            ...adult,
            documents: [
              { kind: 'dni_front', uploadedAt: '2026-11-16T18:00:00.000Z' },
              { kind: 'dni_back', uploadedAt: '2026-11-16T18:00:00.000Z' },
            ],
          }}
          onUploadDocument={vi.fn()}
          variant="member"
        />
      </I18nProvider>,
    )

    expect(screen.getByRole('heading', { name: 'Tu legajo' })).toBeTruthy()
    expect(screen.getByText('DNI — frente')).toBeTruthy()
    expect(screen.getByText('DNI — dorso')).toBeTruthy()
    expect(screen.getByText('Certificado médico')).toBeTruthy()
    expect(document.querySelector('img')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Ver DNI — frente' }))

    const preview = document.querySelector('.account-documents-dialog img')
    expect(preview?.getAttribute('src')).toContain('/docs/dni_front')
    expect(screen.getAllByText('Reemplazar').length).toBeGreaterThan(0)

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cerrar' }))
    expect(document.querySelector('.account-documents-dialog')).toBeNull()
  })

  it('una persona afiliada confirma la vista previa antes de subir', async () => {
    const onUploadDocument = vi.fn().mockResolvedValue({})
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:frente')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    render(
      <I18nProvider>
        <DocumentPackSection
          athlete={{
            ...adult,
            documents: [
              { kind: 'dni_front', uploadedAt: '2026-11-16T18:00:00.000Z' },
              { kind: 'dni_back', uploadedAt: '2026-11-16T18:00:00.000Z' },
            ],
          }}
          onUploadDocument={onUploadDocument}
          variant="member"
        />
      </I18nProvider>,
    )

    const input = document.querySelector('#account-document-member-dni_front')
    const file = new File([new Uint8Array(40)], 'frente.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(
      screen.getByRole('dialog', { name: '¿Estás seguro de que querés subir este documento?' }),
    ).toBeTruthy()
    expect(screen.getByRole('img', { name: 'DNI — frente' }).getAttribute('src')).toBe('blob:frente')
    expect(screen.getByText(/frente\.jpg/)).toBeTruthy()
    expect(screen.getByText('Reemplaza el archivo que ya está cargado.')).toBeTruthy()
    expect(onUploadDocument).not.toHaveBeenCalled()

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))
    expect(onUploadDocument).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.change(input, { target: { files: [file] } })
    fireEvent.click(screen.getByRole('button', { name: 'Sí, subir' }))

    expect(onUploadDocument).toHaveBeenCalledWith('athlete-1', 'dni_front', file)
    expect(await screen.findByText('Legajo completo')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('si la carga se corta, muestra el error y vuelve a habilitar ese archivo', async () => {
    const onUploadDocument = vi.fn().mockRejectedValue(new Error('se cortó la red'))
    render(
      <I18nProvider>
        <DocumentPackSection athlete={adult} onUploadDocument={onUploadDocument} />
      </I18nProvider>,
    )
    const input = document.querySelector('input[type="file"]')
    const file = new File([new Uint8Array(40)], 'frente.jpg', { type: 'image/jpeg' })
    fireEvent.change(input, { target: { files: [file] } })

    expect(await screen.findByText('se cortó la red')).toBeTruthy()
    expect(screen.queryByText('Subiendo…')).toBeNull()
    expect(input.disabled).toBe(false)
  })

  it('con afiliación vigente, el aviso deja seguir y marca el DNI para la renovación', () => {
    renderPack({ ...adult, documentsGrandfathered: true }, { membershipCurrent: true })

    expect(screen.getByText('Falta el DNI en tu legajo')).toBeTruthy()
    expect(screen.getByText(/Tu afiliación sigue vigente/)).toBeTruthy()
    expect(screen.getByText(/exija afiliación/)).toBeTruthy()
  })
})
