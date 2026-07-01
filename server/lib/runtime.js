const REQUEST_TIMEOUT_MS = 30_000
const HEADERS_TIMEOUT_MS = 35_000
const KEEP_ALIVE_TIMEOUT_MS = 5_000

export function applyServerRuntimeDefaults(server) {
  server.requestTimeout = REQUEST_TIMEOUT_MS
  server.headersTimeout = HEADERS_TIMEOUT_MS
  server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS
  server.timeout = REQUEST_TIMEOUT_MS

  return server
}
