// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.hoisted(() => { vi.stubEnv('VITE_LOCAL', '1') })
import { useStore, DEF } from './useStore.js'
import { api, apiBlob, apiUpload, beacon, pairRedeem } from '../lib/api.js'
const clone = v => JSON.parse(JSON.stringify(v))
beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('unexpected network') }))
  useStore.setState({ S: clone(DEF), user: null, ready: false, config: null })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('local PWA diary', () => {
  it('boots empty without an account, demo history, or any server request', async () => {
    localStorage.setItem('gym_user', JSON.stringify({ id: 'old-account' }))
    await useStore.getState().boot()
    const st = useStore.getState()
    expect(st.ready).toBe(true)
    expect(st.user).toBeNull()
    expect(st.isGuest()).toBe(true)
    expect(st.S.workouts).toEqual([])
    expect(localStorage.getItem('gym_demo_seeded_v1')).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
    expect((await st.refreshConfig()).coach).toBeNull()
    st.setUser({ id: 'accidental-account' })
    expect(useStore.getState().user).toBeNull()
  })
  it('persists the diary and restores workouts and routines from a JSON backup', async () => {
    await useStore.getState().boot()
    const workout = { id: 'local-workout', d: '2026-10-20', start: 1, end: 2, entries: [] }
    useStore.getState().update(s => {
      s.workouts.push(workout)
      s.bodyweight.push({ d: '2026-10-20', v: 75 })
    })
    const backup = JSON.parse(JSON.stringify(useStore.getState().S))
    expect(JSON.parse(localStorage.getItem('gym_state_v1')).workouts).toEqual(backup.workouts)
    await useStore.getState().resetEverything()
    expect(useStore.getState().S.workouts).toEqual([])
    await useStore.getState().importBackup(backup)
    expect(useStore.getState().S.workouts).toEqual(backup.workouts)
    expect(useStore.getState().S.bodyweight).toEqual(backup.bodyweight)
    vi.resetModules()
    const reloaded = (await import('./useStore.js')).useStore
    await reloaded.getState().boot()
    expect(reloaded.getState().S.workouts).toEqual(backup.workouts)
    expect(reloaded.getState().user).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('refuses API, media uploads and pairing before touching a transport', async () => {
    await expect(api('/api/data', { method: 'PUT', body: 'private' })).rejects.toMatchObject({ code: 'local-only' })
    await expect(apiBlob('/api/media/hash')).rejects.toMatchObject({ code: 'local-only' })
    await expect(apiUpload('/api/media/hash', new Blob(['private']), 'image/png')).rejects.toMatchObject({ code: 'local-only' })
    await expect(pairRedeem('https://example.com', '123456')).rejects.toMatchObject({ code: 'local-only' })
    expect(beacon('/api/activity', {})).toBe(false)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('ignores account handovers from other browser tabs', async () => {
    await useStore.getState().boot()
    useStore.getState().update(s => { s.bodyweight.push({ d: '2026-10-20', v: 75 }) })
    localStorage.setItem('gym_owner', 'another-account')
    localStorage.setItem('gym_user', JSON.stringify({ id: 'another-account' }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'gym_owner', newValue: 'another-account' }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'gym_sync', newValue: JSON.stringify({ rev: 99 }) }))
    expect(useStore.getState().user).toBeNull()
    expect(useStore.getState().S.bodyweight).toEqual([{ d: '2026-10-20', v: 75 }])
    expect(fetch).not.toHaveBeenCalled()
  })
})
