/**
 * Builders y serialización de exportaciones admin / PLU USA.
 * Compartido entre browser y API para no desincronizar columnas ni fechas.
 */

import {
  referenceDateForExport,
  resolveDivisionExportFields,
  toCalendarDate,
  todayCalendarDate,
} from './ageDivision.js'

export const EXPORT_ROW_LIMIT = 5000

/** Fecha de calendario YYYY-MM-DD (ISO, DD/MM/YYYY, etc.) sin Date/TZ. */
export function normalizeExportDate(value) {
  return toCalendarDate(value)
}

export { referenceDateForExport }

export function buildAdminExportRows(registrations, athletes, memberships, payments) {
  const athletesById = new Map((athletes ?? []).map((item) => [item.id, item]))
  const membershipsByAthlete = new Map((memberships ?? []).map((item) => [item.athleteId, item]))
  const paymentsByAthlete = new Map((payments ?? []).map((item) => [item.athleteId, item]))
  const exportDay = todayCalendarDate()

  return (registrations ?? []).map((registration) => {
    const athlete = athletesById.get(registration.athleteId)
    const membership = membershipsByAthlete.get(registration.athleteId)
    const payment = paymentsByAthlete.get(registration.athleteId)
    const referenceDate = referenceDateForExport(registration, exportDay)
    const declaredDivision = registration.division ?? athlete?.division ?? ''
    const divisionFields = resolveDivisionExportFields(
      athlete?.birthDate,
      referenceDate,
      declaredDivision,
    )

    return {
      atleta: athlete?.fullName ?? '',
      documento: athlete?.documentId ?? '',
      email: athlete?.email ?? '',
      telefono: athlete?.phone ?? '',
      pais: athlete?.country ?? '',
      provincia: athlete?.province ?? '',
      ciudad: athlete?.city ?? '',
      gimnasio: athlete?.gym ?? '',
      sexo: athlete?.sex ?? '',
      fecha_nacimiento: normalizeExportDate(athlete?.birthDate),
      division: divisionFields.division,
      division_inscrita: divisionFields.divisionDeclared,
      division_desajuste: divisionFields.divisionMismatch ? '1' : '',
      division_open_upgrade: divisionFields.divisionOpenUpgrade ? '1' : '',
      categoria: registration.category ?? '',
      peso: registration.bodyweight ?? '',
      codigo_afiliado: membership?.memberCode ?? '',
      estado_afiliacion: membership?.status ?? '',
      evento: registration.event ?? '',
      estado_inscripcion: registration.status ?? '',
      estado_pago: payment?.status ?? '',
      referencia_pago: payment?.reference ?? '',
    }
  })
}

export function buildPluUsaExportRows(athletes, memberships, registrations) {
  const membershipsByAthlete = new Map((memberships ?? []).map((item) => [item.athleteId, item]))
  const registrationsByAthlete = new Map((registrations ?? []).map((item) => [item.athleteId, item]))
  const exportDay = todayCalendarDate()

  return (athletes ?? []).map((athlete) => {
    const membership = membershipsByAthlete.get(athlete.id)
    const registration = registrationsByAthlete.get(athlete.id)
    const nameParts = String(athlete.fullName ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
    const referenceDate = referenceDateForExport(registration, exportDay)
    const declaredDivision = registration?.division || athlete.division || ''
    const divisionFields = resolveDivisionExportFields(
      athlete.birthDate,
      referenceDate,
      declaredDivision,
    )

    return {
      member_code: membership?.memberCode || '',
      first_name: nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : nameParts[0] || '',
      last_name: nameParts.length > 1 ? nameParts.at(-1) : '',
      document_id: athlete.documentId ?? '',
      birth_date: normalizeExportDate(athlete.birthDate),
      gender: athlete.sex ?? '',
      country: athlete.country ?? '',
      state: athlete.province ?? '',
      city: athlete.city ?? '',
      gym: athlete.gym ?? '',
      division: divisionFields.division,
      division_entered: divisionFields.divisionDeclared,
      division_mismatch: divisionFields.divisionMismatch ? '1' : '',
      division_open_upgrade: divisionFields.divisionOpenUpgrade ? '1' : '',
      category: registration?.category || athlete.category || '',
      bodyweight: registration?.bodyweight || athlete.estimatedWeight || '',
      membership_year: membership?.year || '2026',
      membership_status: membership?.status || '',
      membership_start: normalizeExportDate(membership?.startDate),
      membership_expiration: normalizeExportDate(membership?.expirationDate),
      event_name: registration?.event || '',
      registration_status: registration?.status || '',
      payment_status: registration?.paymentStatus || '',
    }
  })
}

export function serializeCsv(rows, { bom = true } = {}) {
  if (!rows?.length) return null

  const headers = Object.keys(rows[0])
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((key) => escape(row[key])).join(',')),
  ].join('\n')

  return bom ? `\uFEFF${csv}` : csv
}

function escapeXml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function sanitizeSheetName(name) {
  const cleaned = String(name ?? 'Hoja1')
    .replaceAll(/[[\]:*?/\\]/g, ' ')
    .trim()
  return (cleaned || 'Hoja1').slice(0, 31)
}

/**
 * SpreadsheetML 2003 (.xls) sin dependencias.
 * - `incompleteRowIndexes`: filas de datos (0-based) en amarillo.
 * - `mismatchRowIndexes`: filas con división inscrita ≠ calculada (azul).
 * - `emptyCells`: [{ row, column }] celdas vacías requeridas (coral).
 * - `columnWidths`: anchos en px por orden de columna.
 * - `theme: 'lifters'`: tipografía y bordes más de planilla.
 */
export function serializeSpreadsheet(
  rows,
  sheetName = 'Hoja1',
  {
    incompleteRowIndexes = null,
    mismatchRowIndexes = null,
    emptyCells = null,
    columnWidths = null,
    freezeHeader = true,
    theme = 'default',
  } = {},
) {
  if (!rows?.length) return null

  const incomplete = new Set(
    incompleteRowIndexes instanceof Set
      ? incompleteRowIndexes
      : Array.isArray(incompleteRowIndexes)
        ? incompleteRowIndexes
        : [],
  )
  const mismatch = new Set(
    mismatchRowIndexes instanceof Set
      ? mismatchRowIndexes
      : Array.isArray(mismatchRowIndexes)
        ? mismatchRowIndexes
        : [],
  )
  const emptySet = new Set(
    (emptyCells ?? []).map((cell) => `${cell.row}::${cell.column}`),
  )
  const headers = Object.keys(rows[0])
  const isLifters = theme === 'lifters'
  const headerHeight = isLifters ? ' ss:Height="28"' : ''
  const rowHeight = isLifters ? ' ss:Height="20"' : ''

  const colDefs =
    Array.isArray(columnWidths) && columnWidths.length
      ? columnWidths
          .map((width, index) => {
            const w = Number(width) || 100
            return `<Column ss:Index="${index + 1}" ss:AutoFitWidth="0" ss:Width="${w}"/>`
          })
          .join('')
      : ''

  const headerRow = `<Row ss:StyleID="Header"${headerHeight}>${headers
    .map((key) => `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(key)}</Data></Cell>`)
    .join('')}</Row>`

  const body = rows
    .map((row, index) => {
      // Incompleto (faltantes) gana sobre desajuste de división.
      const rowStyle = incomplete.has(index)
        ? 'Incomplete'
        : mismatch.has(index)
          ? 'Mismatch'
          : index % 2 === 1
            ? 'Alt'
            : 'Data'
      return `<Row ss:StyleID="${rowStyle}"${rowHeight}>${headers
        .map((key) => {
          const isEmpty = emptySet.has(`${index}::${key}`)
          const cellStyle = isEmpty ? 'EmptyCell' : rowStyle
          return `<Cell ss:StyleID="${cellStyle}"><Data ss:Type="String">${escapeXml(row[key])}</Data></Cell>`
        })
        .join('')}</Row>`
    })
    .join('')

  const freeze = freezeHeader
    ? `<WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
  <FreezePanes/>
  <FrozenNoSplit/>
  <SplitHorizontal>1</SplitHorizontal>
  <TopRowBottomPane>1</TopRowBottomPane>
  <ActivePane>2</ActivePane>
 </WorksheetOptions>`
    : ''

  const headerFill = isLifters ? '#0F172A' : '#1C1917'
  const headerFont = isLifters ? 'Calibri' : 'Calibri'
  const dataFont = isLifters ? 'Calibri' : 'Calibri'

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Header">
   <Font ss:FontName="${headerFont}" ss:Bold="1" ss:Color="#FFFFFF" ss:Size="11"/>
   <Interior ss:Color="${headerFill}" ss:Pattern="Solid"/>
   <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="1"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
   </Borders>
  </Style>
  <Style ss:ID="Data">
   <Font ss:FontName="${dataFont}" ss:Size="10" ss:Color="#1E293B"/>
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="Alt">
   <Font ss:FontName="${dataFont}" ss:Size="10" ss:Color="#1E293B"/>
   <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
   </Borders>
  </Style>
  <Style ss:ID="Incomplete">
   <Font ss:FontName="${dataFont}" ss:Size="10" ss:Color="#78350F"/>
   <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#F59E0B"/>
   </Borders>
  </Style>
  <Style ss:ID="Mismatch">
   <Font ss:FontName="${dataFont}" ss:Size="10" ss:Color="#1E3A8A"/>
   <Interior ss:Color="#DBEAFE" ss:Pattern="Solid"/>
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#60A5FA"/>
   </Borders>
  </Style>
  <Style ss:ID="EmptyCell">
   <Font ss:FontName="${dataFont}" ss:Size="10" ss:Color="#9A3412"/>
   <Interior ss:Color="#FFEDD5" ss:Pattern="Solid"/>
   <Alignment ss:Vertical="Center"/>
   <Borders>
    <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FB923C"/>
    <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FB923C"/>
    <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FB923C"/>
    <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FB923C"/>
   </Borders>
  </Style>
 </Styles>
 <Worksheet ss:Name="${escapeXml(sanitizeSheetName(sheetName))}">
  <Table>
   ${colDefs}
   ${headerRow}
   ${body}
  </Table>
  ${freeze}
 </Worksheet>
</Workbook>`
}
