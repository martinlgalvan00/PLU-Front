export function notImplemented(res, feature) {
  return res.status(501).json({ error: `${feature} no disponible` })
}
