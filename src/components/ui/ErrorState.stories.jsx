import ErrorState from './ErrorState.jsx'

export default {
  title: 'UI/ErrorState',
  component: ErrorState,
  tags: ['autodocs'],
  args: {
    title: 'Algo salió mal',
    message: 'No pudimos cargar la información. Intentá nuevamente.',
  },
}

export const Default = {}

export const WithRetry = {
  args: { onRetry: () => {}, retryLabel: 'Reintentar' },
}
