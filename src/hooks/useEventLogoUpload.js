import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { notifyError, notifySuccess } from '../lib/adminToast.js'
import { hasRemovableBackground } from '../lib/removeImageBackground.js'
import { validateEventLogoFile } from '../services/eventAdminService.js'

export { firstImageFile } from './useImageDrop.js'

/** Trae el logo ya subido como File (Storage es público y sirve CORS). */
async function fetchLogoFile(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) throw new Error('not-an-image')
  const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'webp'
  return new File([blob], `logo.${extension}`, { type: blob.type })
}

/**
 * Subida del logo de un evento: valida, sube y guarda en un solo gesto (no
 * espera al "Guardar" del formulario, que reescribe el evento entero). Avisa por
 * toast; la fila y la ficha se actualizan solas porque `onSetEventLogo` refresca
 * la lista del panel.
 *
 * El fondo se quita solo cuando es seguro (un fondo liso; una foto no se toca) y
 * el aviso ofrece "Restaurar fondo", que vuelve a subir el original. No hay
 * ajuste que recordar: lo que se ve en el aviso es lo que pasó, y se revierte
 * en un toque.
 *
 * `canRemoveBackground` dice si el logo ya subido tiene un fondo liso para
 * quitar; se calcula sobre una miniatura al abrir la ficha, así la acción
 * aparece solo cuando sirve.
 */
export default function useEventLogoUpload({ event, onSetEventLogo }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)
  const [canRemoveBackground, setCanRemoveBackground] = useState(false)
  const busyRef = useRef(false)
  const currentLogoRef = useRef({ url: null, file: null })
  const uploadWithRef = useRef(null)

  const logoUrl = event?.logoUrl ?? null
  useEffect(() => {
    let active = true
    setCanRemoveBackground(false)
    if (!logoUrl || !onSetEventLogo) return undefined
    fetchLogoFile(logoUrl)
      .then(async (file) => {
        currentLogoRef.current = { url: logoUrl, file }
        const removable = await hasRemovableBackground(file)
        if (active) setCanRemoveBackground(removable)
      })
      .catch(() => {
        // Sin acceso al archivo no se ofrece la acción: nunca un botón que falle.
      })
    return () => {
      active = false
    }
  }, [logoUrl, onSetEventLogo])

  const uploadWith = useCallback(
    async (file, { removeBackground, successKey }) => {
      if (!event?.slug || !onSetEventLogo || busyRef.current) return false
      if (file) {
        const validation = validateEventLogoFile(file)
        if (validation.error) {
          notifyError(validation.error)
          return false
        }
      }
      busyRef.current = true
      setBusy(true)
      try {
        const result = await onSetEventLogo(event.slug, file, { removeBackground })
        if (result?.error) throw new Error(result.error)
        if (file && result?.backgroundRemoved) {
          // `file` es el original sin tocar: es lo que vuelve al restaurar.
          notifySuccess(t('admin.eventLogo.savedNoBackground'), {
            label: t('admin.eventLogo.restoreBackground'),
            onClick: () =>
              void uploadWithRef.current?.(file, {
                removeBackground: false,
                successKey: 'admin.eventLogo.saved',
              }),
          })
        } else {
          notifySuccess(t(successKey))
        }
        return true
      } catch (error) {
        notifyError(error?.message || t('admin.eventLogo.error'))
        return false
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [event?.slug, onSetEventLogo, t],
  )
  uploadWithRef.current = uploadWith

  const upload = useCallback(
    (file) => uploadWith(file, { removeBackground: true, successKey: 'admin.eventLogo.saved' }),
    [uploadWith],
  )
  const remove = useCallback(
    () => uploadWith(null, { removeBackground: false, successKey: 'admin.eventLogo.removed' }),
    [uploadWith],
  )
  /** Quita el fondo del logo que ya está subido, sin volver a elegir el archivo. */
  const removeBackgroundOfCurrent = useCallback(async () => {
    const cached = currentLogoRef.current
    if (!logoUrl || cached.url !== logoUrl || !cached.file) return false
    return uploadWith(cached.file, {
      removeBackground: true,
      successKey: 'admin.eventLogo.saved',
    })
  }, [logoUrl, uploadWith])

  return { busy, canRemoveBackground, remove, removeBackgroundOfCurrent, upload }
}
