import '../../styles/pages/account.css'
import SecuritySection from './SecuritySection.jsx'

export default {
  title: 'Pages/Account/SecuritySection',
  component: SecuritySection,
  parameters: { layout: 'fullscreen' },
  args: {
    session: { email: 'demo@pluarg.com.ar' },
  },
  decorators: [
    (Story) => (
      <div className="page page--design account-page--design">
        <div className="account-sections">
          <div className="account-tab-panel">
            <Story />
          </div>
        </div>
      </div>
    ),
  ],
}

export const Default = {}
