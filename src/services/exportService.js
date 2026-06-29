export function createCsv(filename, rows) {
  if (!rows.length) return false

  const headers = Object.keys(rows[0])
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((key) => escape(row[key])).join(',')),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
  return true
}

export function buildAdminExportRows(registrations, athletes, memberships, payments) {
  return registrations.map((registration) => {
    const athlete = athletes.find((item) => item.id === registration.athleteId)
    const membership = memberships.find((item) => item.athleteId === registration.athleteId)
    const payment = payments.find((item) => item.athleteId === registration.athleteId)

    return {
      atleta: athlete?.fullName,
      documento: athlete?.documentId,
      email: athlete?.email,
      telefono: athlete?.phone,
      pais: athlete?.country,
      provincia: athlete?.province,
      ciudad: athlete?.city,
      gimnasio: athlete?.gym,
      sexo: athlete?.sex,
      division: registration.division,
      categoria: registration.category,
      peso: registration.bodyweight,
      codigo_afiliado: membership?.memberCode,
      estado_afiliacion: membership?.status,
      evento: registration.event,
      estado_inscripcion: registration.status,
      estado_pago: payment?.status,
      referencia_pago: payment?.reference,
    }
  })
}

export function buildPluUsaExportRows(athletes, memberships, registrations) {
  return athletes.map((athlete) => {
    const membership = memberships.find((item) => item.athleteId === athlete.id)
    const registration = registrations.find((item) => item.athleteId === athlete.id)
    const nameParts = athlete.fullName.trim().split(/\s+/)

    return {
      member_code: membership?.memberCode || '',
      first_name: nameParts.slice(0, -1).join(' '),
      last_name: nameParts.slice(-1).join(''),
      document_id: athlete.documentId,
      birth_date: athlete.birthDate,
      gender: athlete.sex,
      country: athlete.country,
      state: athlete.province,
      city: athlete.city,
      gym: athlete.gym,
      division: registration?.division || athlete.division,
      category: registration?.category || athlete.category,
      bodyweight: registration?.bodyweight || athlete.estimatedWeight,
      membership_year: membership?.year || '2026',
      membership_status: membership?.status || '',
      membership_start: membership?.startDate || '',
      membership_expiration: membership?.expirationDate || '',
      event_name: registration?.event || '',
      registration_status: registration?.status || '',
      payment_status: registration?.paymentStatus || '',
    }
  })
}
