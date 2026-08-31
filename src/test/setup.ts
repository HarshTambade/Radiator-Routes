import "@testing-library/jest-dom";

// ── IndexedDB ───────────────────────────────────────────────────────────────
// jsdom does not implement IndexedDB at all, so anything touching
// `lib/idb.ts`, `lib/offlineCache.ts` or `lib/offlineMutation.ts` throws
// "indexedDB is not defined". This in-memory implementation makes the offline
// layer testable.
import "fake-indexeddb/auto";

// ── matchMedia ──────────────────────────────────────────────────────────────
// jsdom doesn't implement it; several components query it on mount.
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// ── localStorage / sessionStorage ────────────────────────────────────────────
// Under jsdom 30 in this setup, `window.localStorage` resolves to a bare object
// whose prototype is Object.prototype — `getItem`, `setItem` and `clear` are all
// undefined, so any code touching storage throws inside tests. `Storage` itself
// exists globally, which makes the gap easy to miss.
//
// Install a spec-shaped in-memory implementation on Storage.prototype so
// `vi.spyOn(Storage.prototype, …)` keeps working for tests that want to
// simulate storage failures.
function installMemoryStorage(property: "localStorage" | "sessionStorage") {
  const existing = window[property] as unknown as Partial<Storage> | undefined;
  if (typeof existing?.setItem === "function") return; // real implementation present

  const store = new Map<string, string>();

  const storage: Storage = {
    get length() {
      return store.size;
    },
    key(index: number) {
      return [...store.keys()][index] ?? null;
    },
    getItem(key: string) {
      return store.has(String(key)) ? store.get(String(key))! : null;
    },
    setItem(key: string, value: string) {
      store.set(String(key), String(value));
    },
    removeItem(key: string) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    },
  };

  // Route through Storage.prototype so spyOn(Storage.prototype, …) intercepts.
  Object.setPrototypeOf(storage, Storage.prototype);
  Object.assign(Storage.prototype, {
    getItem: storage.getItem,
    setItem: storage.setItem,
    removeItem: storage.removeItem,
    clear: storage.clear,
    key: storage.key,
  });

  Object.defineProperty(window, property, {
    value: storage,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, property, {
    value: storage,
    configurable: true,
    writable: true,
  });
}

installMemoryStorage("localStorage");
installMemoryStorage("sessionStorage");
