import { describe, expect, it } from 'vitest'
import { estimateWorkoutCalories } from './workout-calories.js'

const workout = (over = {}) => ({
  start: 1_700_000_000_000,
  end: 1_700_000_000_000 + 60 * 60 * 1000,
  bw: 80,
  entries: [{ id: 'bench', sets: [{ w: 60, r: 8, done: true }] }],
  ...over,
})

describe('estimateWorkoutCalories', () => {
  it('estimates the whole completed session at the default moderate MET', () => {
    expect(estimateWorkoutCalories(workout())).toEqual({
      activeKcal: 210,
      totalKcal: 290,
      minutes: 60,
      bodyweightKg: 80,
      met: 3.5,
      method: 'met-v1',
      intensity: 'moderate',
    })
  })

  it('accepts legacy Unix-second timestamps and converts pounds to kilograms', () => {
    const result = estimateWorkoutCalories(workout({
      start: 1_700_000_000,
      end: 1_700_000_000 + 30 * 60,
      bw: 176.369809,
    }), { unit: 'lb' })
    expect(result).toMatchObject({ minutes: 30, intensity: 'moderate' })
    expect(result.bodyweightKg).toBeCloseTo(80, 5)
  })

  it('uses the explicit bodyweight fallback when the workout has no bodyweight', () => {
    expect(estimateWorkoutCalories(workout({ bw: undefined }), { bodyweightKg: 80 })).toMatchObject({ bodyweightKg: 80 })
  })

  it('recognizes the real unilateral completed-set shape', () => {
    const result = estimateWorkoutCalories(workout({
      entries: [{ id: 'split-squat', sets: [{ sides: {
        L: { w: 20, r: 8, done: false },
        R: { w: 20, r: 8, done: true },
      } }] }],
    }))
    expect(result).toMatchObject({ minutes: 60, bodyweightKg: 80 })
  })

  it('distinguishes active calories from gross baseline calories', () => {
    const result = estimateWorkoutCalories(workout({ end: 1_700_000_000_000 + 30 * 60 * 1000 }), { intensity: 'vigorous' })
    expect(result.activeKcal).toBeLessThan(result.totalKcal)
    expect(result.met).toBe(6)
  })

  it('requires a completed work set and valid bodyweight', () => {
    expect(estimateWorkoutCalories(workout({ entries: [{ sets: [{ w: 60, r: 8, done: false }] }] }))).toBeNull()
    expect(estimateWorkoutCalories(workout({ bw: 19 }))).toBeNull()
    expect(estimateWorkoutCalories(workout({ bw: undefined }))).toBeNull()
  })

  it('rejects corrupt timestamps, missing duration, and sessions over six hours', () => {
    expect(estimateWorkoutCalories(workout({ start: NaN }))).toBeNull()
    expect(estimateWorkoutCalories(workout({ end: 1_700_000_000_000 }))).toBeNull()
    expect(estimateWorkoutCalories(workout({ end: 1_700_000_000_000 + 6 * 60 * 60 * 1000 + 1 }))).toBeNull()
  })

  it('does not treat load or repetitions as a linear calorie multiplier', () => {
    const ordinary = estimateWorkoutCalories(workout())
    const heavier = estimateWorkoutCalories(workout({ entries: [{ sets: [{ w: 600, r: 800, done: true }] }] }))
    expect(heavier).toEqual(ordinary)
  })

  it('does not mutate the workout or its nested entries', () => {
    const input = workout()
    const before = structuredClone(input)
    estimateWorkoutCalories(input, { intensity: 'light' })
    expect(input).toEqual(before)
  })
})
