// A separate browser build: an empty, device-only diary, never a seeded demo or an account.
export const LOCAL = import.meta.env.VITE_LOCAL === '1'
export const LOCAL_CONFIG = Object.freeze({ allow_guest: true, coach: null, password_login: false })

// Only static downloads from this installation are needed. This also catches a future feature
// accidentally calling fetch directly rather than going through the disabled API transport.
export function localRequestAllowed(input, init = {}, base = globalThis.location?.href) {
  try {
    const method = (init.method || input?.method || 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'HEAD') return false
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url, base)
    if (url.protocol === 'data:') return true
    const home = new URL(base)
    if (url.protocol === 'blob:') return url.origin === home.origin
    const scope = new URL('./', home).pathname
    return url.origin === home.origin && url.pathname.startsWith(scope) &&
      !url.pathname.includes('/api/') && !url.search && !url.username && !url.password
  } catch { return false }
}

export function installLocalPrivacy(target = globalThis) {
  const original = target.fetch.bind(target)
  target.fetch = (input, init = {}) => {
    if (!localRequestAllowed(input, init, target.location.href)) {
      return Promise.reject(new Error('Network access is disabled in the local GYM app.'))
    }
    return original(input, { ...init, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' })
  }
}

export async function requestLocalPersistence(storage = globalThis.navigator?.storage) {
  try { return !!(storage?.persist && await storage.persist()) } catch { return false }
}
