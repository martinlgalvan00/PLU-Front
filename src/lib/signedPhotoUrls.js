/**
 * Las URLs firmadas de Storage cambian el query en cada firma. Si el poll del
 * panel o el de cupos públicos pisa `src` con un token nuevo, el browser
 * vuelve a bajar el archivo entero y eso se cuenta como egress de Supabase.
 * Reusar la URL previa mientras la identidad de la foto no cambió evita ese
 * re-download sin volver público el bucket.
 */

export function missingAthletePhotoPaths(athletes = []) {
  return [...new Set(athletes.filter((athlete) => athlete.photoPath && !athlete.photoUrl).map((athlete) => athlete.photoPath))]
}

export function applyAthletePhotoUrls(athletes = [], urls = {}) {
  if (!athletes.length) return athletes
  return athletes.map((athlete) => ({
    ...athlete,
    photoUrl: athlete.photoUrl || urls[athlete.photoPath] || null,
  }))
}

export function preserveAthletePhotoUrls(previous = [], next = []) {
  if (!next.length) return next
  if (!previous.length) return next

  const previousById = new Map(previous.map((athlete) => [athlete.id, athlete]))
  return next.map((athlete) => {
    const prior = previousById.get(athlete.id)
    if (!prior) return athlete
    if (athlete.photoPath !== prior.photoPath) return athlete
    if (athlete.photoUrl || !prior.photoUrl) return athlete
    return { ...athlete, photoUrl: prior.photoUrl }
  })
}

function portraitKey(item) {
  return `${item?.displayName ?? ''}|${item.registeredAt ?? ''}`
}

export function reuseRecentPortraitsInSummary(previous, next) {
  if (!next?.recent?.length || !previous?.recent?.length) return next

  const previousUrlByKey = new Map()
  for (const item of previous.recent) {
    const key = portraitKey(item)
    if (item?.photoUrl) previousUrlByKey.set(key, item.photoUrl)
  }

  return {
    ...next,
    recent: next.recent.map((item) => {
      const previousUrl = previousUrlByKey.get(portraitKey(item))
      if (previousUrl && item.photoUrl && previousUrl !== item.photoUrl) {
        return { ...item, photoUrl: previousUrl }
      }
      return item
    }),
  }
}
