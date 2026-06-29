import { Moon, Sun } from 'lucide-react'
import { useI18n } from '../../i18n/I18nProvider.jsx'
import { useTheme } from '../../providers/ThemeProvider.jsx'

export default function ThemeToggle({ compact = false }) {
  const { theme, toggleTheme } = useTheme()
  const { t } = useI18n()
  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      className={`pref-toggle ${compact ? 'pref-toggle--compact' : ''}`}
      onClick={toggleTheme}
      aria-label={`${t('theme.label')}: ${isDark ? t('theme.light') : t('theme.dark')}`}
      title={`${t('theme.label')}: ${isDark ? t('theme.light') : t('theme.dark')}`}
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
      {!compact && <span>{isDark ? t('theme.light') : t('theme.dark')}</span>}
    </button>
  )
}
