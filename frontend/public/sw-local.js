/* GYM local PWA worker. It serves only same-origin static files; workout data and APIs stay in the page. */
const BUILD = '__BUILD__'
const LAZY = '__LAZY__'
const SCOPE = new URL('./', self.location.href).pathname
const SCOPE_KEY = encodeURIComponent(SCOPE)
const CACHE = `gym-local-${SCOPE_KEY}-${BUILD}`
const MEDIA = `gym-local-${SCOPE_KEY}-media`
const LEGACY_MEDIA = 'opengym-media-v1'
const API = new URL('api/', self.location.href).pathname

const lazyAssets = () => {
  try { const files = JSON.parse(LAZY); return Array.isArray(files) ? files : [] } catch { return [] }
}
const localUrl = value => {
  try {
    const url = new URL(value, self.location.href)
    if (url.protocol === 'blob:' || url.protocol === 'data:') return url
    return url.origin === self.location.origin && url.pathname.startsWith(SCOPE) && !url.search && !url.pathname.startsWith(API) ? url : null
  } catch { return null }
}
const cacheable = response => response && response.ok && !response.redirected && !/text\/html/i.test(response.headers.get('content-type') || '')
const mediaPath = url => url.pathname.startsWith(`${SCOPE}exercise-media/`)
const rangeOf = request => request.headers?.get?.('range') || ''
async function slice(response, range) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  const body = await response.arrayBuffer()
  const size = body.byteLength
  let start = match && match[1] !== '' ? Number(match[1]) : NaN
  let end = match && match[2] !== '' ? Number(match[2]) : size - 1
  if (match && match[1] === '' && match[2] !== '') { start = Math.max(0, size - Number(match[2])); end = size - 1 }
  const type = response.headers.get('content-type') || 'application/octet-stream'
  if (!match || !Number.isFinite(start)) return new Response(body, { status: 200, headers: { 'content-type': type, 'content-length': String(size), 'accept-ranges': 'bytes' } })
  if (start >= size || end < start) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } })
  end = Math.min(end, size - 1)
  return new Response(body.slice(start, end + 1), { status: 206, headers: {
    'content-type': type, 'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes'
  } })
}
const realMedia = response => cacheable(response)
async function mediaFetch(request, url) {
  const range = rangeOf(request)
  const cache = await caches.open(MEDIA)
  let hit = await cache.match(url.href)
  if (!hit && mediaPath(url)) hit = await (await caches.open(LEGACY_MEDIA)).match(url.href)
  if (hit) {
    if (mediaPath(url)) await cache.put(url.href, hit.clone()).catch(() => {})
    return range ? slice(hit, range) : hit
  }
  const response = await fetch(url.href, { redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!realMedia(response)) return response
  const copy = response.clone()
  await cache.put(url.href, copy).catch(() => {})
  return range ? slice(response, range) : response
}

async function installShell() {
  const cache = await caches.open(CACHE)
  const index = await fetch('./index.html', { cache: 'no-cache', redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!index.ok || index.redirected) throw new Error(`GYM shell: index.html ${index.status}`)
  const html = await index.text()
  const refs = [...new Set([...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1]))]
    .filter(ref => /\.(?:js|css|png|svg|webmanifest|json)(?:\?|$)/.test(ref))
  const files = [...new Set(['./index.html', ...refs, ...lazyAssets()])]
  await Promise.all(files.map(async ref => {
    const url = localUrl(ref)
    if (!url) return
    const response = ref === './index.html' ? new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }) : await fetch(url, { cache: 'no-cache', redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' })
    if (ref === './index.html' || /\.(?:js|css)(?:\?|$)/.test(ref)) {
      if (!cacheable(response) && ref !== './index.html') throw new Error(`GYM shell: ${ref}`)
      await cache.put(url.href, response)
    } else if (cacheable(response)) {
      await cache.put(url.href, response)
    }
  }))
}

self.addEventListener('install', event => event.waitUntil(installShell().then(() => self.skipWaiting())))
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys()
  await Promise.all(keys.filter(key => key.startsWith(`gym-local-${SCOPE_KEY}-`) && key !== CACHE && key !== MEDIA).map(key => caches.delete(key)))
  await self.clients.claim()
})()))

// The current page may still run an older bundle after claim(). Report only the cached
// shell's public entry URL so it can offer a deliberate reload, including on first claim.
self.addEventListener('message', event => {
  if (event.data?.type !== 'GYM_SHELL_INFO' || !event.ports?.[0] || typeof event.source?.url !== 'string' || !localUrl(event.source.url)) return
  event.waitUntil((async () => {
    const index = await (await caches.open(CACHE)).match(new URL('./index.html', self.location.href).href)
    const html = index ? await index.text() : ''
    const ref = html.match(/<script\s+[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/i)?.[1]
    const entry = ref && localUrl(ref)
    const styles = [...html.matchAll(/<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)]
      .map(match => localUrl(match[1])?.href).filter(Boolean).sort()
    event.ports[0].postMessage({ entry: entry?.href || null, styles })
  })())
})

self.addEventListener('fetch', event => {
  const request = event.request
  const isLocal = localUrl(request.url)
  if (request.method !== 'GET' || !isLocal) {
    event.respondWith(Response.error())
    return
  }
  const url = isLocal
  if (url.protocol === 'blob:' || url.protocol === 'data:') return
  if (mediaPath(url)) {
    event.respondWith(mediaFetch(request, url).catch(() => Response.error()))
    return
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const key = request.mode === 'navigate' ? new URL('./index.html', self.location.href).href : url.href
    const hit = await cache.match(key)
    if (hit) return hit
    const response = await fetch(request, { redirect: 'error', credentials: 'omit', referrerPolicy: 'no-referrer' })
    if (cacheable(response)) await cache.put(url.href, response.clone()).catch(() => {})
    return response
  })().catch(async () => (await caches.open(CACHE)).match(url.href) || Response.error()))
})
