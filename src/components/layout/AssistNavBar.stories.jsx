import AssistNavBar from './AssistNavBar.jsx'

export default {
  title: 'Layout/AssistNavBar',
  component: AssistNavBar,
  tags: ['autodocs'],
  args: {
    view: 'home',
    onNavigate: () => {},
    onRunAction: () => {},
    onOpenHelp: () => {},
  },
}

/** Visitante: el próximo paso es crear la cuenta. */
export const Guest = {
  args: { actionKey: 'account', isAthlete: false, pending: true },
}

/** Atleta sin afiliación vigente. */
export const NeedsMembership = {
  args: { actionKey: 'membership', isAthlete: true, pending: true },
}

/** Atleta afiliado con un meet abierto. */
export const ReadyToRegister = {
  args: { actionKey: 'registration', isAthlete: true, pending: true },
}

/** Trámite cerrado: la acción pasa a ser la credencial y no hay punto pendiente. */
export const Complete = {
  args: { actionKey: 'credential', isAthlete: true, pending: false, view: 'profile' },
}
