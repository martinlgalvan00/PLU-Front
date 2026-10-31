import { computeMeetAwards } from '../../shared/meetAwards.js'

const HEADER_ALIASES = {
  athletname: 'name',
  athlete: 'name',
  athletename: 'name',
  lifter: 'name',
  name: 'name',
  nombre: 'name',
  sex: 'sex',
  sexo: 'sex',
  gender: 'sex',
  age: 'age',
  edad: 'age',
  division: 'division',
  divisionname: 'division',
  weightclass: 'category',
  weightclasskg: 'category',
  class: 'category',
  category: 'category',
  categoria: 'category',
  bodyweight: 'bodyweight',
  bodyweightkg: 'bodyweight',
  bw: 'bodyweight',
  peso: 'bodyweight',
  equipment: 'equipment',
  modalidad: 'equipment',
  team: 'team',
  gym: 'team',
  gimnasio: 'team',
  club: 'team',
  equipo: 'team',
  place: 'place',
  puesto: 'place',
  total: 'total',
  totalkg: 'total',
  squat1: 'squat1',
  squat1kg: 'squat1',
  squat2: 'squat2',
  squat2kg: 'squat2',
  squat3: 'squat3',
  squat3kg: 'squat3',
  bestsquat: 'bestSquat',
  bestsquatkg: 'bestSquat',
  bench1: 'bench1',
  bench1kg: 'bench1',
  bench2: 'bench2',
  bench2kg: 'bench2',
  bench3: 'bench3',
  bench3kg: 'bench3',
  bestbench: 'bestBench',
  bestbenchkg: 'bestBench',
  deadlift1: 'deadlift1',
  deadlift1kg: 'deadlift1',
  deadlift2: 'deadlift2',
  deadlift2kg: 'deadlift2',
  deadlift3: 'deadlift3',
  deadlift3kg: 'deadlift3',
  bestdeadlift: 'bestDeadlift',
  bestdeadliftkg: 'bestDeadlift',
}

function foldHeader(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function parseNumber(value) {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw || raw === '-' || raw.toLowerCase() === 'dq' || raw.toLowerCase() === 'ns') return null
  const normalized =
    raw.includes(',') && !raw.includes('.') ? raw.replace(',', '.') : raw.replace(/,/g, '')
  const number = Number(normalized)
  return Number.isFinite(number) ? number : null
}

function bestLift(attempts, explicit) {
  const positives = [explicit, ...attempts]
    .map((value) => (value != null && value > 0 ? value : null))
    .filter((value) => value != null)
  if (!positives.length) return null
  return Math.max(...positives)
}

function detectDelimiter(headerLine) {
  let commas = 0
  let semis = 0
  let inQuotes = false
  for (let index = 0; index < headerLine.length; index += 1) {
    const char = headerLine[index]
    if (char === '"') {
      if (inQuotes && headerLine[index + 1] === '"') index += 1
      else inQuotes = !inQuotes
    } else if (!inQuotes && char === ',') commas += 1
    else if (!inQuotes && char === ';') semis += 1
  }
  return semis > commas ? ';' : ','
}

function parseCsv(text) {
  const source = String(text ?? '').replace(/^\uFEFF/, '')
  const newline = source.indexOf('\n')
  const headerLine = newline === -1 ? source : source.slice(0, newline)
  const delimiter = detectDelimiter(headerLine)
  const rows = []
  let row = []
  let cell = ''
  let inQuotes = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (inQuotes) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"'
          index += 1
        } else inQuotes = false
      } else cell += char
    } else if (char === '"') inQuotes = true
    else if (char === delimiter) {
      row.push(cell.trim())
      cell = ''
    } else if (char === '\n') {
      row.push(cell.trim())
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') cell += char
  }
  if (cell.length || row.length) {
    row.push(cell.trim())
    rows.push(row)
  }
  return rows.filter((line) => line.some(Boolean))
}

function foldName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * @param {string} csv
 * @returns {{ rows: object[], errors: { row: number, message: string }[] }}
 */
export function parseLiftingCastCsv(csv) {
  const table = parseCsv(csv)
  if (table.length < 2) {
    return { rows: [], errors: [{ row: 1, message: 'El archivo no tiene filas de atletas.' }] }
  }
  const headers = table[0].map((header) => HEADER_ALIASES[foldHeader(header)] ?? null)
  if (!headers.includes('name')) {
    return { rows: [], errors: [{ row: 1, message: 'Falta la columna del nombre del atleta.' }] }
  }

  const rows = []
  const errors = []
  table.slice(1).forEach((cells, index) => {
    const rowNumber = index + 2
    const record = {}
    headers.forEach((key, column) => {
      if (key) record[key] = cells[column] ?? ''
    })
    const athleteName = String(record.name ?? '').trim()
    if (!athleteName) {
      errors.push({ row: rowNumber, message: 'Fila sin nombre.' })
      return
    }
    const squat = [parseNumber(record.squat1), parseNumber(record.squat2), parseNumber(record.squat3)]
    const bench = [parseNumber(record.bench1), parseNumber(record.bench2), parseNumber(record.bench3)]
    const deadlift = [
      parseNumber(record.deadlift1),
      parseNumber(record.deadlift2),
      parseNumber(record.deadlift3),
    ]
    const bestSquatKg = bestLift(squat, parseNumber(record.bestSquat))
    const bestBenchKg = bestLift(bench, parseNumber(record.bestBench))
    const bestDeadliftKg = bestLift(deadlift, parseNumber(record.bestDeadlift))
    let totalKg = parseNumber(record.total)
    if (totalKg == null && bestSquatKg != null && bestBenchKg != null && bestDeadliftKg != null) {
      totalKg = bestSquatKg + bestBenchKg + bestDeadliftKg
    }
    if (totalKg == null || totalKg <= 0) {
      errors.push({ row: rowNumber, message: `${athleteName}: sin total válido.` })
      return
    }
    rows.push({
      row: rowNumber,
      athleteName,
      sex: String(record.sex ?? '').trim() || null,
      age: parseNumber(record.age),
      division: String(record.division ?? '').trim() || null,
      category: String(record.category ?? '').trim() || null,
      bodyweightKg: parseNumber(record.bodyweight),
      equipment: String(record.equipment ?? '').trim() || null,
      teamName: String(record.team ?? '').trim() || null,
      place: parseNumber(record.place),
      squat1Kg: squat[0],
      squat2Kg: squat[1],
      squat3Kg: squat[2],
      bench1Kg: bench[0],
      bench2Kg: bench[1],
      bench3Kg: bench[2],
      deadlift1Kg: deadlift[0],
      deadlift2Kg: deadlift[1],
      deadlift3Kg: deadlift[2],
      bestSquatKg,
      bestBenchKg,
      bestDeadliftKg,
      totalKg,
    })
  })
  return { rows, errors }
}

/**
 * Si el CSV no trae equipo, usa el gimnasio del atleta cuando el nombre
 * coincide con una sola ficha. Varias coincidencias no se adivinan.
 */
export function attachAthleteMatch(rows, athletes = []) {
  const byName = new Map()
  for (const athlete of athletes) {
    const full = foldName(`${athlete.firstName ?? ''} ${athlete.lastName ?? ''}`)
    const reversed = foldName(`${athlete.lastName ?? ''} ${athlete.firstName ?? ''}`)
    for (const key of new Set([full, reversed])) {
      if (!key) continue
      const list = byName.get(key) ?? []
      list.push(athlete)
      byName.set(key, list)
    }
  }
  return rows.map((row) => {
    const matches = byName.get(foldName(row.athleteName)) ?? []
    const unique = matches.length === 1 ? matches[0] : null
    return {
      ...row,
      personId: unique?.personId ?? null,
      teamName: row.teamName || unique?.gym || null,
    }
  })
}

export function awardsForRows(rows) {
  return computeMeetAwards(rows)
}
