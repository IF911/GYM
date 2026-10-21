import { describe, expect, it, vi } from 'vitest'
import { buildHealthPayload, dispatchHealthExport, healthShortcutUrl, healthWorkoutKey } from './health-shortcut.js'
import { estimateWorkoutCalories } from './workout-calories.js'

const workout = () => ({ id: 'workout-1', d: '2026-10-21', start: Date.UTC(2026, 9, 21, 10), end: Date.UTC(2026, 9, 21, 11),
  bw: 80, name: 'Private routine', note: 'Private health note', entries: [{ id: '0025', sets: [{ w: 60, r: 8, done: true }] }] })
const fixture = () => {
  const w = workout(), estimate = estimateWorkoutCalories(w)
  const state = { workouts: [w], routines: [{ id: 'kept' }], localHealth: { shortcutInstalled: true, shortcutRevision: 2 } }
  const openUrl = vi.fn()
  return { workout: w, estimate, state, update: fn => fn(state), readPersisted: () => structuredClone(state), openUrl }
}

describe('local Apple Health hand-off', () => {
  it('passes only a minimal estimate via a local Shortcuts URL, with no callback or cloud endpoint', () => {
    const f = fixture(), before = structuredClone(f.state)
    const payload = dispatchHealthExport({ ...f, now: 123 })
    expect(payload).toEqual({ version: 1, id: expect.stringMatching(/^gym1-/), start: '2026-10-21T10:00:00.000Z',
      end: '2026-10-21T11:00:00.000Z', minutes: 60, activeKcal: 210 })
    const url = new URL(f.openUrl.mock.calls[0][0])
    expect(url.protocol).toBe('shortcuts:')
    expect(url.searchParams.get('name')).toBe('GYM-Health')
    expect(JSON.parse(url.searchParams.get('text'))).toEqual(payload)
    expect(url.href).not.toMatch(/https|Private|clipboard|callback|entries|bw|bodyweight/i)
    expect(f.state.workouts).toEqual(before.workouts)
    expect(f.state.routines).toEqual(before.routines)
    expect(f.state.localHealth.exports[healthWorkoutKey(f.workout)]).toMatchObject({ status: 'pending', at: 123 })
  })

  it('saves before launch, keeps an uncertain outcome pending and blocks normal repeats', () => {
    const f = fixture()
    f.openUrl.mockImplementation(() => {
      expect(f.state.localHealth.exports[healthWorkoutKey(f.workout)].status).toBe('pending')
    })
    dispatchHealthExport(f)
    expect(() => dispatchHealthExport(f)).toThrow('already-sent')
    expect(f.openUrl).toHaveBeenCalledTimes(1)
    f.workout.end += 60000
    expect(() => dispatchHealthExport({ ...f, estimate: estimateWorkoutCalories(f.workout) })).toThrow('already-sent')
  })

  it('never starts an external write if the pending marker did not persist', () => {
    const f = fixture()
    expect(() => dispatchHealthExport({ ...f, readPersisted: () => ({}) })).toThrow('not-persisted')
    expect(f.openUrl).not.toHaveBeenCalled()
  })

  it('requires replacement of the broken v1 shortcut before a new hand-off', () => {
    const f = fixture()
    delete f.state.localHealth.shortcutRevision
    expect(() => dispatchHealthExport(f)).toThrow('shortcut-not-installed')
    f.state.localHealth.shortcutRevision = 1
    expect(() => dispatchHealthExport(f)).toThrow('shortcut-not-installed')
    expect(f.openUrl).not.toHaveBeenCalled()
    expect(f.state.localHealth.exports).toBeUndefined()
    expect(f.state.workouts).toEqual([f.workout])
  })

  it('replaces an explicit retry marker atomically and retains a marker when saving fails', () => {
    for (const saveWorks of [true, false]) {
      const f = fixture(), key = healthWorkoutKey(f.workout)
      // An unchanged workout has the same payload id, even when the clock is
      // unchanged too. Read-back must distinguish attempts, not just payloads.
      const oldRecord = { status: 'pending', payload: buildHealthPayload(f.workout, f.estimate), at: 1, attempt: 1 }
      f.state.localHealth.exports = { [key]: structuredClone(oldRecord) }
      const oldSavedState = structuredClone(f.state)
      const update = vi.fn(fn => {
        expect(f.state.localHealth.exports[key]).toEqual(oldRecord)
        fn(f.state)
      })
      const options = { ...f, update, retry: true, now: 1, readPersisted: () => saveWorks ? structuredClone(f.state) : oldSavedState }
      if (saveWorks) {
        dispatchHealthExport(options)
        expect(f.openUrl).toHaveBeenCalledOnce()
        expect(() => dispatchHealthExport(f)).toThrow('already-sent')
      } else {
        expect(() => dispatchHealthExport(options)).toThrow('not-persisted')
        expect(f.openUrl).not.toHaveBeenCalled()
        expect(oldSavedState.localHealth.exports[key]).toEqual(oldRecord)
      }
      expect(update).toHaveBeenCalledOnce()
      expect(f.state.localHealth.exports[key].status).toBe('pending')
      expect(f.state.workouts).toEqual([f.workout])
    }
  })

  it('requires a completed valid estimate and installed shortcut, preserving an old diary on error', () => {
    const f = fixture()
    f.state.localHealth.shortcutInstalled = false
    expect(() => dispatchHealthExport(f)).toThrow('shortcut-not-installed')
    expect(() => buildHealthPayload({ ...f.workout, end: Infinity }, f.estimate)).toThrow('invalid-workout')
    expect(() => buildHealthPayload(f.workout, { ...f.estimate, activeKcal: NaN })).toThrow('invalid-workout')
    expect(() => buildHealthPayload(f.workout, { ...f.estimate, minutes: 1 })).toThrow('invalid-workout')
    expect(() => buildHealthPayload({ ...f.workout, entries: [] }, f.estimate)).toThrow('invalid-workout')
    expect(f.openUrl).not.toHaveBeenCalled()
    expect(f.state.workouts).toEqual([f.workout])
  })

  it('uses the workout id across time edits, distinct legacy keys, and stable payloads', () => {
    const w = workout(), estimate = estimateWorkoutCalories(w)
    expect(healthWorkoutKey(w)).toBe(healthWorkoutKey({ ...w, start: w.start + 60000 }))
    expect(healthWorkoutKey({ ...w, id: undefined })).not.toBe(healthWorkoutKey({ ...w, id: undefined, start: w.start + 60000 }))
    expect(healthWorkoutKey({ ...w, id: undefined })).toBe(healthWorkoutKey({ ...w, id: w.d + '|' + w.start, start: w.start + 60000 }))
    expect(buildHealthPayload(w, estimate)).toEqual(buildHealthPayload(w, estimate))
    const clean = buildHealthPayload(w, estimate)
    expect(new URL(healthShortcutUrl({ ...clean, note: 'do not send' })).searchParams.get('text')).not.toContain('note')
  })
})
