import { useCallback, useState } from 'react'
import { useI18n } from '../i18n/I18nProvider.jsx'
import { notifyError, notifySuccess } from '../lib/adminToast.js'
import { validateEventLogoFile } from '../services/eventAdminService.js'

/**
 * Subida del logo de un evento: valida, sube y guarda en un solo gesto (no
 * espera al "Guardar" del formulario, que reescribe el evento entero). Avisa por
 * toast; la fila y la ficha se actualizan solas porque `onSetEventLogo` refresca
 * la lista del panel.
 */
export default function useEventLogoUpload({ event, onSetEventLogo }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState(false)

  const run = useCallback(
    async (file, successKey) => {
      if (!event?.slug || !onSetEventLogo || busy) return false
      if (file) {
        const validation = validateEventLogoFile(file)
        if (validation.error) {
          notifyError(validation.error)
          return false
        }
      }
      setBusy(true)
      try {
        const result = await onSetEventLogo(event.slug, file)
        if (result?.error) throw new Error(result.error)
        notifySuccess(t(successKey))
        return true
      } catch (error) {
        notifyError(error?.message || t('admin.eventLogo.error'))
        return false
      } finally {
        setBusy(false)
      }
    },
    [busy, event?.slug, onSetEventLogo, t],
  )

  const upload = useCallback((file) => run(file, 'admin.eventLogo.saved'), [run])
  const remove = useCallback(() => run(null, 'admin.eventLogo.removed'), [run])

  return { busy, upload, remove }
}

/** Primera imagen de un DataTransfer o de un evento de pegado. */
export function firstImageFile(transfer) {
  const files = [...(transfer?.files ?? [])]
  return files.find((file) => file.type?.startsWith('image/')) ?? null
}
