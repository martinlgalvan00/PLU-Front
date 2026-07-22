import { useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useTheme } from '../../providers/ThemeProvider.jsx'

export default function ThemeToggle({ compact = false }) {
  const { theme, toggleTheme } = useTheme()
  const { t } = useI18n()
  const [switching, setSwitching] = useState(false)
  const isDark = theme === 'dark'

  function handleToggle() {
    setSwitching(true)
    toggleTheme()
    window.setTimeout(() => setSwitching(false), 480)
  }

  return (
    <button
      type="button"
      className={`pref-toggle ${compact ? 'pref-toggle--compact' : ''} ${switching ? 'pref-toggle--switching' : ''}`.trim()}
      onClick={handleToggle}
      aria-label={`${t('theme.label')}: ${isDark ? t('theme.light') : t('theme.dark')}`}
      title={`${t('theme.label')}: ${isDark ? t('theme.light') : t('theme.dark')}`}
    >
      {isDark ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
      {!compact && <span>{isDark ? t('theme.light') : t('theme.dark')}</span>}
    </button>
  )
}
