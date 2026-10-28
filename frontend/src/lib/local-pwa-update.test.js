import { describe, expect, it, vi } from 'vitest'
import { createLocalPwaUpdater } from './local-pwa-update.js'

class Target {
  constructor() { this.listeners = new Map() }
  addEventListener(type, fn) { const set = this.listeners.get(type) || new Set(); set.add(fn); this.listeners.set(type, set) }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn) }
  emit(type) { for (const fn of this.listeners.get(type) || []) fn() }
}

class Worker extends Target {
  constructor(state = 'activated') { super(); this.state = state }
  become(state) { this.state = state; this.emit('statechange') }
}

function browser({ entry = 'https://gym.example/GYM/assets/index-new.js', styles, controller = true, register = vi.fn() } = {}) {
  const win = new Target()
  const doc = new Target()
  doc.visibilityState = 'visible'
  doc.baseURI = 'https://gym.example/GYM/'
  doc.querySelector = () => ({ src: 'https://gym.example/GYM/assets/index-old.js' })
  const sw = new Target()
  const active = new Worker()
  const installing = new Worker('installed')
  const registration = Object.assign(new Target(), { active, installing: null, update: vi.fn(async () => {}) })
  let channel
  class MessageChannelMock {
    constructor() {
      channel = { port1: { close: vi.fn() }, port2: { close: vi.fn() } }
      return channel
    }
  }
  const post = vi.fn(() => channel?.port1.onmessage?.({ data: { entry, styles } }))
  sw.controller = controller ? { postMessage: post } : null
  if (!register.getMockImplementation?.()) register.mockResolvedValue(registration)
  return { navigator: { serviceWorker: Object.assign(sw, { register }) }, window: win, document: doc, MessageChannel: MessageChannelMock, registration, active, installing, post }
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('local PWA updater', () => {
  it('signals a stale shell after the initial claim and never reloads', async () => {
    const b = browser()
    const updater = createLocalPwaUpdater(b)
    await updater.start()
    expect(updater.getSnapshot()).toEqual({ checking: false, available: true, error: null })
    expect(b.registration.update).toHaveBeenCalled()
    expect(updater.getSnapshot()).toBe(updater.getSnapshot())
  })

  it('does not signal an update when the first controller serves the same entry', async () => {
    const b = browser({ entry: 'https://gym.example/GYM/assets/index-old.js' })
    const updater = createLocalPwaUpdater(b)
    await updater.start()
    expect(updater.getSnapshot()).toEqual({ checking: false, available: false, error: null })
  })

  it('also offers updates when only the stylesheet changed', async () => {
    const b = browser({ entry: 'https://gym.example/GYM/assets/index-old.js', styles: ['https://gym.example/GYM/assets/new.css'] })
    b.document.querySelectorAll = () => [{ href: 'https://gym.example/GYM/assets/old.css' }]
    const updater = createLocalPwaUpdater(b)
    await updater.start()
    expect(updater.getSnapshot().available).toBe(true)
  })

  it('ignores styles loaded by seasonal themes or screens after boot, including on later checks', async () => {
    const entry = 'https://gym.example/GYM/assets/index-old.js'
    const css = 'https://gym.example/GYM/assets/old.css'
    const b = browser({ entry, styles: [css] })
    const links = [{ href: css }]
    b.document.querySelectorAll = () => links
    const updater = createLocalPwaUpdater(b)
    // A lazy theme can load while registration/update is still pending. It belongs to
    // this installed build and must not turn a successful check into a reload loop.
    b.registration.update.mockImplementationOnce(async () => {
      links.push({ href: 'https://gym.example/GYM/assets/halloween-theme.css' })
    })
    await updater.start()
    expect(updater.getSnapshot()).toEqual({ checking: false, available: false, error: null })

    links.push({ href: 'https://gym.example/GYM/assets/leaflet-map.css' })
    await updater.check({ manual: true })
    await updater.check({ manual: true })
    expect(updater.getSnapshot()).toEqual({ checking: false, available: false, error: null })
  })

  it('sets checking immediately for a manual check and waits for activation', async () => {
    const b = browser()
    b.registration.update.mockImplementationOnce(async () => { b.registration.installing = b.installing })
    const updater = createLocalPwaUpdater(b)
    await updater.start()
    b.installing.become('installing')
    const pending = updater.check({ manual: true })
    expect(updater.getSnapshot().checking).toBe(true)
    b.installing.become('activated')
    await pending
    expect(updater.getSnapshot().checking).toBe(false)
  })

  it('throttles resume checks but manual checks bypass the throttle', async () => {
    const b = browser()
    let clock = 1000
    const updater = createLocalPwaUpdater({ ...b, now: () => clock, autoThrottleMs: 60_000 })
    await updater.start()
    const calls = b.registration.update.mock.calls.length
    b.window.emit('focus')
    await flush()
    expect(b.registration.update).toHaveBeenCalledTimes(calls)
    clock += 60_001
    b.window.emit('focus')
    await flush()
    expect(b.registration.update).toHaveBeenCalledTimes(calls + 1)
    await new Promise(resolve => setTimeout(resolve, 10))
    await updater.check({ manual: true })
    expect(b.registration.update).toHaveBeenCalledTimes(calls + 2)
  })

  it('reports rejected registration and missing/offline worker gracefully', async () => {
    const rejected = browser({ register: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) })
    const a = createLocalPwaUpdater(rejected)
    await a.start()
    expect(a.getSnapshot().error).toBe('offline')
    const missing = createLocalPwaUpdater({ window: new Target(), document: Object.assign(new Target(), { visibilityState: 'hidden' }), navigator: {} })
    await missing.start()
    expect(missing.getSnapshot()).toEqual({ checking: false, available: false, error: 'unsupported' })
    await missing.check({ manual: true })
    expect(missing.getSnapshot().checking).toBe(false)
  })

  it('keeps an already detected update through a failed later check', async () => {
    const b = browser()
    const updater = createLocalPwaUpdater(b)
    await updater.start()
    b.registration.update.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await updater.check({ manual: true })
    expect(updater.getSnapshot()).toEqual({ checking: false, available: true, error: 'offline' })
  })

  it('reports a disconnected phone without a network check and recovers when online', async () => {
    const b = browser({ entry: 'https://gym.example/GYM/assets/index-old.js' })
    const updater = createLocalPwaUpdater(b)
    await updater.start()
    const calls = b.registration.update.mock.calls.length
    b.navigator.onLine = false
    await updater.check({ manual: true })
    expect(updater.getSnapshot().error).toBe('offline')
    expect(b.registration.update).toHaveBeenCalledTimes(calls)
    b.navigator.onLine = true
    await updater.check({ manual: true })
    expect(updater.getSnapshot()).toEqual({ checking: false, available: false, error: null })
    expect(b.registration.update).toHaveBeenCalledTimes(calls + 1)
  })

  it('queues the lifecycle query when controllerchange races an active check', async () => {
    const b = browser()
    const updater = createLocalPwaUpdater(b)
    await updater.start()
    let resolveUpdate
    b.registration.update.mockImplementationOnce(() => new Promise(resolve => { resolveUpdate = resolve }))
    const pending = updater.check({ manual: true })
    await Promise.resolve()
    b.navigator.serviceWorker.emit('controllerchange')
    resolveUpdate()
    await pending
    await flush()
    expect(b.post).toHaveBeenCalledTimes(3)
  })

  it('times out a worker query and cleans up listeners without duplicates', async () => {
    const b = browser()
    b.post.mockImplementation(() => {})
    const updater = createLocalPwaUpdater({ ...b, queryTimeoutMs: 5 })
    await updater.start()
    expect(updater.getSnapshot().error).toBe('timeout')
    updater.dispose()
    b.window.emit('focus')
    expect(b.registration.update).toHaveBeenCalledTimes(1)
  })
})
