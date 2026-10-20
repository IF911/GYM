// Password-protected, local-only plan links. The fragment is never sent in an HTTP request.

const FORMAT_VERSION = '1'
const ROUTE = '/import-plan/'
const MAX_PAYLOAD_LENGTH = 64 * 1024
const MAX_PLAINTEXT_BYTES = 512 * 1024
const PBKDF2_ITERATIONS = 210_000
const SALT_BYTES = 16
const IV_BYTES = 12

export class PlanLinkError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'PlanLinkError'
    this.code = code
  }
}

function unsupported() {
  return new PlanLinkError('unsupported', 'Этот браузер не поддерживает безопасные ссылки планов.')
}

function invalid() {
  return new PlanLinkError('invalid', 'Ссылка на план недействительна или пароль не подходит.')
}

function getCrypto() {
  const c = globalThis.crypto
  if (!c?.subtle || typeof c.getRandomValues !== 'function') throw unsupported()
  return c
}

function ensureCompression(kind) {
  const Ctor = globalThis[kind]
  if (typeof Ctor !== 'function') throw unsupported()
  return Ctor
}

async function gzip(bytes) {
  const Ctor = ensureCompression('CompressionStream')
  const stream = new Blob([bytes]).stream().pipeThrough(new Ctor('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function gunzip(bytes) {
  const Ctor = ensureCompression('DecompressionStream')
  const stream = new Blob([bytes]).stream().pipeThrough(new Ctor('gzip'))
  const reader = stream.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_PLAINTEXT_BYTES) {
        await reader.cancel()
        throw invalid()
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function encodeBase64Url(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodeBase64Url(value) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalid()
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4)
  try {
    const binary = atob(padded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    throw invalid()
  }
}

function validateJsonValue(value, depth = 0) {
  if (depth > 100) throw invalid()
  if (value === null) return
  if (Array.isArray(value)) {
    for (const item of value) validateJsonValue(item, depth + 1)
    return
  }
  if (typeof value === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype) throw invalid()
    for (const [key, child] of Object.entries(value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') throw invalid()
      validateJsonValue(child, depth + 1)
    }
    return
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw invalid()
  if (!['string', 'number', 'boolean'].includes(typeof value)) throw invalid()
}

function parsePayload(payload) {
  if (typeof payload !== 'string' || payload.length === 0 || payload.length > MAX_PAYLOAD_LENGTH) throw invalid()
  const parts = payload.split('.')
  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) throw invalid()
  const salt = decodeBase64Url(parts[1])
  const iv = decodeBase64Url(parts[2])
  const ciphertext = decodeBase64Url(parts[3])
  if (salt.length !== SALT_BYTES || iv.length !== IV_BYTES || ciphertext.length < 17) throw invalid()
  return { salt, iv, ciphertext }
}

/** Return the encrypted payload from a complete URL or a hash such as #/import-plan/.... */
export function extractPlanLinkPayload(input) {
  if (typeof input !== 'string' || input.length === 0 || input.length > MAX_PAYLOAD_LENGTH + 4096) return null
  let hash = input
  try {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(input)) hash = new URL(input).hash
  } catch {
    return null
  }
  if (!hash.startsWith('#')) return null
  const route = hash.slice(1)
  if (!route.startsWith(ROUTE) || route.length === ROUTE.length) return null
  const payload = route.slice(ROUTE.length)
  if (payload.includes('/') || payload.includes('?') || payload.includes('#')) return null
  try {
    parsePayload(payload)
    return payload
  } catch {
    return null
  }
}

export const payloadFromPlanLink = extractPlanLinkPayload

export async function encodePlanLink(bundle, password, baseUrl) {
  if (typeof password !== 'string' || password.length === 0) throw invalid()
  let plain
  try {
    validateJsonValue(bundle)
    plain = new TextEncoder().encode(JSON.stringify(bundle))
  } catch {
    throw invalid()
  }
  if (plain.byteLength > MAX_PLAINTEXT_BYTES) throw invalid()
  const c = getCrypto()
  const compressed = await gzip(plain)
  const salt = new Uint8Array(SALT_BYTES)
  const iv = new Uint8Array(IV_BYTES)
  c.getRandomValues(salt)
  c.getRandomValues(iv)
  const material = await c.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await c.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt'])
  const ciphertext = new Uint8Array(await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, compressed))
  const payload = [FORMAT_VERSION, encodeBase64Url(salt), encodeBase64Url(iv), encodeBase64Url(ciphertext)].join('.')
  if (payload.length > MAX_PAYLOAD_LENGTH) throw invalid()
  const rawBase = baseUrl || (typeof window !== 'undefined' ? window.location.href : '')
  if (!rawBase) throw invalid()
  let url
  try {
    url = new URL(rawBase)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw invalid()
  } catch (error) {
    if (error instanceof PlanLinkError) throw error
    throw invalid()
  }
  url.search = ''
  url.hash = `#${ROUTE}${payload}`
  return url.toString()
}

export async function decodePlanLink(payload, password) {
  if (typeof password !== 'string' || password.length === 0) throw invalid()
  const { salt, iv, ciphertext } = parsePayload(payload)
  const c = getCrypto()
  try {
    const material = await c.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
    const key = await c.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt'])
    const compressed = new Uint8Array(await c.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext))
    const plain = await gunzip(compressed)
    const value = JSON.parse(new TextDecoder().decode(plain))
    validateJsonValue(value)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid()
    return value
  } catch (error) {
    if (error instanceof PlanLinkError && error.code === 'unsupported') throw error
    throw invalid()
  }
}

export const PLAN_LINK_LIMITS = Object.freeze({ maxPayloadLength: MAX_PAYLOAD_LENGTH, maxPlaintextBytes: MAX_PLAINTEXT_BYTES })
