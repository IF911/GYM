/*
 * Small lifecycle bridge for the local PWA service worker.
 *
 * It deliberately never reloads the page and never reads or writes app data. The
 * worker only reports the entry module it serves; comparing that URL with the
 * current document is enough to tell an old shell from the current one.
 */

const AUTO_THROTTLE_MS = 60_000
const QUERY_TIMEOUT_MS = 2_000
const ACTIVATION_TIMEOUT_MS = 20_000
const INITIAL_SNAPSHOT = Object.freeze({ checking: false, available: false, error: null })

const initialSnapshot = () => INITIAL_SNAPSHOT

const errorName = error => {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'timeout'
  if (error instanceof TypeError || /offline|network|failed to fetch/i.test(String(error?.message || error))) return 'offline'
  return 'failed'
}

const entryUrl = (value, doc) => {
  if (!value || !doc) return null
  try { return new URL(value, doc.baseURI || doc.location?.href).href } catch { return null }
}

/**
 * Create an updater. The factory is exported for deterministic browser-mock tests;
 * production code should normally use startLocalPwaUpdates().
 */
export function createLocalPwaUpdater(deps = {}) {
  const nav = deps.navigator ?? globalThis.navigator
  const win = deps.window ?? globalThis.window
  const doc = deps.document ?? globalThis.document
  const MessageChannelImpl = deps.MessageChannel ?? globalThis.MessageChannel
  const setTimer = deps.setTimeout ?? globalThis.setTimeout
  const clearTimer = deps.clearTimeout ?? globalThis.clearTimeout
  const now = deps.now ?? (() => Date.now())
  const autoThrottleMs = deps.autoThrottleMs ?? AUTO_THROTTLE_MS
  const queryTimeoutMs = deps.queryTimeoutMs ?? QUERY_TIMEOUT_MS
  const activationTimeoutMs = deps.activationTimeoutMs ?? ACTIVATION_TIMEOUT_MS

  let snapshot = INITIAL_SNAPSHOT
  let registration = null
  let currentCheck = null
  let startPromise = null
  let lastAutoCheck = -Infinity
  let disposed = false
  let lifecycleQueryPending = false
  const boundWorkers = new WeakSet()
  const subscribers = new Set()
  const bound = []

  const publish = patch => {
    const next = { ...snapshot, ...patch }
    if (next.checking === snapshot.checking && next.available === snapshot.available && next.error === snapshot.error) return
    snapshot = Object.freeze(next)
    for (const listener of [...subscribers]) {
      try { listener(snapshot) } catch { /* subscriber errors must not break lifecycle work */ }
    }
  }

  const on = (target, type, listener) => {
    if (!target?.addEventListener) return
    target.addEventListener(type, listener)
    bound.push(() => target.removeEventListener?.(type, listener))
  }

  const currentEntry = () => {
    const script = doc?.querySelector?.('script[type="module"][src]')
    return entryUrl(script?.src, doc)
  }

  const queryShell = async () => {
    const controller = nav?.serviceWorker?.controller
    if (!controller || !MessageChannelImpl) return null
    const channel = new MessageChannelImpl()
    return await new Promise((resolve, reject) => {
      let timer
      let settled = false
      const finish = (fn, value) => {
        if (settled) return
        settled = true
        clearTimer(timer)
        try { channel.port1.close?.() } catch {}
        fn(value)
      }
      timer = setTimer(() => finish(reject, Object.assign(new Error('service worker query timed out'), { name: 'TimeoutError' })), queryTimeoutMs)
      channel.port1.onmessage = event => finish(resolve, event?.data || null)
      try { controller.postMessage({ type: 'GYM_SHELL_INFO' }, [channel.port2]) } catch (error) { finish(reject, error) }
    })
  }

  const compareShell = async () => {
    const info = await queryShell()
    if (!info?.entry) return false
    const current = currentEntry()
    const served = entryUrl(info.entry, doc)
    const styles = [...(doc?.querySelectorAll?.('link[rel="stylesheet"][href]') || [])]
      .map(link => entryUrl(link.href, doc)).filter(Boolean).sort()
    const servedStyles = Array.isArray(info.styles) ? info.styles.map(ref => entryUrl(ref, doc)).filter(Boolean).sort() : null
    return Boolean(current && served && (current !== served || servedStyles && JSON.stringify(styles) !== JSON.stringify(servedStyles)))
  }

  const waitForInstallation = async (worker) => {
    if (!worker) return
    if (worker.state === 'activated') return
    if (worker.state === 'redundant') throw new Error('service worker installation failed')
    await new Promise((resolve, reject) => {
      let timer
      const finish = (error = null) => {
        clearTimer(timer)
        worker.removeEventListener?.('statechange', changed)
        if (error) reject(error); else resolve()
      }
      const changed = () => {
        if (worker.state === 'activated') finish()
        else if (worker.state === 'redundant') finish(new Error('service worker installation failed'))
      }
      worker.addEventListener?.('statechange', changed)
      timer = setTimer(() => finish(Object.assign(new Error('service worker activation timed out'), { name: 'TimeoutError' })), activationTimeoutMs)
      changed()
    })
  }

  const queryAfterLifecycle = () => {
    if (disposed || !registration?.active || !nav?.serviceWorker?.controller) return
    if (currentCheck) { lifecycleQueryPending = true; return }
    check({ manual: true, update: false }).catch(() => {})
  }

  const check = ({ manual = false, update = true } = {}) => {
    if (disposed) return Promise.resolve(snapshot)
    if (!manual && now() - lastAutoCheck < autoThrottleMs) return Promise.resolve(snapshot)
    if (currentCheck) return currentCheck
    if (!manual) lastAutoCheck = now()
    publish({ checking: true, error: null })
    // Defer the body until currentCheck is assigned: even an immediate offline failure
    // must clear it in finally so the next online check can actually retry.
    currentCheck = Promise.resolve().then(async () => {
      try {
        if (!registration) {
          publish({ checking: false, error: 'unsupported' })
          return snapshot
        }
        if (update) {
          if (nav?.onLine === false) throw new TypeError('offline')
          await registration.update()
          if (manual) await waitForInstallation(registration.installing)
        }
        const available = await compareShell()
        publish({ checking: false, available, error: null })
      } catch (error) {
        publish({ checking: false, error: errorName(error) })
      } finally {
        currentCheck = null
        if (lifecycleQueryPending) {
          lifecycleQueryPending = false
          queueMicrotask(queryAfterLifecycle)
        }
      }
      return snapshot
    })
    return currentCheck
  }

  const bindRegistration = reg => {
    registration = reg
    const bindWorker = worker => {
      if (!worker) return
      if (boundWorkers.has(worker)) return
      boundWorkers.add(worker)
      const stateChanged = () => {
        if (worker.state === 'activated') queryAfterLifecycle()
        if (worker.state === 'redundant') publish({ checking: false, error: 'failed' })
      }
      on(worker, 'statechange', stateChanged)
    }
    const updateFound = () => bindWorker(registration?.installing)
    bindWorker(reg.installing)
    on(reg, 'updatefound', updateFound)
    on(nav?.serviceWorker, 'controllerchange', queryAfterLifecycle)
  }

  const start = async () => {
    if (disposed) return snapshot
    if (startPromise) return startPromise
    if (!nav?.serviceWorker) {
      publish({ checking: false, error: 'unsupported' })
      return snapshot
    }
    startPromise = (async () => {
      try {
        const reg = await nav.serviceWorker.register('sw.js', { updateViaCache: 'none' })
        bindRegistration(reg)
        await check({ manual: false })
      } catch (error) {
        publish({ checking: false, available: false, error: errorName(error) })
        startPromise = null // A later manual check or resume may retry a failed registration.
      }
      return snapshot
    })()
    return startPromise
  }

  const resume = () => { (registration ? check({ manual: false }) : start()).catch(() => {}) }
  on(win, 'focus', resume)
  on(win, 'online', resume)
  on(doc, 'visibilitychange', () => { if (doc.visibilityState === 'visible') resume() })

  return {
    start,
    check,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      subscribers.add(listener)
      return () => subscribers.delete(listener)
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const unbind of bound.splice(0)) unbind()
      subscribers.clear()
    }
  }
}

let singleton = null

export function startLocalPwaUpdates(options) {
  if (!singleton) singleton = createLocalPwaUpdater(options)
  singleton.start().catch(() => {})
  return singleton
}

export function getLocalPwaUpdateSnapshot() {
  return singleton?.getSnapshot() ?? INITIAL_SNAPSHOT
}

export function subscribeLocalPwaUpdate(listener) {
  if (!singleton) startLocalPwaUpdates()
  return singleton.subscribe(listener)
}

export function checkLocalPwaUpdate(options) {
  if (!singleton) startLocalPwaUpdates()
  const updater = singleton
  return updater.start().then(() => updater.check({ ...options, manual: true }))
}

export const __resetLocalPwaUpdatesForTests = () => {
  singleton?.dispose()
  singleton = null
}
