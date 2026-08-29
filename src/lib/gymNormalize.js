/**
 * Normalización y matching de nombres de gimnasio.
 * Fuente única para API, UI de autocomplete y scripts de migración.
 */

export const GYM_STOP_WORDS = Object.freeze([
  'gym',
  'club',
  'barbell',
  'crossfit',
  'box',
  'team',
  'powerlifting',
  'fitness',
  'centro',
  'entrenamiento',
  'strength',
  'de',
  'el',
  'la',
  'los',
  'las',
])

export function normalizeGym(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function getCoreName(normOrName) {
  const norm = normalizeGym(normOrName)
  const words = norm.split(/\s+/).filter(Boolean)
  const filtered = words.filter((w) => !GYM_STOP_WORDS.includes(w))
  return filtered.length > 0 ? filtered.join(' ') : norm
}

export function stripGymAlnum(name) {
  return normalizeGym(name).replace(/[^a-z0-9]/g, '')
}

export function levenshtein(a, b) {
  if (a === b) return 0
  const matrix = []
  for (let i = 0; i <= b.length; i++) matrix[i] = [i]
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        )
      }
    }
  }
  return matrix[b.length][a.length]
}

export function isSimilarCore(coreA, coreB) {
  if (!coreA || !coreB) return false
  if (coreA === coreB) return true

  const aNoSpace = coreA.replace(/\s+/g, '')
  const bNoSpace = coreB.replace(/\s+/g, '')
  if (aNoSpace === bNoSpace) return true

  const dist = levenshtein(coreA, coreB)
  const maxLen = Math.max(coreA.length, coreB.length)
  if (maxLen >= 10 && dist <= 2) return true
  if (maxLen >= 5 && dist <= 1) return true

  // Prefijo de palabra completa: "pitbull" ≈ "pitbull strength"
  if (coreA.length >= 4 && (coreB.startsWith(`${coreA} `) || coreB.startsWith(coreA))) {
    return true
  }
  if (coreB.length >= 4 && (coreA.startsWith(`${coreB} `) || coreA.startsWith(coreB))) {
    return true
  }

  return false
}

/** Cuántas palabras empiezan en mayúscula (señal de nombre “oficial”). */
function titleCaseScore(name) {
  const words = String(name).trim().split(/\s+/).filter(Boolean)
  return words.filter((w) => /^[A-ZÁÉÍÓÚÑÜ]/.test(w)).length
}

/**
 * Entre dos nombres display, preferir el más completo (más largo tras trim).
 * Desempate: mejor Title Case, mayor count, luego localeCompare.
 */
export function preferGymName(a, b, countA = 0, countB = 0) {
  const nameA = String(a ?? '').trim()
  const nameB = String(b ?? '').trim()
  if (!nameA) return nameB
  if (!nameB) return nameA
  if (nameA.length !== nameB.length) {
    return nameA.length > nameB.length ? nameA : nameB
  }
  const titleA = titleCaseScore(nameA)
  const titleB = titleCaseScore(nameB)
  if (titleA !== titleB) {
    return titleA > titleB ? nameA : nameB
  }
  if (countA !== countB) {
    return countA > countB ? nameA : nameB
  }
  return nameA.localeCompare(nameB, 'es') <= 0 ? nameA : nameB
}

/**
 * @param {{ name: string, count?: number }[]} rows
 * @returns {{ core: string, name: string, count: number }[]}
 */
export function mergeGymVariants(rows) {
  const exactGrouped = {}
  for (const row of rows) {
    const raw = row?.name ?? row?.gym
    if (!raw) continue
    const count = Number(row.count ?? row._count?.gym ?? 1) || 1
    const norm = normalizeGym(raw)
    if (!exactGrouped[norm]) {
      exactGrouped[norm] = { name: String(raw).trim(), count }
    } else {
      exactGrouped[norm].name = preferGymName(
        exactGrouped[norm].name,
        String(raw).trim(),
        exactGrouped[norm].count,
        count,
      )
      exactGrouped[norm].count += count
    }
  }

  const sortedGroups = Object.entries(exactGrouped).sort((a, b) => b[1].count - a[1].count)
  const anchors = []

  for (const [norm, data] of sortedGroups) {
    const core = getCoreName(norm)
    let merged = false
    for (const anchor of anchors) {
      if (isSimilarCore(core, anchor.core)) {
        anchor.name = preferGymName(anchor.name, data.name, anchor.count, data.count)
        anchor.count += data.count
        // Preferir el core más largo cuando uno es prefijo del otro
        if (core.length > anchor.core.length) anchor.core = core
        merged = true
        break
      }
    }
    if (!merged) {
      anchors.push({ core, name: data.name, count: data.count })
    }
  }

  return anchors
}

/** Filtra opciones de autocomplete por texto tipeado (mín. 1 char). */
export function filterGymOptions(options, query) {
  const q = stripGymAlnum(query)
  if (!q) return []
  return (options ?? []).filter((opt) => stripGymAlnum(opt).includes(q))
}

/**
 * Si hay exactamente un match por core similar al texto tipeado, lo devuelve.
 * Útil en blur del autocomplete.
 */
export function findUniqueCoreMatch(options, query) {
  const val = String(query ?? '').trim()
  if (!val || val.length < 2) return null
  const core = getCoreName(val)
  if (!core) return null

  const matches = (options ?? []).filter((opt) => isSimilarCore(core, getCoreName(opt)))
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) {
    // Si todos colapsan al mismo display preferido, es seguro
    const preferred = matches.reduce((best, name) => preferGymName(best, name))
    const sameCore = matches.every((name) => isSimilarCore(getCoreName(preferred), getCoreName(name)))
    if (sameCore) return preferred
  }
  return null
}
