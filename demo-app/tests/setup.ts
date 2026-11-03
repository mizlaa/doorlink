// A minimal browser for the demo store: localStorage and a hash location.
const storage = new Map<string, string>()
const location = {
  hash: '',
  href: 'http://demo.local/',
  origin: 'http://demo.local',
  replace(target: string) {
    location.hash = target
  },
}
Object.assign(globalThis, {
  window: {
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    },
    location,
    addEventListener() {},
    scrollTo() {},
  },
  location,
})
