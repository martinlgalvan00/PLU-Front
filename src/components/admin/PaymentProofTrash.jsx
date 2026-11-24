import { useCallback, useEffect, useId, useState } from 'react'
import { ExternalLink, RotateCcw, Trash2 } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import {
  emptyProofTrash,
  fetchProofTrash,
  proofTrashFileUrl,
  purgeProofFile,
  PROOF_TRASH_PAGE,
  restoreProofFile,
} from '../../services/paymentProofsAdminService.js'
import '../../styles/pages/admin-payment-expiry.css'
import '../../styles/pages/admin-payment-proofs.css'

/**
 * Papelera de comprobantes: lo que salió de circulación pero todavía no se
 * eliminó del servidor. Un comprobante llega acá porque lo reemplazaron, venció
 * la política, se dio de baja o se eliminó al atleta, y se queda hasta que se
 * cumple el período de la papelera.
 *
 * Restaurar es reversible y sale directo. Eliminar para siempre no lo es, así
 * que pide una segunda confirmación en el mismo lugar (sin modal).
 */

function formatDay(value, locale) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'es-AR', { dateStyle: 'medium' }).format(
    date,
  )
}

export default function PaymentProofTrash({ canEdit = false, count = 0, onChanged }) {
  const { locale, t } = useI18n()
  const regionId = useId()
  const [open, setOpen] = useState(false)
  const [list, setList] = useState({ items: [], total: 0, loaded: false })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)
  // `{ kind: 'purge', id }` o `{ kind: 'empty' }`: lo que espera el segundo clic.
  const [confirming, setConfirming] = useState(null)

  // Con `offset` > 0 la página se agrega a lo ya cargado ("ver más").
  const load = useCallback(
    async ({ offset = 0 } = {}) => {
      setLoading(true)
      setError('')
      try {
        const next = await fetchProofTrash({ limit: PROOF_TRASH_PAGE, offset })
        setList((current) => ({
          items: offset > 0 ? [...current.items, ...next.items] : next.items,
          total: next.total,
          loaded: true,
        }))
      } catch (loadError) {
        setError(loadError?.message ?? t('admin.paymentProofs.trash.loadError'))
      } finally {
        setLoading(false)
      }
    },
    [t],
  )

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  async function run(id, action, { success, failure }) {
    setBusyId(id)
    setError('')
    setNotice('')
    setConfirming(null)
    try {
      const result = await action()
      setNotice(typeof success === 'function' ? success(result) : success)
      await load()
      onChanged?.()
    } catch (actionError) {
      setError(actionError?.message ?? failure)
    } finally {
      setBusyId(null)
    }
  }

  const restore = (item) =>
    run(item.id, () => restoreProofFile(item.id), {
      success: t('admin.paymentProofs.trash.restored'),
      failure: t('admin.paymentProofs.trash.restoreError'),
    })

  const purge = (item) =>
    run(item.id, () => purgeProofFile(item.id), {
      success: t('admin.paymentProofs.trash.purged'),
      failure: t('admin.paymentProofs.trash.purgeError'),
    })

  const emptyAll = () =>
    run('all', () => emptyProofTrash(), {
      success: (result) =>
        result.failed > 0
          ? t('admin.paymentProofs.trash.emptiedPartial', {
              count: result.purged,
              failed: result.failed,
            })
          : t('admin.paymentProofs.trash.emptied', { count: result.purged }),
      failure: t('admin.paymentProofs.trash.purgeError'),
    })

  const busy = busyId !== null
  const hasMore = list.items.length < list.total

  return (
    <section className="admin-proofs__trash" aria-labelledby={`${regionId}-title`}>
      <div className="admin-proofs__trash-head">
        <div>
          <h4 className="admin-proofs__trash-title" id={`${regionId}-title`}>
            {t('admin.paymentProofs.trash.title')}
          </h4>
          <p className="admin-proofs__help">
            {t('admin.paymentProofs.trash.help')}
            {canEdit ? '' : ` ${t('admin.paymentProofs.trash.readOnly')}`}
          </p>
        </div>
        <button
          type="button"
          className="admin-proofs__link"
          aria-expanded={open}
          aria-controls={`${regionId}-body`}
          onClick={() => setOpen((current) => !current)}
        >
          <Trash2 size={15} aria-hidden />
          <span>
            {open
              ? t('admin.paymentProofs.trash.hide')
              : t('admin.paymentProofs.trash.show', { count })}
          </span>
        </button>
      </div>

      {open ? (
        <div className="admin-proofs__trash-body" id={`${regionId}-body`}>
          {error ? (
            <p className="admin-payment-expiry__error" role="alert">
              {error}
            </p>
          ) : null}
          <p className="admin-proofs__notice" role="status">
            {notice}
          </p>

          {loading && !list.loaded ? (
            <p className="admin-proofs__help">{t('admin.paymentProofs.trash.loading')}</p>
          ) : null}
          {list.loaded && list.items.length === 0 ? (
            <p className="admin-proofs__help">{t('admin.paymentProofs.trash.empty')}</p>
          ) : null}

          {list.items.length > 0 ? (
            <ul className="admin-proofs__trash-list">
              {list.items.map((item) => {
                const expired = item.purgeAt && new Date(item.purgeAt).getTime() <= Date.now()
                return (
                  <li className="admin-proofs__trash-item" key={item.id}>
                    <div className="admin-proofs__trash-main">
                      <strong>{item.person ?? t('admin.paymentProofs.trash.unknownPerson')}</strong>
                      <span className="admin-proofs__trash-meta">
                        {[
                          t(`admin.paymentProofs.trash.source.${item.source}`),
                          item.reference,
                          t(`admin.paymentProofs.trash.reason.${item.reason}`),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                      <span className="admin-proofs__trash-meta">
                        {[
                          item.deletedAt
                            ? t('admin.paymentProofs.trash.deletedOn', {
                                date: formatDay(item.deletedAt, locale),
                              })
                            : '',
                          expired
                            ? t('admin.paymentProofs.trash.purgeSoon')
                            : item.purgeAt
                              ? t('admin.paymentProofs.trash.purgeAt', {
                                  date: formatDay(item.purgeAt, locale),
                                })
                              : '',
                          item.exportedAt ? t('admin.paymentProofs.trash.downloaded') : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                        {/* Sin copia local es lo único que se pierde de verdad al eliminar:
                            se marca con el peso de una advertencia, no como un dato más. */}
                        {item.exportedAt ? null : (
                          <>
                            {' · '}
                            <span className="admin-proofs__trash-flag">
                              {t('admin.paymentProofs.trash.notDownloaded')}
                            </span>
                          </>
                        )}
                      </span>
                      {item.restorable ? null : (
                        <span className="admin-proofs__trash-meta">
                          {t('admin.paymentProofs.trash.notRestorable')}
                        </span>
                      )}
                    </div>

                    <div className="admin-proofs__trash-actions">
                      <a
                        className="admin-proofs__link"
                        href={proofTrashFileUrl(item.id)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink size={14} aria-hidden />
                        <span>{t('admin.paymentProofs.trash.view')}</span>
                      </a>
                      {canEdit ? (
                        <>
                          <button
                            type="button"
                            className="admin-proofs__link"
                            disabled={busy || !item.restorable}
                            onClick={() => void restore(item)}
                          >
                            <RotateCcw size={14} aria-hidden />
                            <span>{t('admin.paymentProofs.trash.restore')}</span>
                          </button>
                          {confirming?.kind === 'purge' && confirming.id === item.id ? (
                            <>
                              <button
                                type="button"
                                className="admin-proofs__link admin-proofs__link--danger"
                                disabled={busy}
                                onClick={() => void purge(item)}
                              >
                                {t('admin.paymentProofs.trash.purgeConfirm')}
                              </button>
                              <button
                                type="button"
                                className="admin-proofs__link"
                                disabled={busy}
                                onClick={() => setConfirming(null)}
                              >
                                {t('admin.paymentProofs.trash.cancel')}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="admin-proofs__link"
                              disabled={busy}
                              onClick={() => setConfirming({ kind: 'purge', id: item.id })}
                            >
                              {t('admin.paymentProofs.trash.purge')}
                            </button>
                          )}
                        </>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : null}

          <div className="admin-proofs__trash-foot">
            {hasMore ? (
              <button
                type="button"
                className="admin-proofs__link"
                disabled={loading || busy}
                onClick={() => void load({ offset: list.items.length })}
              >
                {t('admin.paymentProofs.trash.more')}
              </button>
            ) : null}
            {canEdit && list.total > 0 ? (
              confirming?.kind === 'empty' ? (
                <>
                  <span className="admin-proofs__trash-meta" role="alert">
                    {t('admin.paymentProofs.trash.irreversible')}
                  </span>
                  <button
                    type="button"
                    className="admin-proofs__link admin-proofs__link--danger"
                    disabled={busy}
                    onClick={() => void emptyAll()}
                  >
                    {t('admin.paymentProofs.trash.emptyConfirm', { count: list.total })}
                  </button>
                  <button
                    type="button"
                    className="admin-proofs__link"
                    disabled={busy}
                    onClick={() => setConfirming(null)}
                  >
                    {t('admin.paymentProofs.trash.cancel')}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="admin-proofs__link"
                  disabled={busy}
                  onClick={() => setConfirming({ kind: 'empty' })}
                >
                  {t('admin.paymentProofs.trash.emptyAll')}
                </button>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  )
}
