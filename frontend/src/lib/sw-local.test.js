// @vitest-environment node
/* The local worker must keep the app offline without becoming a proxy for API, other apps or
 * external requests. Media clips are stored whole and returned as 206 ranges for Safari. */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const source = readFileSync(fileURLToPath(new URL('../../public/sw-local.js', import.meta.url)), 'utf8')
const ORIGIN = 'https://gym.example'

class Cache {
  constructor() { this.entries = new Map() }
  key(request) { return typeof request === 'string' ? new URL(request, ORIGIN + '/').href : request.url }
  async match(request) { const hit = this.entries.get(this.key(request)); return hit?.clone() }
  async put(request, response) { this.entries.set(this.key(request), response.clone()) }
}

function worker({ fetchImpl, legacy } = {}) {
  const listeners = {}
  const all = new Map()
  if (legacy) all.set('opengym-media-v1', legacy)
  const caches = {
    open: async name => { if (!all.has(name)) all.set(name, new Cache()); return all.get(name) },
    keys: async () => [...all.keys()],
    delete: async name => all.delete(name)
  }
  const context = {
    self: { location: new URL(ORIGIN + '/GYM/sw.js'), addEventListener: (type, fn) => { listeners[type] = fn }, skipWaiting: () => {}, clients: { claim: async () => {} } },
    caches, fetch: fetchImpl || (async () => new Response('network', { headers: { 'content-type': 'text/plain' } })),
    URL, Response, Headers, console
  }
  vm.runInNewContext(source, context)
  return { listeners, caches, all }
}

function event(path, { method = 'GET', headers = {}, mode = 'cors' } = {}) {
  let response
  return {
    request: { url: ORIGIN + path, method, headers: new Headers(headers), mode },
    respondWith: promise => { response = promise },
    get response() { return response }
  }
}

describe('local service worker', () => {
  it('reports the cached shell entry to this installation without sharing any diary data', async () => {
    const w = worker()
    const cache = await w.caches.open('gym-local-%2FGYM%2F-__BUILD__')
    await cache.put(ORIGIN + '/GYM/index.html', new Response('<script type="module" crossorigin src="./assets/index-new.js"></script><link rel="stylesheet" href="./assets/index-new.css">'))
    let done, info
    w.listeners.message({ data: { type: 'GYM_SHELL_INFO' }, source: { url: ORIGIN + '/GYM/#/plan' },
      ports: [{ postMessage: value => { info = value } }], waitUntil: task => { done = task } })
    await done
    expect(info).toEqual({ entry: ORIGIN + '/GYM/assets/index-new.js', styles: [ORIGIN + '/GYM/assets/index-new.css'] })
  })

  it('ignores shell-info requests outside this installation or without a reply port', () => {
    const w = worker()
    const reply = () => { throw new Error('unexpected shell reply') }
    for (const source of ['https://other.example/GYM/', ORIGIN + '/other-app/']) {
      w.listeners.message({ data: { type: 'GYM_SHELL_INFO' }, source: { url: source }, ports: [{ postMessage: reply }] })
    }
    w.listeners.message({ data: { type: 'GYM_SHELL_INFO' }, source: { url: ORIGIN + '/GYM/' }, ports: [] })
    w.listeners.message({ data: { type: 'GYM_SHELL_INFO' }, ports: [{ postMessage: reply }] })
  })

  it('opens the installed app at its directory URL without a network', async () => {
    const w = worker({ fetchImpl: async () => { throw new TypeError('offline') } })
    const cache = await w.caches.open('gym-local-%2FGYM%2F-__BUILD__')
    await cache.put(ORIGIN + '/GYM/index.html', new Response('<html>offline app</html>'))
    const request = event('/GYM/', { mode: 'navigate' })
    w.listeners.fetch(request)
    expect(await (await request.response).text()).toBe('<html>offline app</html>')
  })

  it('keeps exercise media across updates and leaves other apps alone', async () => {
    const w = worker()
    const prefix = 'gym-local-%2FGYM%2F-'
    for (const key of [prefix + 'old-build', prefix + 'media', 'gym-local-%2Fother%2F-old']) await w.caches.open(key)
    let done
    w.listeners.activate({ waitUntil: task => { done = task } })
    await done
    expect(await w.caches.keys()).toEqual([prefix + 'media', 'gym-local-%2Fother%2F-old'])
  })
  it('blocks API, external, other-scope and non-GET requests', async () => {
    const w = worker()
    for (const request of [
      event('/GYM/api/state'),
      Object.assign(event('/GYM/'), { request: { url: 'https://other.example/app.js', method: 'GET', headers: new Headers() } }),
      event('/other-app/asset.js'),
      event('/GYM/api/state', { method: 'POST' })
    ]) {
      w.listeners.fetch(request)
      expect((await request.response).type).toBe('error')
    }
  })

  it('serves same-scope static files from its cache when offline', async () => {
    let online = true
    const w = worker({ fetchImpl: async () => {
      if (!online) throw new TypeError('offline')
      return new Response('cached static file', { headers: { 'content-type': 'text/javascript' } })
    } })
    const first = event('/GYM/assets/main.js')
    w.listeners.fetch(first)
    expect(await (await first.response).text()).toBe('cached static file')
    online = false
    const second = event('/GYM/assets/main.js')
    w.listeners.fetch(second)
    expect(await (await second.response).text()).toBe('cached static file')
  })

  it('uses legacy media cache and returns a cached MP4 range as 206', async () => {
    const legacy = new Cache()
    await legacy.put(ORIGIN + '/GYM/exercise-media/clip/0001.mp4', new Response('0123456789', { status: 200, headers: { 'content-type': 'video/mp4' } }))
    const w = worker({ legacy, fetchImpl: async () => { throw new TypeError('offline') } })
    const request = event('/GYM/exercise-media/clip/0001.mp4', { headers: { range: 'bytes=2-5' } })
    w.listeners.fetch(request)
    const response = await request.response
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(await response.text()).toBe('2345')
  })
})
