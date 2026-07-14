import { useEffect, useMemo, useState } from 'react'
import { BookOpen, Download, ExternalLink, FileDown, X } from 'lucide-react'
import SegmentedSwitch from '../ui/SegmentedSwitch.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'

export default function RulebookDocShell({ documents, downloadMeta, locale, manifest }) {
  const { t } = useI18n()
  const [pdfLocale, setPdfLocale] = useState(locale)
  const [viewerOpen, setViewerOpen] = useState(false)

  useEffect(() => {
    setPdfLocale(locale)
  }, [locale])

  useEffect(() => {
    if (!viewerOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event) {
      if (event.key === 'Escape') setViewerOpen(false)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [viewerOpen])

  const activeDoc = useMemo(
    () => documents.find((doc) => doc.locale === pdfLocale) ?? documents[0],
    [documents, pdfLocale],
  )

  const pdfOptions = useMemo(
    () => [
      ['es', t('pages.rulebook.pdfLanguageEs'), 'ES'],
      ['en', t('pages.rulebook.pdfLanguageEn'), 'EN'],
    ],
    [t],
  )

  if (!activeDoc) return null

  const fileName = `reglamento-plu-v${manifest.version}-${activeDoc.locale}.pdf`
  const activeLanguageLabel =
    pdfLocale === 'es' ? t('pages.rulebook.pdfLanguageEs') : t('pages.rulebook.pdfLanguageEn')

  return (
    <section className="rulebook-doc-shell">
      <article className="rulebook-doc-panel">
        <div className="rulebook-doc-panel__meta">
          <span className="rulebook-doc-panel__glyph" aria-hidden>
            <FileDown size={18} strokeWidth={1.75} />
          </span>
          <div className="rulebook-doc-panel__copy">
            <div className="rulebook-doc-panel__meta-row">
              <span className="rulebook-doc-panel__badge">PDF</span>
              <span className="rulebook-doc-panel__status">{activeDoc.download.subtitle}</span>
            </div>
            <h2 className="rulebook-doc-panel__title">{activeDoc.download.title}</h2>
            <p className="rulebook-doc-panel__meta-line">{downloadMeta}</p>
          </div>
        </div>

        <div className="rulebook-doc-panel__toolbar" aria-label={t('pages.rulebook.docActionsAria')}>
          <div className="rulebook-doc-panel__lang">
            <span className="rulebook-doc-panel__lang-label">{t('pages.rulebook.pdfLanguageSwitchLabel')}</span>
            <SegmentedSwitch
              active={pdfLocale}
              ariaLabel={t('pages.rulebook.pdfLanguageSwitchAria')}
              className="segmented-switch--rulebook segmented-switch--luxury"
              onChange={setPdfLocale}
              options={pdfOptions}
            />
          </div>

          <div className="rulebook-doc-panel__toolbar-actions">
            <button
              type="button"
              className="rulebook-doc-panel__view-btn"
              aria-label={t('pages.rulebook.viewDocument')}
              onClick={() => setViewerOpen(true)}
            >
              <BookOpen size={16} aria-hidden />
              <span>{t('pages.rulebook.viewDocument')}</span>
            </button>

            <div className="rulebook-doc-panel__icon-actions">
              <a
                className="rulebook-icon-action"
                download={fileName}
                href={activeDoc.url}
                rel="noopener"
                aria-label={t('pages.rulebook.downloadPdf')}
                title={t('pages.rulebook.downloadPdf')}
              >
                <Download size={17} aria-hidden />
              </a>
              <a
                className="rulebook-icon-action"
                href={activeDoc.url}
                rel="noopener"
                target="_blank"
                aria-label={t('pages.rulebook.openNewTab')}
                title={t('pages.rulebook.openNewTab')}
              >
                <ExternalLink size={17} aria-hidden />
              </a>
            </div>
          </div>
        </div>
      </article>

      {viewerOpen && (
        <div
          className="rulebook-pdf-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={t('pages.rulebook.viewerTitle')}
          onClick={(event) => {
            if (event.target === event.currentTarget) setViewerOpen(false)
          }}
        >
          <div className="rulebook-pdf-modal">
            <header className="rulebook-pdf-modal__header">
              <div className="rulebook-pdf-modal__intro">
                <span className="rulebook-pdf-modal__eyebrow">{t('pages.rulebook.viewerEyebrow')}</span>
                <p className="rulebook-pdf-modal__title">
                  {activeDoc.download.title}
                  <span className="rulebook-pdf-modal__title-lang">· {activeLanguageLabel}</span>
                </p>
              </div>

              <div className="rulebook-pdf-modal__controls">
                <SegmentedSwitch
                  active={pdfLocale}
                  ariaLabel={t('pages.rulebook.pdfLanguageSwitchAria')}
                  className="segmented-switch--rulebook segmented-switch--rulebook-modal segmented-switch--luxury"
                  onChange={setPdfLocale}
                  options={pdfOptions}
                />
                <button
                  type="button"
                  className="rulebook-pdf-modal__close"
                  aria-label={t('pages.rulebook.closeViewer')}
                  onClick={() => setViewerOpen(false)}
                >
                  <X size={16} aria-hidden />
                </button>
              </div>
            </header>

            <div className="rulebook-pdf-modal__body">
              <iframe
                key={activeDoc.locale}
                className="rulebook-pdf-modal__frame"
                src={activeDoc.url}
                title={t('pages.rulebook.viewerTitle')}
              />
            </div>

            <footer className="rulebook-pdf-modal__footer">
              <a
                className="rulebook-pdf-modal__footer-link"
                download={fileName}
                href={activeDoc.url}
                rel="noopener"
              >
                <Download size={14} aria-hidden />
                {t('pages.rulebook.downloadPdf')}
              </a>
              <a
                className="rulebook-pdf-modal__footer-link"
                href={activeDoc.url}
                rel="noopener"
                target="_blank"
              >
                <ExternalLink size={14} aria-hidden />
                {t('pages.rulebook.openNewTab')}
              </a>
            </footer>
          </div>
        </div>
      )}
    </section>
  )
}
