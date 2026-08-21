import { useCallback, useEffect, useState } from 'react'

const STORAGE_PREFIX = 'plu-admin-saved-views:'
const MAX_VIEWS_PER_SECTION = 8

function storageKey(sectionKey) {
  return `${STORAGE_PREFIX}${sectionKey}`
}

function readViews(sectionKey) {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey(sectionKey))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeViews(sectionKey, views) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(sectionKey), JSON.stringify(views))
  } catch {}
}

/**
 * Combinaciones de filtros que el operador nombra y reutiliza en una sección
 * del admin (ej. "Morosos con afiliación activa" = query + 2 chips). Vive en
 * localStorage del navegador -- es un atajo personal, no un dato de negocio,
 * así que no pasa por el backend ni por servicios de dominio.
 */
export function useAdminSavedFilterViews(sectionKey) {
  const [views, setViews] = useState(() => readViews(sectionKey))

  useEffect(() => {
    setViews(readViews(sectionKey))
  }, [sectionKey])

  const saveView = useCallback(
    (label, snapshot) => {
      const trimmed = label.trim()
      if (!trimmed) return
      setViews((current) => {
        const next = [
          ...current.filter((view) => view.label !== trimmed),
          {
            id: `view-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            label: trimmed,
            snapshot,
          },
        ].slice(-MAX_VIEWS_PER_SECTION)
        writeViews(sectionKey, next)
        return next
      })
    },
    [sectionKey],
  )

  const removeView = useCallback(
    (id) => {
      setViews((current) => {
        const next = current.filter((view) => view.id !== id)
        writeViews(sectionKey, next)
        return next
      })
    },
    [sectionKey],
  )

  return { views, saveView, removeView }
}

/** Vista guardada cuyo snapshot coincide exactamente con el estado actual de filtros, o null. */
export function findMatchingView(views, snapshot) {
  const target = JSON.stringify(snapshot)
  return views.find((view) => JSON.stringify(view.snapshot) === target) ?? null
}
