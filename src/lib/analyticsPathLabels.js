const ANALYTICS_PATH_LABELS = {
  '/': 'admin.analytics.live.paths.home',
  '/perfil': 'admin.analytics.live.paths.profile',
  '/afiliarse': 'admin.analytics.live.paths.membership',
  '/afiliacion': 'admin.analytics.live.paths.membership',
  '/eventos': 'admin.analytics.live.paths.events',
  '/calendario': 'admin.analytics.live.paths.events',
  '/pitbull-classic': 'admin.analytics.live.paths.pitbull',
  '/pitbull': 'admin.analytics.live.paths.pitbull',
  '/reglamento': 'admin.analytics.live.paths.rulebook',
  '/acceder': 'admin.analytics.live.paths.login',
  '/credencial': 'admin.analytics.live.paths.credential',
}

/** Etiqueta legible para rutas del sitio; fallback al path crudo en mono. */
export function formatAnalyticsPath(path, t) {
  const key = ANALYTICS_PATH_LABELS[path]
  if (key) {
    const label = t(key)
    if (label !== key) return { label, path, mono: false }
  }
  return { label: path, path, mono: true }
}
