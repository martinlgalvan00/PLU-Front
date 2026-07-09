import PageFrame from '../components/layout/PageFrame.jsx'
import { InfoCard } from '../components/ui/Cards.jsx'
import { useI18n } from '../i18n/I18nProvider.jsx'

export default function TeamPage() {
  const { t } = useI18n()

  return (
    <PageFrame eyebrow={t('pages.team.eyebrow')} title={t('pages.team.title')} description={t('pages.team.description')}>
      <div className="content-grid">
        <InfoCard title={t('pages.team.officialsTitle')} text={t('pages.team.officialsText')} />
        <InfoCard title={t('pages.team.meetDirectorTitle')} text={t('pages.team.meetDirectorText')} />
        <InfoCard title={t('pages.team.hostFacilityTitle')} text={t('pages.team.hostFacilityText')} />
      </div>
    </PageFrame>
  )
}
