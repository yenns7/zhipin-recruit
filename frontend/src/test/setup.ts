import '@testing-library/jest-dom/vitest';

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

const localStorageShim = (() => {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
})();

if (
  typeof window.localStorage === 'undefined' ||
  typeof window.localStorage.getItem !== 'function'
) {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorageShim,
  });
}

if (
  typeof globalThis.localStorage === 'undefined' ||
  typeof globalThis.localStorage.getItem !== 'function'
) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: localStorageShim,
  });
}
