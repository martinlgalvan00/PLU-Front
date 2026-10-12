/**
 * Reglas de la postulación al Cuerpo de Staff, en un solo lugar para que el
 * envío (que muestra los errores) y el riel de progreso (que muestra cuánto
 * falta, en vivo) lean exactamente lo mismo.
 */

export const SHIRT_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * @param {object} input
 * @param {Record<string, string>} input.form
 * @param {boolean} input.photoDone
 * @param {boolean} input.certificateDone
 * @param {boolean} input.accuracyDeclared
 * @param {boolean} input.consentGiven
 * @returns {Record<string, string>} errores por campo; vacío si todo está completo
 */
export function validateStaffApplication({
  form,
  photoDone,
  certificateDone,
  accuracyDeclared,
  consentGiven,
}) {
  const next = {}
  if (form.firstName.trim().length < 2) next.firstName = 'Ingresá tu nombre.'
  if (form.lastName.trim().length < 2) next.lastName = 'Ingresá tu apellido.'
  if (form.documentId.trim().length < 6) next.documentId = 'Ingresá tu DNI.'
  if (!form.birthDate) next.birthDate = 'Ingresá tu fecha de nacimiento.'
  if (form.streetAddress.trim().length < 5) next.streetAddress = 'Ingresá tu dirección.'
  if (form.city.trim().length < 2) next.city = 'Ingresá tu ciudad o localidad.'
  if (form.province.trim().length < 2) next.province = 'Ingresá tu provincia.'
  if (form.postalCode.trim().length < 3) next.postalCode = 'Ingresá tu código postal.'
  if (!EMAIL_PATTERN.test(form.email)) next.email = 'Ingresá un email válido.'
  if (form.phone.trim().length < 6) next.phone = 'Ingresá tu teléfono.'
  if (!['operativo', 'tecnico'].includes(form.staffBody)) {
    next.staffBody = 'Elegí de qué cuerpo querés formar parte.'
  }
  if (
    form.staffBody === 'tecnico' &&
    !['aprobada', 'en_curso', 'no_realizada'].includes(form.technicalTrainingStatus)
  ) {
    next.technicalTrainingStatus = 'Indicá el estado de tu capacitación técnica.'
  }
  if (!SHIRT_SIZES.includes(form.shirtSize)) next.shirtSize = 'Elegí tu talle.'
  if (!form.backgroundCheckIssuedAt) {
    next.backgroundCheckIssuedAt = 'Ingresá la fecha de emisión del certificado.'
  }
  if (!photoDone) next.photo = 'Subí tu foto de perfil.'
  if (!certificateDone) next.certificate = 'Subí tu certificado de antecedentes.'
  if (!accuracyDeclared) next.accuracyDeclared = 'Tenés que declarar la veracidad de los datos.'
  if (!consentGiven) next.consentGiven = 'Tenés que dar tu consentimiento.'
  return next
}

/** Secciones del formulario y los campos que cuentan para cada una. */
export const STAFF_SECTIONS = [
  {
    id: 'staff-datos',
    title: 'Datos personales',
    fields: [
      'firstName',
      'lastName',
      'documentId',
      'birthDate',
      'streetAddress',
      'city',
      'province',
      'postalCode',
      'email',
      'phone',
    ],
  },
  {
    id: 'staff-cuerpo',
    title: 'Cuerpo de Staff',
    fields: ['staffBody', 'technicalTrainingStatus', 'shirtSize'],
  },
  {
    id: 'staff-documentacion',
    title: 'Documentación',
    fields: ['photo', 'certificate', 'backgroundCheckIssuedAt'],
  },
  {
    id: 'staff-declaraciones',
    title: 'Declaraciones',
    fields: ['accuracyDeclared', 'consentGiven'],
  },
]

/**
 * Avance por sección a partir de los errores actuales. La capacitación técnica
 * solo cuenta si el cuerpo elegido es Técnico.
 *
 * @param {Record<string, string>} errors
 * @param {{ staffBody?: string }} form
 * @returns {Array<{ id: string, title: string, done: number, total: number, complete: boolean }>}
 */
export function getStaffProgress(errors, form) {
  return STAFF_SECTIONS.map((section) => {
    const fields = section.fields.filter(
      (field) => field !== 'technicalTrainingStatus' || form.staffBody === 'tecnico',
    )
    const done = fields.filter((field) => !errors[field]).length
    return {
      id: section.id,
      title: section.title,
      done,
      total: fields.length,
      complete: done === fields.length,
    }
  })
}
