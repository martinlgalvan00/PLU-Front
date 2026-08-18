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

// jsdom tampoco implementa pseudo-elementos en getComputedStyle: toda llamada
// con segundo argumento emite "Not implemented: window.getComputedStyle(elt,
// pseudoElt)" por la consola virtual. antd la usa para medir el scrollbar de
// Table (@rc-component/util/getScrollBarSize hace
// `getComputedStyle(el, '::-webkit-scrollbar')`), así que un puñado de tablas
// ensucia la corrida con decenas de errores que no pertenecen a ningún test y
// que vitest cuenta aparte de las aserciones. Se ignora el pseudo-elemento: la
// medida queda en 0, que es lo que jsdom reporta para todo lo que no tiene
// layout, y es exactamente el fallback que antd ya maneja.
if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
  const nativeGetComputedStyle = window.getComputedStyle.bind(window)
  window.getComputedStyle = (element, pseudoElement) =>
    pseudoElement ? nativeGetComputedStyle(element) : nativeGetComputedStyle(element)
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
