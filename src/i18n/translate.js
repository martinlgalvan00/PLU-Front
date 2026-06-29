export function translate(messages, key, vars = {}) {
  const value = key.split('.').reduce((acc, part) => acc?.[part], messages)
  if (typeof value !== 'string') return key

  return value.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars[name] ?? ''))
}
