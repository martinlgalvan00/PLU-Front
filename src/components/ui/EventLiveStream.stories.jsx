import EventLiveStream from './EventLiveStream.jsx'

export default {
  title: 'UI/EventLiveStream',
  component: EventLiveStream,
  tags: ['autodocs'],
  args: {
    liveStatus: 'live',
    liveStreamUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    liveStreamProvider: 'youtube',
  },
}

export const YouTube = {}

export const ExternalLinkProvider = {
  args: {
    liveStreamUrl: 'https://www.instagram.com/pluarg',
    liveStreamProvider: 'instagram',
  },
}
