import { describe, expect, it } from 'vitest'
import { decodePlanLink, encodePlanLink, extractPlanLinkPayload, PLAN_LINK_LIMITS } from './plan-link.js'

const plan = {
  opengym_plan: 1,
  name: 'Силовая · ноги 🏋️',
  routines: [{ id: 'r1', name: 'День А', ex: [{ id: '0025', sets: 3, reps: 8 }] }],
  week: { 1: 'r1' },
  customEx: []
}

const b64url = bytes => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

describe('plan link codec', () => {
  it('round-trips a Unicode plan and extracts a pasted URL or hash', async () => {
    const url = await encodePlanLink(plan, 'пароль 🔐', 'https://example.test/GYM/?old=1')
    expect(url).toContain('#/import-plan/')
    const payload = extractPlanLinkPayload(url)
    expect(payload).toBeTruthy()
    expect(extractPlanLinkPayload(new URL(url).hash)).toBe(payload)
    expect(await decodePlanLink(payload, 'пароль 🔐')).toEqual(plan)
  })

  it('does not reveal whether a password is wrong or the payload was tampered with', async () => {
    const payload = extractPlanLinkPayload(await encodePlanLink(plan, 'secret', 'https://example.test/'))
    await expect(decodePlanLink(payload, 'wrong')).rejects.toMatchObject({ code: 'invalid' })
    const parts = payload.split('.')
    const first = parts[3][0]
    parts[3] = (first === 'A' ? 'B' : 'A') + parts[3].slice(1)
    const tampered = parts.join('.')
    await expect(decodePlanLink(tampered, 'secret')).rejects.toMatchObject({ code: 'invalid' })
  })

  it('rejects malformed routes and dangerous JSON keys', async () => {
    expect(extractPlanLinkPayload('https://example.test/#/import-plan/not-a-payload')).toBeNull()
    expect(extractPlanLinkPayload('#/import-plan/a/b')).toBeNull()
    const malicious = JSON.parse('{"opengym_plan":1,"__proto__":{"polluted":true}}')
    await expect(encodePlanLink(malicious, 'secret', 'https://example.test/')).rejects.toMatchObject({ code: 'invalid' })
    expect(extractPlanLinkPayload('#/import-plan/1.a.b.c')).toBeNull()
    expect(extractPlanLinkPayload('https://user:pass@example.test/#/import-plan/1.a.b.c')).toBeNull()
    await expect(encodePlanLink(plan, 'secret', 'https://user:pass@example.test/')).rejects.toMatchObject({ code: 'invalid' })
  })

  it('enforces the documented plaintext bound', async () => {
    expect(PLAN_LINK_LIMITS.maxPayloadLength).toBe(64 * 1024)
    expect(PLAN_LINK_LIMITS.maxPlaintextBytes).toBe(512 * 1024)
    const oversized = { opengym_plan: 1, text: 'x'.repeat(512 * 1024) }
    await expect(encodePlanLink(oversized, 'secret', 'https://example.test/')).rejects.toMatchObject({ code: 'invalid' })
  })

  it('bounds decompression of an encrypted gzip bomb', async () => {
    const salt = new Uint8Array(16).fill(7)
    const iv = new Uint8Array(12).fill(8)
    const raw = new TextEncoder().encode(JSON.stringify({ opengym_plan: 1, text: 'x'.repeat(600 * 1024) }))
    const compressed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer())
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode('secret'), 'PBKDF2', false, ['deriveKey'])
    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 210000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
    const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed))
    const payload = ['1', b64url(salt), b64url(iv), b64url(encrypted)].join('.')
    await expect(decodePlanLink(payload, 'secret')).rejects.toMatchObject({ code: 'invalid' })
  })

  it('rejects excessive JSON depth and reports unsupported browser APIs', async () => {
    const deep = { opengym_plan: 1 }
    let cursor = deep
    for (let i = 0; i < 101; i++) {
      cursor.child = {}
      cursor = cursor.child
    }
    await expect(encodePlanLink(deep, 'secret', 'https://example.test/')).rejects.toMatchObject({ code: 'invalid' })
    const original = globalThis.CompressionStream
    try {
      globalThis.CompressionStream = undefined
      await expect(encodePlanLink(plan, 'secret', 'https://example.test/')).rejects.toMatchObject({ code: 'unsupported' })
    } finally {
      globalThis.CompressionStream = original
    }
  })

  it('uses a fresh random salt for every link', async () => {
    const one = extractPlanLinkPayload(await encodePlanLink(plan, 'secret', 'https://example.test/'))
    const two = extractPlanLinkPayload(await encodePlanLink(plan, 'secret', 'https://example.test/'))
    expect(one.split('.')[1]).not.toBe(two.split('.')[1])
  })
})
