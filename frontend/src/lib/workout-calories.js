import { hasCompletedWork } from './workout-model.js'

// MET values are intentionally coarse: this is a local estimate for a completed session,
// not a classifier of the exercises or a measurement of energy expenditure.
const MET_BY_INTENSITY = Object.freeze({
  light: 3.0,
  moderate: 3.5,
  vigorous: 6.0,
})

const LB_TO_KG = 0.45359237
const MIN_BODYWEIGHT_KG = 20
const MAX_BODYWEIGHT_KG = 350
const MAX_DURATION_MINUTES = 6 * 60

const finiteNumber = value => typeof value === 'number' && Number.isFinite(value)

// Older imported records may contain Unix seconds; current records use milliseconds.
const timestampMs = value => {
  if (!finiteNumber(value)) return null
  return Math.abs(value) < 1e11 ? value * 1000 : value
}

const usableBodyweightKg = value => finiteNumber(value) && value >= MIN_BODYWEIGHT_KG && value <= MAX_BODYWEIGHT_KG
  ? value
  : null

const bodyweightFromWorkout = (workout, unit) => {
  if (!finiteNumber(workout?.bw)) return null
  const kg = unit === 'lb' ? workout.bw * LB_TO_KG : workout.bw
  return usableBodyweightKg(kg)
}

/**
 * Estimate active and gross calories for a finished workout, entirely on-device.
 *
 * The estimate applies one MET to the complete session, including rests. `null` means the
 * workout lacks enough trustworthy local data; callers can choose the user-facing reason.
 */
export function estimateWorkoutCalories(workout, {
  unit = 'kg',
  bodyweightKg,
  intensity = 'moderate',
} = {}) {
  if (!workout || typeof workout !== 'object' || Array.isArray(workout)) return null

  const start = timestampMs(workout.start)
  const end = timestampMs(workout.end)
  if (start === null || end === null || end <= start) return null

  const minutes = (end - start) / 60000
  if (!(minutes > 0) || minutes > MAX_DURATION_MINUTES || !Number.isFinite(minutes)) return null

  const entries = Array.isArray(workout.entries) ? workout.entries : []
  const hasWork = entries.some(entry => Array.isArray(entry?.sets) && entry.sets.some(hasCompletedWork))
  if (!hasWork) return null

  const fromWorkout = bodyweightFromWorkout(workout, unit)
  const kg = fromWorkout ?? usableBodyweightKg(bodyweightKg)
  if (kg === null) return null

  const selectedIntensity = Object.hasOwn(MET_BY_INTENSITY, intensity) ? intensity : 'moderate'
  const met = MET_BY_INTENSITY[selectedIntensity]
  const base = 3.5 * kg / 200 * minutes
  const activeKcal = Math.round(((met - 1) * base) / 10) * 10
  const totalKcal = Math.round((met * base) / 10) * 10

  return {
    activeKcal,
    totalKcal,
    minutes,
    bodyweightKg: kg,
    met,
    method: 'met-v1',
    intensity: selectedIntensity,
  }
}
