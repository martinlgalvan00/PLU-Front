// jsdom no implementa ResizeObserver. Los componentes de antd (Table, Menu
// colapsable, Select) lo usan internamente para medir su propio tamaño, y
// sin este stub cualquier test que renderice uno de esos componentes
// revienta con "ResizeObserver is not defined" en vez de fallar por una
// aserción real. Tests puntuales que necesitan simular una medida concreta
// siguen pisando `globalThis.ResizeObserver` y restaurándolo en su propio
// `afterEach` (ver detailTabs.render.test.jsx, adminFilters.render.test.jsx).
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom tampoco implementa matchMedia. antd lo usa para su Grid interno
// (useBreakpoint, detrás de componentes como Menu/Layout) incluso cuando el
// test no pregunta nada responsive a propósito.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false
    },
  })
}
