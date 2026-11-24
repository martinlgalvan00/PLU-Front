import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const routes = readFileSync(resolve(process.cwd(), 'server/routes/athletes.js'), 'utf8')
const repository = readFileSync(
  resolve(process.cwd(), 'server/modules/athletes/supabaseAthleteRepository.js'),
  'utf8',
)

describe('rutas de documentos de afiliación', () => {
  it('la subida cuelga de /me, detrás de sesión de atleta', () => {
    expect(routes).toContain("'/me/documents/upload-url'")
    expect(routes).toContain("'/me/documents'")
    expect(repository).toMatch(/async createDocumentUpload\(athleteId/)
    expect(repository).toMatch(/async registerDocument\(athleteId/)
  })

  it('el panel lee los archivos por proxy autenticado, nunca Storage directo', () => {
    expect(routes).toContain("'/admin/:athleteId/documents'")
    expect(routes).toContain("'/admin/:athleteId/documents/:kind'")
    expect(routes).toContain("bucket: 'athlete-documents'")
  })

  it('el checkout de afiliación y combo siempre exige el pack; la inscripción respeta grandfathering', () => {
    expect(routes).toContain("await assertAthleteDocumentsComplete(auth.athleteId, 'membership')")
    expect(routes).toContain("await assertAthleteDocumentsComplete(auth.athleteId, 'combo')")
    expect(routes).toContain("await assertAthleteDocumentsComplete(auth.athleteId, 'registration',")
    expect(routes).toContain('requiresMembership: event.requires_membership === true')
    expect(routes).toContain("code: 'ATHLETE_DOCUMENTS_INCOMPLETE'")
    expect(routes).toContain('ATHLETE_DOCUMENT_PDF_TOO_LARGE_MESSAGE')
  })

  it('el proxy de lectura usa el bucket privado athlete-documents', () => {
    expect(routes).toContain("'/me/documents/:kind'")
    expect(routes).toContain("'/admin/:athleteId/documents/:kind'")
    expect(repository).toMatch(/async athleteDocumentPath\(athleteId/)
    expect(repository).toContain('listDocumentPackSafe(athleteId, payload.athlete)')
    expect(repository).toContain('forgetPortraitCache(previousPath)')
  })
})
