// Polyfills para APIs de browser que o jsdom não implementa, mas que o
// Vuetify usa internamente em overlays (VMenu, VDialog, VSnackbar, VSelect...).
// Sem isso, qualquer teste que abra um overlay quebra com erros como
// "visualViewport is not defined" ou "ResizeObserver is not defined".

if (typeof window.visualViewport === 'undefined') {
  window.visualViewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    addEventListener: () => {},
    removeEventListener: () => {},
  }
}

if (typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

if (typeof window.IntersectionObserver === 'undefined') {
  window.IntersectionObserver = class IntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

if (typeof window.matchMedia === 'undefined') {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
