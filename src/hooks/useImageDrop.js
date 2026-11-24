import { useRef, useState } from 'react'

/** Primera imagen de un DataTransfer o de un evento de pegado. */
export function firstImageFile(transfer) {
  const files = [...(transfer?.files ?? [])]
  return files.find((file) => file.type?.startsWith('image/')) ?? null
}

const hasFiles = (dragEvent) => [...(dragEvent.dataTransfer?.types ?? [])].includes('Files')

/**
 * Las tres formas de traer una imagen -- elegir archivo, arrastrar y soltar, o
 * pegar del portapapeles -- con un solo resultado: `onFile(file)`.
 *
 * Devuelve las props para la zona de suelta (`dropProps`), las del `<input
 * type="file">` oculto (`inputProps`, con su `inputRef`) y `openPicker`.
 */
export default function useImageDrop({ onFile, disabled = false, accept }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = (file) => {
    if (file && !disabled) onFile(file)
  }

  const dropProps = {
    onDragEnter: (dragEvent) => {
      if (disabled || !hasFiles(dragEvent)) return
      dragEvent.preventDefault()
      setDragging(true)
    },
    onDragOver: (dragEvent) => {
      if (!disabled && hasFiles(dragEvent)) dragEvent.preventDefault()
    },
    onDragLeave: (dragEvent) => {
      if (!dragEvent.currentTarget.contains(dragEvent.relatedTarget)) setDragging(false)
    },
    onDrop: (dragEvent) => {
      dragEvent.preventDefault()
      setDragging(false)
      handleFile(firstImageFile(dragEvent.dataTransfer))
    },
    onPaste: (pasteEvent) => {
      const file = firstImageFile(pasteEvent.clipboardData)
      if (!file || disabled) return
      pasteEvent.preventDefault()
      handleFile(file)
    },
  }

  const inputProps = {
    type: 'file',
    accept: accept ?? 'image/jpeg,image/png,image/webp',
    className: 'visually-hidden',
    tabIndex: -1,
    'aria-hidden': 'true',
    onChange: (changeEvent) => {
      handleFile(changeEvent.target.files?.[0] ?? null)
      // Permite elegir de nuevo el mismo archivo.
      changeEvent.target.value = ''
    },
  }

  return {
    dragging,
    dropProps,
    inputProps,
    inputRef,
    openPicker: () => inputRef.current?.click(),
  }
}
