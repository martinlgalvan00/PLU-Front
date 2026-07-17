import { useEffect, useId, useRef, useState } from 'react'
import { Check, Copy, Link2 } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Menú compacto con los links públicos/operativos de un evento (página
 * pública, entradas, seguridad), cada uno copiable por separado. Un solo
 * ícono trigger en vez de un botón de copiar por link -- evita saturar la
 * fila del evento en la lista de Eventos del admin.
 */
export default function AdminCopyLinkMenu({ links = [], triggerLabel }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const rootRef = useRef(null)
  const listId = useId()

  useEffect(() => {
    if (!open) return undefined

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  const visibleLinks = links.filter((link) => link.url)
  if (visibleLinks.length === 0) return null

  async function handleCopy(link) {
    try {
      await navigator.clipboard.writeText(link.url)
      setCopiedId(link.id)
      setTimeout(() => setCopiedId((current) => (current === link.id ? null : current)), 1600)
    } catch {
      // Clipboard API puede fallar sin permisos/HTTPS -- no es crítico.
    }
  }

  return (
    <div
      className={`admin-copy-menu${open ? ' is-open' : ''}`}
      ref={rootRef}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="admin-copy-menu__trigger"
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={triggerLabel ?? t('admin.copyLinkMenu.trigger')}
        title={triggerLabel ?? t('admin.copyLinkMenu.trigger')}
        onClick={() => setOpen((value) => !value)}
      >
        <Link2 size={15} aria-hidden />
      </button>

      {open && (
        <ul id={listId} className="admin-copy-menu__list" role="menu">
          {visibleLinks.map((link) => (
            <li key={link.id} role="presentation">
              <button
                type="button"
                role="menuitem"
                className="admin-copy-menu__option"
                onClick={() => handleCopy(link)}
              >
                <span>{link.label}</span>
                {copiedId === link.id ? (
                  <Check size={13} aria-hidden className="admin-copy-menu__check" />
                ) : (
                  <Copy size={13} aria-hidden className="admin-copy-menu__icon" />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
