import { isDocumentPackComplete } from './athleteDocuments.js'
import { membershipFileStatus } from './membershipFile.js'

/**
 * Un solo próximo paso en la cuenta. El correo traba todo lo demás; sin la
 * ficha no se pide el DNI; el DNI se pide cuando la ficha ya está.
 * `null` significa que ese trámite no tiene un aviso propio.
 */
export function affiliationAccountStep({ athlete, membershipCurrent = false } = {}) {
  if (!athlete) return null
  if (athlete.emailVerifiedAt === null || athlete.email_verified_at === null) return 'email'
  if (!membershipCurrent && !membershipFileStatus(athlete).complete) return 'file'
  const pack = isDocumentPackComplete(athlete, athlete.documents)
  if (!pack.complete) return 'documents'
  return null
}
