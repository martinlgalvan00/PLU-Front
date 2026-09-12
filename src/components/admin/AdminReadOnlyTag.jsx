import { Lock } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

/**
 * Aviso de "esta vista es de solo lectura para tu rol", para que las
 * acciones que desaparecen por permiso no se lean como un bug. Mismo patrón
 * visual que ya probó `PluUsaSection` (que siempre es de solo lectura),
 * generalizado acá para cualquier sección donde el rol activo tenga lectura
 * sin la escritura correspondiente -- por ejemplo el rol "PLU" por defecto,
 * que lee Atletas/Afiliaciones/Inscripciones/Eventos sin poder editarlos.
 */
export default function AdminReadOnlyTag({ hint }) {
  const { t } = useI18n()
  if (!hint) return null
  return (
    <span className="admin-readonly-tag" title={hint}>
      <Lock size={11} aria-hidden />
      <span>{t('admin.readonlyTag')}</span>
    </span>
  )
}
