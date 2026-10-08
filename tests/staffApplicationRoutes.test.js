import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const routes = readFileSync(resolve(process.cwd(), 'server/routes/athletes.js'), 'utf8')
const repository = readFileSync(
  resolve(process.cwd(), 'server/modules/athletes/supabaseAthleteRepository.js'),
  'utf8',
)
const permissions = readFileSync(resolve(process.cwd(), 'src/lib/permissions.js'), 'utf8')

describe('rutas de postulación al Cuerpo de Staff', () => {
  it('el alta y la subida de archivos cuelgan de /me, detrás de sesión de atleta', () => {
    expect(routes).toContain("'/me/staff-applications/upload-url'")
    expect(routes).toContain("'/me/staff-applications'")
    expect(routes).toMatch(/router\.post\(\s*'\/me\/staff-applications\/upload-url'/)
    expect(repository).toMatch(/async createStaffApplicationUpload\(athleteId, purpose, fileName\)/)
    expect(repository).toMatch(/submitStaffApplication: \(athleteId, data\) =>/)
  })

  it('la lectura y la revisión del panel usan permisos propios, no los de pagos', () => {
    expect(routes).toContain(
      "const staffApplicationsReadGuard = requirePermission('admin.staff_applications.read', { prisma })",
    )
    expect(routes).toContain(
      "const staffApplicationsApproveGuard = requirePermission('admin.staff_applications.approve'",
    )
    expect(routes).toContain("'/admin/staff-applications'")
    expect(routes).toContain("'/admin/staff-applications/:applicationId/review'")
    expect(routes).toContain("'/admin/staff-applications/:applicationId/photo'")
    expect(routes).toContain("'/admin/staff-applications/:applicationId/certificate'")
    expect(permissions).toContain("key: 'admin.staff_applications.read'")
    expect(permissions).toContain("key: 'admin.staff_applications.approve'")
  })

  it('los archivos de la postulación se sirven por proxy autenticado, nunca Storage directo', () => {
    expect(routes).toMatch(
      /staffApplicationDocumentPath\(applicationId\.data, 'photo'\)[\s\S]*?sendPortraitBinary/,
    )
    expect(routes).toMatch(
      /staffApplicationDocumentPath\(applicationId\.data, 'certificate'\)[\s\S]*?sendPortraitBinary/,
    )
    expect(routes).toContain("bucket: 'staff-application-documents',")
  })

  it('technicalTrainingStatus solo se exige cuando staffBody es tecnico', () => {
    expect(routes).toMatch(
      /value\.staffBody !== 'tecnico' \|\| Boolean\(value\.technicalTrainingStatus\)/,
    )
  })

  it('las declaraciones obligatorias son literales true, no un booleano cualquiera', () => {
    expect(routes).toMatch(/dataAccuracyDeclared: z\.literal\(true\)/)
    expect(routes).toMatch(/dataProcessingConsent: z\.literal\(true\)/)
  })
})
