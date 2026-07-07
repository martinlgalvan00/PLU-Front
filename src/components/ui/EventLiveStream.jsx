import { Radio, ExternalLink } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'

const PROVIDER_LABELS = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  twitch: 'Twitch',
}

function getYoutubeEmbedUrl(url) {
  try {
    const parsed = new URL(url)
    if (parsed.hostname.includes('youtu.be')) {
      return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`
    }
    const videoId = parsed.searchParams.get('v')
    if (videoId) return `https://www.youtube.com/embed/${videoId}`
    if (parsed.pathname.startsWith('/live/') || parsed.pathname.startsWith('/embed/')) {
      return `https://www.youtube.com${parsed.pathname}`
    }
    return null
  } catch {
    return null
  }
}

function getTwitchEmbedUrl(url) {
  try {
    const parsed = new URL(url)
    const channel = parsed.pathname.replace(/^\//, '').split('/')[0]
    if (!channel) return null
    const parent = typeof window !== 'undefined' ? window.location.hostname : 'localhost'
    return `https://player.twitch.tv/?channel=${channel}&parent=${parent}&muted=false`
  } catch {
    return null
  }
}

// Instagram no permite embeber un vivo en un iframe simple (requiere su SDK
// de embeds) — para ese proveedor mostramos un link destacado en vez de un
// reproductor incrustado.
function getEmbedUrl(provider, url) {
  if (provider === 'youtube') return getYoutubeEmbedUrl(url)
  if (provider === 'twitch') return getTwitchEmbedUrl(url)
  return null
}

/**
 * Directo de un evento. Solo se renderiza mientras `liveStatus === 'live'`
 * (ver `events.live_status` en Supabase) — el admin lo prende/apaga desde
 * el editor del evento.
 */
export default function EventLiveStream({ liveStatus, liveStreamUrl, liveStreamProvider }) {
  const { t } = useI18n()

  if (liveStatus !== 'live' || !liveStreamUrl) return null

  const embedUrl = getEmbedUrl(liveStreamProvider, liveStreamUrl)
  const providerLabel = PROVIDER_LABELS[liveStreamProvider] ?? liveStreamProvider

  return (
    <div className="event-live-stream">
      <div className="event-live-stream__badge">
        <Radio size={13} aria-hidden />
        {t('pages.events.live.badge')}
      </div>

      {embedUrl ? (
        <div className="event-live-stream__frame">
          <iframe
            src={embedUrl}
            title={providerLabel}
            allow="autoplay; fullscreen"
            allowFullScreen
          />
        </div>
      ) : (
        <a
          className="event-live-stream__link"
          href={liveStreamUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('pages.events.live.watchOn', { provider: providerLabel })}
          <ExternalLink size={14} aria-hidden />
        </a>
      )}
    </div>
  )
}
