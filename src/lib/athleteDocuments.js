/**
 * Reexporta la regla de documentos desde shared/ para no romper imports de UI.
 */
export {
  ATHLETE_DOCUMENT_KINDS,
  REQUIRED_ATHLETE_DOCUMENT_KINDS,
  OPTIONAL_ATHLETE_DOCUMENT_KINDS,
  ATHLETE_DOCUMENT_KIND_LABELS,
  ATHLETE_DOCUMENT_BUCKET,
  ATHLETE_DOCUMENT_UPLOAD_MAX_BYTES,
  ATHLETE_DOCUMENT_PDF_MAX_BYTES,
  ATHLETE_DOCUMENT_INTAKE_MAX_BYTES,
  ATHLETE_DOCUMENT_MIME_TYPES,
  athleteAgeYears,
  isAthleteMinor,
  requiredDocumentKinds,
  isDocumentPackComplete,
  needsDocumentGateForRegistration,
  needsDocumentGate,
  documentPackGate,
  documentsBlockCheckout,
  documentPackFocus,
  ATHLETE_DOCUMENT_PDF_TOO_LARGE_MESSAGE,
  ATHLETE_DOCUMENT_HEIC_UNSUPPORTED_MESSAGE,
  ATHLETE_DOCUMENT_INTAKE_TOO_LARGE_MESSAGE,
  ATHLETE_DOCUMENT_STILL_TOO_LARGE_MESSAGE,
  ATHLETE_DOCUMENT_UNREADABLE_MESSAGE,
  isSafeAthleteDocumentPath,
} from '../../shared/athleteDocuments.js'
