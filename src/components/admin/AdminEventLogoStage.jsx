import { useEffect, useRef, useState } from 'react'
import { Eraser, ImagePlus, RefreshCw, Trash2, Undo2 } from 'lucide-react'
import useImageDrop from '../../hooks/useImageDrop.js'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { BACKGROUND_REASON } from '../../lib/removeImageBackground.js'
import { prepareEventLogoFile } from '../../services/eventAdminService.js'
import '../../styles/pages/admin-event-logo.css'

/**
 * AdminEventLogoStage — PLU ARG
 *
 * El logo en el alta, antes de que el evento exista: se elige, se limpia solo y
 * se ve tal cual va a quedar. No sube nada; entrega por `onChange` el archivo ya
 * preparado (o `null`) y quien crea el evento lo sube después.
 *
 * El fondo se quita solo si es liso (una foto no se toca) y una única acción
 * alterna entre «Restaurar fondo» y «Quitar fondo». No hay un ajuste previo que
 * adivinar: se ve el resultado y se revierte en un toque.
 *
 * La vista previa va sobre un damero para que la transparencia se vea como lo
 * que es: sobre un fondo liso, un logo con el fondo bien quitado y uno con una
 * caja blanca se ven igual, y se descubre recién en el sitio.
 *
 * `initialFile` precarga un logo ya procesado (al duplicar un evento): no se le
 * vuelve a tocar el fondo.
 */

/** Cómo quedó el fondo: quitado, restaurado a pedido, o sin fondo liso que quitar. */
const BACKGROUND = { REMOVED: 'removed', RESTORED: 'restored', NONE: 'none' }

export default function AdminEventLogoStage({
  disabled = false,
  initialFile = null,
  onChange,
  onPendingChange,
}) {
  const { t } = useI18n()
  const [original, setOriginal] = useState(null)
  const [result, setResult] = useState(
    initialFile ? { file: initialFile, backgroundRemoved: false, backgroundReason: null } : null,
  )
  const [background, setBackground] = useState(BACKGROUND.NONE)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onPendingChangeRef = useRef(onPendingChange)
  onPendingChangeRef.current = onPendingChange
  const runRef = useRef(0)

  // Un logo precargado llega después del primer render (se descarga al duplicar).
  useEffect(() => {
    if (!initialFile) return
    setOriginal(null)
    setBackground(BACKGROUND.NONE)
    setResult({ file: initialFile, backgroundRemoved: false, backgroundReason: null })
    onChangeRef.current?.(initialFile)
  }, [initialFile])

  // La URL del <img> se arma y se libera acá: un ObjectURL por archivo, nunca más.
  useEffect(() => {
    if (!result?.file) {
      setPreviewUrl(null)
      return undefined
    }
    const url = URL.createObjectURL(result.file)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [result?.file])

  async function process(file, removeBackground) {
    const run = runRef.current + 1
    runRef.current = run
    setProcessing(true)
    onPendingChangeRef.current?.(true)
    setError(null)
    try {
      const prepared = await prepareEventLogoFile(file, { removeBackground })
      if (runRef.current !== run) return
      setResult(prepared)
      setBackground(
        prepared.backgroundRemoved
          ? BACKGROUND.REMOVED
          : removeBackground
            ? BACKGROUND.NONE
            : BACKGROUND.RESTORED,
      )
      onChangeRef.current?.(prepared.file)
    } catch (failure) {
      if (runRef.current !== run) return
      setError(failure?.message || t('admin.eventLogo.error'))
      setResult(null)
      setBackground(BACKGROUND.NONE)
      onChangeRef.current?.(null)
    } finally {
      if (runRef.current === run) {
        setProcessing(false)
        onPendingChangeRef.current?.(false)
      }
    }
  }

  function handleFile(file) {
    setOriginal(file)
    void process(file, true)
  }

  function handleClear() {
    runRef.current += 1
    setOriginal(null)
    setResult(null)
    setBackground(BACKGROUND.NONE)
    setError(null)
    setProcessing(false)
    onPendingChangeRef.current?.(false)
    onChangeRef.current?.(null)
  }

  const { dragging, dropProps, inputProps, inputRef, openPicker } = useImageDrop({
    disabled: disabled || processing,
    onFile: handleFile,
  })

  const hasLogo = Boolean(result?.file)
  const reason = result?.backgroundReason
  // El botón solo existe si hubo (o hay) algo que alternar: con una foto, o con
  // un logo que ya era transparente, no hay acción que ofrecer.
  const canToggleBackground =
    Boolean(original) && (background === BACKGROUND.REMOVED || background === BACKGROUND.RESTORED)

  let statusText = t('admin.eventLogo.stageHint')
  if (processing) statusText = t('admin.eventLogo.processing')
  else if (error) statusText = error
  else if (background === BACKGROUND.REMOVED) statusText = t('admin.eventLogo.backgroundRemoved')
  else if (background === BACKGROUND.RESTORED) statusText = t('admin.eventLogo.backgroundKept')
  else if (hasLogo && original && reason === BACKGROUND_REASON.ALREADY_TRANSPARENT) {
    statusText = t('admin.eventLogo.alreadyTransparent')
  } else if (hasLogo && original && reason === BACKGROUND_REASON.NO_FLAT_BACKGROUND) {
    statusText = t('admin.eventLogo.noFlatBackground')
  } else if (hasLogo) statusText = t('admin.eventLogo.stageReady')

  const stateClass = `${dragging ? ' is-dragging' : ''}${processing ? ' is-busy' : ''}`
  const busy = disabled || processing

  return (
    <section
      className={`admin-event-logo admin-event-logo--stage${stateClass}`}
      aria-label={t('admin.eventLogo.stageLabel')}
      {...dropProps}
    >
      <button
        type="button"
        className={`admin-event-logo__tile${hasLogo ? ' has-logo' : ''}`}
        aria-label={hasLogo ? t('admin.eventLogo.change') : t('admin.eventLogo.add')}
        disabled={busy}
        onClick={openPicker}
      >
        {hasLogo && previewUrl ? (
          <img src={previewUrl} alt="" />
        ) : (
          <ImagePlus size={22} strokeWidth={1.5} aria-hidden />
        )}
        {processing ? <span className="plu-spinner plu-spinner--sm" aria-hidden="true" /> : null}
      </button>

      <div className="admin-event-logo__copy">
        <h3 className="admin-event-logo__title">{t('admin.eventLogo.stageTitle')}</h3>
        {/* Región viva solo cuando hay algo que anunciar: en reposo es ayuda fija. */}
        <p
          className={`admin-event-logo__hint${error ? ' is-error' : ''}`}
          role={error ? 'alert' : processing || hasLogo ? 'status' : undefined}
        >
          {dragging ? t('admin.eventLogo.dropHere') : statusText}
        </p>

        <div className="admin-event-logo__actions">
          <button type="button" className="admin-event-logo__action" disabled={busy} onClick={openPicker}>
            {hasLogo ? <RefreshCw size={15} aria-hidden /> : <ImagePlus size={15} aria-hidden />}
            {hasLogo ? t('admin.eventLogo.change') : t('admin.eventLogo.add')}
          </button>
          {canToggleBackground ? (
            <button
              type="button"
              className="admin-event-logo__action"
              disabled={busy}
              onClick={() => void process(original, background === BACKGROUND.RESTORED)}
            >
              {background === BACKGROUND.REMOVED ? (
                <Undo2 size={15} aria-hidden />
              ) : (
                <Eraser size={15} aria-hidden />
              )}
              {background === BACKGROUND.REMOVED
                ? t('admin.eventLogo.restoreBackground')
                : t('admin.eventLogo.removeBackground')}
            </button>
          ) : null}
          {hasLogo ? (
            <button
              type="button"
              className="admin-event-logo__action admin-event-logo__action--quiet"
              disabled={busy}
              onClick={handleClear}
            >
              <Trash2 size={15} aria-hidden />
              {t('admin.eventLogo.remove')}
            </button>
          ) : null}
        </div>
      </div>

      <input ref={inputRef} {...inputProps} />
    </section>
  )
}
