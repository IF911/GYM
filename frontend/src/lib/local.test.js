import { describe, expect, it, vi } from 'vitest'
import { installLocalPrivacy, localRequestAllowed, requestLocalPersistence } from './local.js'

const base = 'https://if911.github.io/GYM/#/workout'
describe('device-only network boundary', () => {
  it('allows static files from this app and in-memory media', () => {
    for (const url of ['./assets/app.js', 'exercise-media/clip/0001.mp4', 'blob:https://if911.github.io/a', 'data:image/png;base64,AA==']) {
      expect(localRequestAllowed(url, {}, base)).toBe(true)
    }
  })
  it('refuses uploads, APIs, other origins, other apps and query strings', () => {
    for (const url of ['https://example.com/asset.json', '/api/data', '/GYM/api/me', '/other-app/file', './asset?workout=private']) {
      expect(localRequestAllowed(url, {}, base)).toBe(false)
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(localRequestAllowed('./data.json', { method }, base)).toBe(false)
    expect(localRequestAllowed(new Request('https://if911.github.io/GYM/api/data'), {}, base)).toBe(false)
  })
  it('rejects before fetch and omits cookies and referrers on static downloads', async () => {
    const fetch = vi.fn().mockResolvedValue('asset')
    const target = { fetch, location: { href: base } }
    installLocalPrivacy(target)
    await expect(target.fetch('https://example.com/upload', { method: 'POST', body: 'private workout' })).rejects.toThrow('disabled')
    expect(fetch).not.toHaveBeenCalled()
    await expect(target.fetch('./assets/app.js')).resolves.toBe('asset')
    expect(fetch).toHaveBeenCalledWith('./assets/app.js', { credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' })
  })
  it('requests persistence without making support or permission mandatory', async () => {
    expect(await requestLocalPersistence({ persist: async () => true })).toBe(true)
    expect(await requestLocalPersistence({ persist: async () => { throw Error('unavailable') } })).toBe(false)
    expect(await requestLocalPersistence({})).toBe(false)
  })
})
