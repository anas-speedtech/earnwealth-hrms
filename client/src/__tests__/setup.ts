import '@testing-library/jest-dom';

// Polyfill matchMedia for react-hot-toast and other libraries
beforeEach(() => {
  const queryMap: Record<string, MediaQueryList> = {};
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => {
      if (!queryMap[query]) {
        queryMap[query] = {
          matches: false,
          media: query,
          onchange: null,
          addListener: () => {},
          removeListener: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        } as MediaQueryList;
      }
      return queryMap[query];
    },
  });
});

// Suppress console errors during tests to keep output clean
const originalError = console.error;
console.error = (...args: unknown[]) => {
  const message = typeof args[0] === 'string' ? args[0] : '';
  if (message.includes('matchMedia') || message.includes('matchMedia is not a function')) {
    return;
  }
  originalError.call(console, ...args);
};
