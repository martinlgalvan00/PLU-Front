import CredentialCard from './CredentialCard.jsx'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { buildCredentialUrl, generateCredentialQr } from '../../lib/credentialQr.js'

/**
 * Wrapper que toma los labels del i18n real — la story responde al switch
 * de idioma del toolbar y queda sincronizada con las keys de producción.
 */
function CredentialCardStory({ qrSrc, ...props }) {
  const { t } = useI18n()
  return (
    <div style={{ maxWidth: 560 }}>
      <CredentialCard
        {...props}
        qrSrc={qrSrc}
        eyebrow={t('pages.members.credentialAthleteLabel')}
        codeLabel={t('pages.members.credentialCodeLabel')}
        qrAlt={t('pages.members.credentialQrAlt')}
        qrCaption={t('pages.members.credentialQrCaption')}
        flipToBackLabel={t('pages.members.credentialFlipToBack')}
        flipToFrontLabel={t('pages.members.credentialFlipToFront')}
        flipAriaLabel={t('pages.members.credentialFlipAria', { name: props.name })}
      />
    </div>
  )
}

export default {
  title: 'UI/CredentialCard',
  component: CredentialCardStory,
  tags: ['autodocs'],
  loaders: [
    async () => ({
      qrSrc: await generateCredentialQr(buildCredentialUrl({ code: 'PREV-STORYBOOK' })).catch(
        () => null,
      ),
    }),
  ],
  render: (args, { loaded }) => <CredentialCardStory {...args} qrSrc={loaded.qrSrc} />,
  args: {
    name: 'Martina Rivas',
    code: 'PLU-ARG-2026-001',
    season: 'Temporada 2026',
    status: 'Afiliación activa',
  },
}

/** Showcase público (Members): datos de muestra, QR de preview. */
export const Preview = {}

/** Credencial real del perfil: incluye vigencia bajo el QR del dorso. */
export const Real = {
  args: {
    validUntil: 'Vigente hasta 31 ene 2027',
  },
}

/** Sin QR generado: el dorso muestra el ícono de fallback. */
export const WithoutQr = {
  loaders: [async () => ({ qrSrc: null })],
}
