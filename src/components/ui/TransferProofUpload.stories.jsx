import TransferProofUpload from './TransferProofUpload.jsx'

/**
 * Se monta en dos lugares: la afiliación desde la cuenta y la confirmación del
 * alta. La story existe para verificar que trae su propio CSS -- cuando las
 * reglas vivían en `pages/account.css` el control aparecía sin estilos fuera
 * del perfil.
 */
export default {
  title: 'UI/TransferProofUpload',
  component: TransferProofUpload,
  tags: ['autodocs'],
  args: {
    orderId: '3f1c9b7e-0000-4000-8000-000000000001',
  },
}

export const Default = {}
