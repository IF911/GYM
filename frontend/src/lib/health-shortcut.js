// Explicit, on-device hand-off to Apple's Shortcuts. No HTTP, clipboard, callback URL,
// personal notes or exercise list are involved. Opening a URL is not proof of a Health write.
import { hasCompletedWork } from './workout-model.js'

export const HEALTH_SHORTCUT_NAME = 'GYM-Health'
// A fresh static path avoids reinstalling the broken v1 file from Safari's cache.
export const HEALTH_SHORTCUT_FILE = 'shortcuts/v2/GYM-Health.shortcut'
export const HEALTH_SHORTCUT_REVISION = 2
export const healthShortcutReady = state => !!state?.localHealth?.shortcutInstalled &&
  state.localHealth.shortcutRevision >= HEALTH_SHORTCUT_REVISION

const ms = value => Number.isFinite(value) && value > 0 ? (value < 1e11 ? value * 1000 : value) : NaN

export function healthWorkoutKey(workout) {
  // The date editor freezes a legacy record's old day/start key as its new id.
  // Both representations must keep the same dispatch marker after that edit.
  return 'workout:' + (workout?.id != null ? String(workout.id) : String(workout?.d || '') + '|' + String(workout?.start))
}

const hash = text => {
  let value = 2166136261
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619)
  return (value >>> 0).toString(16).padStart(8, '0')
}

export function buildHealthPayload(workout, estimate) {
  const start = ms(workout?.start), end = ms(workout?.end)
  const minutes = (end - start) / 60000
  const kcal = estimate?.activeKcal
  const hasWork = Array.isArray(workout?.entries) && workout.entries.some(e => Array.isArray(e?.sets) && e.sets.some(hasCompletedWork))
  if (!Number.isFinite(start) || !Number.isFinite(end) || !(minutes > 0 && minutes <= 360) ||
    !hasWork ||
    !Number.isInteger(kcal) || kcal < 0 || kcal > 10000 || estimate?.method !== 'met-v1' ||
    !Number.isFinite(estimate.minutes) || Math.abs(estimate.minutes - minutes) > 0.001) throw new Error('invalid-workout')
  return {
    version: 1,
    id: `gym1-${hash(healthWorkoutKey(workout))}-${start}-${end}-${kcal}`,
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
    minutes: Number(minutes.toFixed(4)),
    activeKcal: kcal,
  }
}

export function healthShortcutUrl(payload) {
  // Only the supported fields survive even if a caller hands us a larger object.
  if (payload?.version !== 1 || typeof payload.id !== 'string' || payload.id.length > 200 ||
    !/^gym1-[\w-]+$/.test(payload.id) || !Number.isFinite(Date.parse(payload.start)) ||
    !Number.isFinite(Date.parse(payload.end)) || !Number.isFinite(payload.minutes) || !(payload.minutes > 0 && payload.minutes <= 360) ||
    !Number.isInteger(payload.activeKcal) || payload.activeKcal < 0 || payload.activeKcal > 10000) throw new Error('invalid-workout')
  const data = { version: 1, id: payload.id, start: payload.start, end: payload.end, minutes: payload.minutes, activeKcal: payload.activeKcal }
  return 'shortcuts://run-shortcut?name=' + encodeURIComponent(HEALTH_SHORTCUT_NAME) +
    '&input=text&text=' + encodeURIComponent(JSON.stringify(data))
}

const readLocalState = () => {
  try { return JSON.parse(localStorage.getItem('gym_state_v1') || '{}') } catch { return null }
}

export function dispatchHealthExport({ workout, estimate, state, update, readPersisted = readLocalState,
  openUrl = url => window.location.assign(url), now = Date.now(), retry = false }) {
  const key = healthWorkoutKey(workout)
  const previous = state?.localHealth?.exports?.[key]
  if (previous && !retry) throw new Error('already-sent')
  if (!healthShortcutReady(state)) throw new Error('shortcut-not-installed')
  const payload = buildHealthPayload(workout, estimate)
  const url = healthShortcutUrl(payload)
  const attempt = Number.isSafeInteger(previous?.attempt) && previous.attempt >= 0 ? previous.attempt + 1 : 1
  const record = { status: 'pending', payload, at: now, attempt }
  update(s => {
    if (s.localHealth?.exports?.[key] && !retry) throw new Error('already-sent')
    // Explicit retry replaces the marker in one update. Never delete it first:
    // a failed save must keep the prior uncertain dispatch recorded on the phone.
    s.localHealth = { ...s.localHealth, exports: { ...s.localHealth?.exports, [key]: record } }
  })
  // Save-before-open prevents a fast second tap or a resumed PWA from silently adding twice.
  // If browser storage cannot retain the marker, do not launch an external write.
  const saved = readPersisted()?.localHealth?.exports?.[key]
  if (saved?.status !== 'pending' || saved.payload?.id !== payload.id || saved.at !== record.at || saved.attempt !== attempt) throw new Error('not-persisted')
  openUrl(url)
  return payload
}
