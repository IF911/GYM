import { describe, expect, it } from 'vitest'
import { EXDB, EXIDX } from './exercises.js'
import { canShowOneRM, canShowPlateLoading, exerciseToolPolicy } from './exercise-tools.js'

const find = (predicate, label) => {
  const ex = EXDB.find(predicate)
  if (!ex) throw new Error(`fixture not found: ${label}`)
  return ex
}

describe('exercise weight tools policy', () => {
  it('hides both tools for jumps and timed work even with stale overrides', () => {
    const jump = find(e => e.cat === 'plyometrics', 'plyometric')
    expect(exerciseToolPolicy(jump, { mode: 'reps', loadKind: 'pairs', loadKindExplicit: true })).toMatchObject({ oneRM: false, plates: false })
    const hold = find(e => e.cat === 'isometric', 'isometric')
    expect(canShowOneRM(hold, { mode: 'time', loadKind: 'pairs', loadKindExplicit: true })).toBe(false)
    expect(canShowPlateLoading(hold, { mode: 'time', loadKind: 'pairs', loadKindExplicit: true })).toBe(false)
    expect(exerciseToolPolicy(EXIDX['4209'], { mode: 'reps', bodyweight: false, loadKind: 'pairs', loadKindExplicit: true })).toMatchObject({ oneRM: false, plates: false })
  })

  it('keeps 1RM for loaded strength and hides ordinary bodyweight work', () => {
    const loaded = find(e => e.cat === 'strength' && ['barbell', 'dumbbell', 'cable', 'smith machine'].includes(e.eq), 'loaded strength')
    expect(canShowOneRM(loaded, { mode: 'reps' })).toBe(true)
    const bodyweight = find(e => e.eq === 'body weight' && e.cat !== 'plyometrics', 'bodyweight')
    expect(canShowOneRM(bodyweight, { mode: 'reps', bodyweight: true })).toBe(false)
    expect(canShowOneRM(EXIDX['0276'], { mode: 'reps', bodyweight: false })).toBe(false)
    expect(canShowOneRM(EXIDX['0276'], { mode: 'reps', bodyweight: false, hasMeaningfulLoad: true, loadKindExplicit: true })).toBe(false)
    expect(canShowOneRM(EXIDX['0025'], { mode: 'reps' })).toBe(true)
  })

  it('allows explicitly loaded calisthenics and an explicitly selected lever stack', () => {
    const cal = find(e => e.cat === 'calisthenics' && e.eq === 'body weight' && e.bp !== 'waist', 'loaded calisthenics')
    expect(canShowOneRM(cal, { mode: 'reps', bodyweight: false, hasMeaningfulLoad: true })).toBe(true)
    const lever = find(e => e.eq === 'leverage machine' && e.cat === 'strength', 'lever machine')
    expect(canShowPlateLoading(lever, { mode: 'reps', loadKind: 'single', loadKindExplicit: true })).toBe(true)
    expect(canShowPlateLoading(lever, { mode: 'reps', loadKind: 'none' })).toBe(false)
    expect(canShowPlateLoading(EXIDX['1455'], { mode: 'reps', loadKind: 'pairs', loadKindExplicit: true })).toBe(true)
    expect(canShowPlateLoading(EXIDX['7583'], { mode: 'reps', loadKind: 'single', loadKindExplicit: true })).toBe(false)
    const band = find(e => e.eq === 'band', 'band')
    expect(canShowPlateLoading(band, { mode: 'reps', hasMeaningfulLoad: true, loadKind: 'single', loadKindExplicit: true })).toBe(false)
  })
})
