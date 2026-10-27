// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.hoisted(() => { vi.stubEnv('VITE_LOCAL', '1') })
import { useStore, DEF } from './useStore.js'
import { api, apiBlob, apiUpload, beacon, pairRedeem } from '../lib/api.js'
import { dispatchHealthExport, healthWorkoutKey } from '../lib/health-shortcut.js'
import { estimateWorkoutCalories } from '../lib/workout-calories.js'
const clone = v => JSON.parse(JSON.stringify(v))
beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(() => { throw Error('unexpected network') }))
  useStore.setState({ S: clone(DEF), user: null, ready: false, config: null })
})
afterEach(() => { vi.unstubAllGlobals() })

describe('local PWA diary', () => {
  it('persists a pending Health hand-off before opening Shortcuts and keeps the diary local', async () => {
    await useStore.getState().boot()
    const w = { id: 'health-fixture', d: '2026-10-21', start: Date.UTC(2026, 9, 21, 10), end: Date.UTC(2026, 9, 21, 11), bw: 80,
      entries: [{ id: '0025', sets: [{ w: 60, r: 8, done: true }] }] }
    useStore.getState().update(s => { s.workouts = [w]; s.localHealth = { shortcutInstalled: true, shortcutRevision: 2 } })
    const openUrl = vi.fn(url => {
      expect(url).toMatch(/^shortcuts:\/\/run-shortcut\?/)
      expect(JSON.parse(localStorage.getItem('gym_state_v1')).localHealth.exports[healthWorkoutKey(w)].status).toBe('pending')
    })
    const st = useStore.getState()
    dispatchHealthExport({ workout: w, estimate: estimateWorkoutCalories(w), state: st.S, update: st.update, openUrl })
    expect(openUrl).toHaveBeenCalledOnce()
    expect(useStore.getState().S.workouts).toEqual([w])
    expect(fetch).not.toHaveBeenCalled()
  })
  it('defaults to Russian even on an English device and respects another explicitly selected locale', async () => {
    await useStore.getState().boot()
    expect(useStore.getState().S.lang).toBe('ru')
    expect(useStore.getState().config.default_lang).toBe('ru')
    localStorage.removeItem('gym_ru_default_v1')
    useStore.setState({ S: { ...clone(DEF), lang: 'de', langAuto: false } })
    await useStore.getState().boot()
    expect(useStore.getState().S.lang).toBe('de')
  })
  it('opens an existing English diary in Russian once, without changing its records', async () => {
    const old = clone(DEF)
    old.lang = 'en'; old.langAuto = false
    old.workouts = [{ id: 'kept-workout', d: '2026-10-20', entries: [] }]
    old.routines = [{ id: 'kept-routine', name: 'My routine', ex: [] }]
    old.bodyweight = [{ d: '2026-10-20', v: 75 }]
    useStore.setState({ S: old })
    await useStore.getState().boot()
    const current = useStore.getState().S
    expect(current.lang).toBe('ru')
    expect(current.langAuto).toBe(false)
    expect(current.enOnly.ru).toBe(false)
    expect(current.enParens.ru).toBe(false)
    for (const key of ['workouts', 'routines', 'bodyweight', 'week']) expect(current[key]).toEqual(old[key])
    useStore.getState().update(s => { s.lang = 'en' })
    await useStore.getState().boot()
    expect(useStore.getState().S.lang).toBe('en')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('preserves deliberately selected Russian name preferences', async () => {
    useStore.setState({ S: { ...clone(DEF), lang: 'ru', langAuto: false, enOnly: { ru: true }, enParens: { ru: true } } })
    await useStore.getState().boot()
    expect(useStore.getState().S.enOnly.ru).toBe(true)
    expect(useStore.getState().S.enParens.ru).toBe(true)
  })
  it('finishes boot when storage refuses access, without marking a failed save', async () => {
    const storage = globalThis.localStorage
    vi.stubGlobal('localStorage', {
      getItem: key => storage.getItem(key), removeItem: key => storage.removeItem(key),
      setItem: () => { throw new Error('storage refused') },
    })
    await expect(useStore.getState().boot()).resolves.toBeUndefined()
    expect(useStore.getState().ready).toBe(true)
    expect(storage.getItem('gym_ru_default_v1')).toBeNull()
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('storage blocked') },
      setItem: (key, value) => storage.setItem(key, value), removeItem: key => storage.removeItem(key),
    })
    await expect(useStore.getState().boot()).resolves.toBeUndefined()
    expect(useStore.getState().ready).toBe(true)
  })
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
      s.localEnergy = { weightKg: 80, byWorkout: { 'workout:local-workout': { intensity: 'moderate', weightKg: 80 } } }
      s.localHealth = { shortcutInstalled: true, shortcutRevision: 2, exports: { 'workout:local-workout': { status: 'pending', payload: { id: 'synthetic' } } } }
    })
    const backup = JSON.parse(JSON.stringify(useStore.getState().S))
    expect(JSON.parse(localStorage.getItem('gym_state_v1')).workouts).toEqual(backup.workouts)
    await useStore.getState().resetEverything()
    expect(useStore.getState().S.workouts).toEqual([])
    await useStore.getState().importBackup(backup)
    expect(useStore.getState().S.workouts).toEqual(backup.workouts)
    expect(useStore.getState().S.bodyweight).toEqual(backup.bodyweight)
    expect(useStore.getState().S.localEnergy).toEqual(backup.localEnergy)
    expect(useStore.getState().S.localHealth).toEqual(backup.localHealth)
    vi.resetModules()
    const reloaded = (await import('./useStore.js')).useStore
    await reloaded.getState().boot()
    expect(reloaded.getState().S.workouts).toEqual(backup.workouts)
    expect(reloaded.getState().user).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('loads a pre-1.4.3 local diary with its running session and metadata, then saves through the draft', async () => {
    const diary = {
      lang: 'en', langAuto: false, unit: 'kg',
      workouts: [{ id: 'saved', d: '2026-10-22', entries: [{ id: '0025', sets: [{ w: 60, r: 8, done: true }] }] }],
      routines: [{ id: 'routine', name: 'Fixture plan', ex: [{ id: '0025', sets: 3, reps: 8 }] }],
      week: { 1: 'routine' }, bodyweight: [{ d: '2026-10-22', w: 80 }],
      customEx: [{ id: 'c-fixture', name: 'Fixture exercise', custom: true, eq: 'barbell', bp: 'chest' }],
      active: { id: 'running', start: 1234, cur: 0, entries: [{ id: '0025', sets: [{ w: 60, r: 8, done: true }] }] },
      localEnergy: { weightKg: 80, byWorkout: { saved: { intensity: 'moderate' } } },
      localHealth: { shortcutInstalled: true, shortcutRevision: 2, exports: { saved: { status: 'confirmed', payload: { id: 'fixture-transfer' } } } },
    }
    localStorage.setItem('gym_state_v1', JSON.stringify(diary))
    vi.resetModules()
    const reloaded = (await import('./useStore.js')).useStore
    await reloaded.getState().boot()
    const before = reloaded.getState().S
    for (const key of ['workouts', 'routines', 'week', 'bodyweight', 'customEx', 'active', 'localEnergy', 'localHealth']) expect(before[key]).toEqual(diary[key])
    expect(before.lang).toBe('ru')
    expect(before.volumeWarmups).toBe(false)
    expect(before.exAliases).toEqual({})
    reloaded.getState().update(s => { s.active.cur = 1; s.localEnergy.byWorkout.saved.intensity = 'vigorous' })
    const after = reloaded.getState().S
    expect(after.workouts).toBe(before.workouts)
    expect(before.active.cur).toBe(0)
    expect(before.localEnergy.byWorkout.saved.intensity).toBe('moderate')
    const saved = JSON.parse(localStorage.getItem('gym_state_v1'))
    expect(saved.active.cur).toBe(1)
    expect(saved.localEnergy.byWorkout.saved.intensity).toBe('vigorous')
    for (const key of ['workouts', 'routines', 'week', 'bodyweight', 'customEx', 'localHealth']) expect(saved[key]).toEqual(diary[key])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps local energy and Health markers when merging a backup from before those fields existed', async () => {
    await useStore.getState().boot()
    const current = { id: 'current-workout', d: '2026-10-22', start: 1, end: 2, entries: [] }
    const imported = { id: 'imported-workout', d: '2026-10-23', start: 3, end: 4, entries: [] }
    useStore.getState().update(s => {
      s.workouts = [current]
      s.restSec = 45
      s.localEnergy = { weightKg: 80, byWorkout: { [current.id]: { intensity: 'moderate', weightKg: 80 } } }
      s.localHealth = {
        shortcutInstalled: true, shortcutRevision: 2,
        exports: { [current.id]: { status: 'pending', payload: { id: 'current' } } },
      }
    })
    const backup = { ...clone(useStore.getState().S), workouts: [imported], restSec: 120 }
    delete backup.localEnergy
    delete backup.localHealth
    const conflict = await useStore.getState().importConflict(backup)
    useStore.getState().importBackup(backup, { mergeWith: conflict })
    const S = useStore.getState().S
    expect(S.workouts.map(w => w.id).sort()).toEqual(['current-workout', 'imported-workout'])
    expect(S.restSec).toBe(120)
    expect(S.localEnergy).toEqual({ weightKg: 80, byWorkout: { [current.id]: { intensity: 'moderate', weightKg: 80 } } })
    expect(S.localHealth).toEqual({
      shortcutInstalled: true, shortcutRevision: 2,
      exports: { [current.id]: { status: 'pending', payload: { id: 'current' } } },
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('merges per-workout records with imported calorie choices and current Health markers', async () => {
    await useStore.getState().boot()
    useStore.getState().update(s => {
      s.workouts = [{ id: 'w1', d: '2026-10-22', entries: [] }, { id: 'only-current-workout', d: '2026-10-23', entries: [] }]
      s.localEnergy = { byWorkout: { w1: { weightKg: 80 }, onlyHere: { weightKg: 75 } } }
      s.localHealth = { exports: { w1: { status: 'pending' }, onlyHere: { status: 'confirmed' } } }
    })
    const backup = { ...clone(useStore.getState().S), workouts: [{ id: 'w1', d: '2026-10-22', entries: [] }], localEnergy: { byWorkout: { w1: { weightKg: 90 }, onlyBackup: { weightKg: 70 } } }, localHealth: { exports: { w1: { status: 'retry' }, onlyBackup: { status: 'pending' } } } }
    const conflict = await useStore.getState().importConflict(backup)
    useStore.getState().importBackup(backup, { mergeWith: conflict })
    expect(useStore.getState().S.localEnergy.byWorkout).toEqual({ w1: { weightKg: 90 }, onlyHere: { weightKg: 75 }, onlyBackup: { weightKg: 70 } })
    expect(useStore.getState().S.localHealth.exports).toEqual({ w1: { status: 'pending' }, onlyHere: { status: 'confirmed' }, onlyBackup: { status: 'pending' } })
  })
  it.each([false, true])('keeps the running session and Health guards when restoring a backup (merge=%s)', async merge => {
    await useStore.getState().boot()
    const active = { id: 'running', start: 1234, cur: 0, entries: [{ id: '0025', sets: [{ w: 60, r: 8, done: true }] }] }
    const energy = { weightKg: 80, byWorkout: { w1: { weightKg: 80 }, currentOnly: { weightKg: 75 } } }
    const health = { shortcutInstalled: true, shortcutRevision: 2, exports: { w1: { status: 'confirmed' }, currentOnly: { status: 'pending' } } }
    useStore.getState().update(s => {
      s.workouts = [{ id: 'current', d: '2026-10-22', entries: [] }]
      s.active = active
      s.localEnergy = energy
      s.localHealth = health
    })
    // A copy predating local metadata still carries the 1.4.3 additions and an older active session.
    const backup = { ...clone(DEF), workouts: [{ id: 'imported', d: '2026-10-21', entries: [] }], active: { id: 'old-running', entries: [] }, exAliases: { '0025': ['Bench'] }, volumeWarmups: true }
    const before = useStore.getState().S
    const beforeJson = JSON.stringify(before)
    const conflict = merge ? await useStore.getState().importConflict(backup) : null
    useStore.getState().importBackup(backup, { mergeWith: conflict })
    const S = useStore.getState().S
    expect(S.active).toEqual(active)
    expect(S.localEnergy).toEqual(energy)
    expect(S.localHealth).toEqual(health)
    expect(S.exAliases).toEqual(backup.exAliases)
    expect(S.volumeWarmups).toBe(true)
    expect(S.workouts.map(w => w.id).sort()).toEqual(merge ? ['current', 'imported'] : ['imported'])
    expect(JSON.parse(localStorage.getItem('gym_state_v1')).active).toEqual(active)
    expect(JSON.parse(localStorage.getItem('gym_state_v1')).localHealth).toEqual(health)
    expect(JSON.stringify(before)).toBe(beforeJson)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps current Health duplicate guards when replacing with an older backup of the same workout', async () => {
    await useStore.getState().boot()
    useStore.getState().update(s => {
      s.workouts = [{ id: 'w1', d: '2026-10-22', entries: [] }]
      s.localHealth = { exports: { w1: { status: 'confirmed', payload: { id: 'current-transfer' } } } }
    })
    const backup = { ...clone(DEF), workouts: [{ id: 'w1', d: '2026-10-22', entries: [] }], localHealth: { exports: { w1: { status: 'pending', payload: { id: 'old-transfer' } }, importedOnly: { status: 'pending' } } } }
    useStore.getState().importBackup(backup)
    expect(useStore.getState().S.localHealth.exports).toEqual({ w1: { status: 'confirmed', payload: { id: 'current-transfer' } }, importedOnly: { status: 'pending' } })
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
