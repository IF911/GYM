import { useMemo, useRef, useState } from 'react'
import { getLang, useLang } from '../lib/i18n.js'
import { convertBodyWeight } from '../lib/units.js'
import { hasCompletedWork } from '../lib/workout-model.js'
import { estimateWorkoutCalories } from '../lib/workout-calories.js'
import { healthWorkoutKey, dispatchHealthExport } from '../lib/health-shortcut.js'
import { useStore } from '../store/useStore.js'
import { Button } from './ui.jsx'

const MIN_WEIGHT = 20
const MAX_WEIGHT = 350
const finite = value => typeof value === 'number' && Number.isFinite(value)
const validWeight = value => finite(value) && value >= MIN_WEIGHT && value <= MAX_WEIGHT
const timestamp = value => finite(value) ? (Math.abs(value) < 1e11 ? value * 1000 : value) : null

const appleDevice = () => {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  return /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
}

const workoutDay = workout => {
  if (typeof workout?.d === 'string' && workout.d) return workout.d
  const at = timestamp(workout?.start)
  return at === null ? '' : new Date(at).toISOString().slice(0, 10)
}

function lastWeighInKg(S, workout) {
  const unit = S?.unit || 'kg'
  const day = workoutDay(workout)
  const rows = Array.isArray(S?.bodyweight) ? S.bodyweight : []
  return rows
    .filter(row => row && typeof row.d === 'string' && (!day || row.d <= day) && finite(Number(row.w)))
    .sort((a, b) => a.d < b.d ? 1 : a.d > b.d ? -1 : 0)
    .map(row => Number(convertBodyWeight(Number(row.w), unit, 'kg')))
    .find(validWeight) ?? null
}

function preferenceWeight(S, key) {
  const perWorkout = key && S?.localEnergy?.byWorkout?.[key]?.weightKg
  if (validWeight(Number(perWorkout))) return Number(perWorkout)
  if (validWeight(Number(S?.localEnergy?.weightKg))) return Number(S.localEnergy.weightKg)
  return null
}

function setEnergyPreference(update, key, patch) {
  update(S => {
    const current = S.localEnergy && typeof S.localEnergy === 'object' ? S.localEnergy : {}
    const byWorkout = { ...(current.byWorkout || {}) }
    const prior = key ? { ...(byWorkout[key] || {}) } : {}
    if (patch.weightKg === null) delete prior.weightKg
    else if (patch.weightKg !== undefined) prior.weightKg = patch.weightKg
    if (patch.intensity) prior.intensity = patch.intensity
    if (key) {
      if (Object.keys(prior).length) byWorkout[key] = prior
      else delete byWorkout[key]
    }
    S.localEnergy = {
      ...current,
      ...(patch.globalWeightKg === null ? {} : patch.globalWeightKg !== undefined ? { weightKg: patch.globalWeightKg } : {}),
      byWorkout,
    }
  })
}

const copy = {
  ru: {
    title: 'Примерный расход', subtitle: 'Активные калории сверх расхода в покое. Это оценка по времени и весу, а не измерение.',
    details: 'Уточнить оценку', weight: 'Вес для оценки (кг)', enterWeight: 'Укажи вес тела, чтобы рассчитать примерный расход.',
    invalid: 'Нельзя оценить: тренировка не завершена или у неё нет корректной длительности.', setup: 'Один раз открой файл ниже и добавь команду с именем GYM-Health. Если Safari скачает файл, открой его в «Файлах». Затем вернись в GYM с иконки. При первой записи разреши «Командам» добавлять тренировки в «Здоровье».',
    install: 'Установить команду GYM-Health', installed: 'Я добавил команду', send: 'Добавить в Здоровье', pending: 'Передача подготовлена. Проверь запись в «Здоровье».',
    present: 'Тренировка есть в Здоровье', added: 'Отмечено как добавленное', retry: 'Не добавилось — повторить', warning: 'Повторная передача может создать дубликат.', repeat: 'Передать повторно',
    unsupported: 'Передача доступна на iPhone/iPad', intensity: 'Интенсивность', light: 'Спокойная', moderate: 'Обычная, с паузами', vigorous: 'Интенсивная, короткие паузы', kcal: 'ккал',
    error: 'Не удалось открыть команду. Проверь, что она установлена с именем GYM-Health.', storageError: 'Не удалось сохранить отметку передачи на телефоне. Команда не запущена.',
  },
  en: {
    title: 'Estimated expenditure', subtitle: 'Active calories above resting expenditure. This is an estimate from time and weight, not a measurement.',
    details: 'Refine estimate', weight: 'Weight for estimate (kg)', enterWeight: 'Enter your body weight to calculate an estimate.',
    invalid: 'Cannot estimate: the workout is unfinished or has no valid duration.', setup: 'Open the file below and add the shortcut named GYM-Health once. If Safari downloads it, open it in Files. Return to GYM using its home-screen icon. On the first write, allow Shortcuts to add workouts to Health.',
    install: 'Install GYM-Health shortcut', installed: 'I added the shortcut', send: 'Add to Health', pending: 'Transfer prepared. Check the entry in Health.',
    present: 'Workout is in Health', added: 'Marked as added', retry: 'Did not add — try again', warning: 'Retrying may create a duplicate.', repeat: 'Send again',
    unsupported: 'Transfer is available on iPhone/iPad', intensity: 'Intensity', light: 'Light', moderate: 'Moderate, with rests', vigorous: 'Vigorous, short rests', kcal: 'kcal',
    error: 'Could not open the shortcut. Check that it is installed as GYM-Health.', storageError: 'Could not save the transfer marker on this phone. The shortcut was not launched.',
  },
}

export default function WorkoutEnergy({ w }) {
  const S = useStore(s => s.S)
  const update = useStore(s => s.update)
  useLang()
  const text = copy[getLang() === 'ru' ? 'ru' : 'en']
  const key = useMemo(() => { try { return healthWorkoutKey(w) } catch { return null } }, [w])
  const perWorkout = key ? S?.localEnergy?.byWorkout?.[key] : null
  const inherited = preferenceWeight(S, key)
  const sessionWeightValue = finite(Number(w?.bw)) ? Number(convertBodyWeight(Number(w.bw), S?.unit || 'kg', 'kg')) : null
  const sessionWeight = validWeight(sessionWeightValue) ? sessionWeightValue : null
  const chosenWeight = perWorkout?.weightKg && validWeight(Number(perWorkout.weightKg)) ? Number(perWorkout.weightKg)
    : sessionWeight ?? inherited ?? lastWeighInKg(S, w)
  const [weightDraft, setWeightDraft] = useState(null)
  const [retryOpen, setRetryOpen] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [exportError, setExportError] = useState(null)
  const lock = useRef(false)
  const intensity = ['light', 'moderate', 'vigorous'].includes(perWorkout?.intensity) ? perWorkout.intensity : 'moderate'
  const draftNumber = weightDraft === null ? chosenWeight : Number(weightDraft)
  const completedEntries = (Array.isArray(w?.entries) ? w.entries : []).filter(entry => Array.isArray(entry?.sets) && entry.sets.some(hasCompletedWork))
  const cardioOnly = completedEntries.length > 0 && completedEntries.every(entry =>
    entry?.target?.mode === 'cardio' || entry?.mode === 'cardio' || entry.sets.filter(hasCompletedWork).every(set => set?.mode === 'cardio' || Number(set?.min) > 0))
  const estimate = validWeight(draftNumber) && !cardioOnly
    ? estimateWorkoutCalories({ ...w, bw: undefined }, { bodyweightKg: draftNumber, intensity })
    : null
  const hasWork = Array.isArray(w?.entries) && w.entries.some(e => Array.isArray(e?.sets) && e.sets.some(hasCompletedWork))
  const start = timestamp(w?.start); const end = timestamp(w?.end)
  const durationOK = start !== null && end !== null && end > start && end - start <= 6 * 60 * 60 * 1000
  const invalidReason = !cardioOnly && (!hasWork || !durationOK)
  const ledger = key ? S?.localHealth?.exports?.[key] : null
  const apple = appleDevice()
  const installed = !!S?.localHealth?.shortcutInstalled

  const remember = (value, field = 'weightKg') => {
    if (field === 'intensity') setEnergyPreference(update, key, { intensity: value })
    else setEnergyPreference(update, key, { weightKg: value, globalWeightKg: value })
  }
  const setup = () => update(s => { s.localHealth = { ...(s.localHealth || {}), shortcutInstalled: true } })
  const send = retry => {
    if (!estimate || !apple || !installed || lock.current || (ledger && !retry)) return
    lock.current = true
    try {
      if (retry && key) update(s => {
        if (s.localHealth?.exports) delete s.localHealth.exports[key]
      })
      const latest = useStore.getState()
      dispatchHealthExport({
        workout: w,
        estimate,
        state: latest.S,
        update: latest.update,
      })
      setRetryOpen(false); setExportError(null)
    } catch (error) {
      if (error.message === 'already-sent') return
      setExportError(error.message)
      setRetryOpen(true)
    } finally {
      lock.current = false
    }
  }
  const confirm = () => key && update(s => {
    const item = s.localHealth?.exports?.[key]
    if (item) item.status = 'confirmed'
  })

  return <section className="energy-card" aria-label={text.title}>
    <div className="energy-title">{text.title}</div>
    {cardioOnly ? <div className="muted small">{getLang() === 'ru' ? 'Оценка пока доступна для силовых тренировок.' : 'Estimates are currently available for strength workouts.'}</div> : estimate ? <>
      <div className="energy-value">≈ {estimate.activeKcal} {text.kcal}</div>
      <div className="muted small">{text.subtitle}</div>
    </> : <div className="muted small">{invalidReason ? text.invalid : !validWeight(draftNumber) ? text.enterWeight : text.error}</div>}
    <details className="energy-details">
      <summary>{text.details}</summary>
      <label>{text.weight}<input aria-label={text.weight} inputMode="decimal" type="number" min={MIN_WEIGHT} max={MAX_WEIGHT}
        value={weightDraft ?? (chosenWeight ?? '')} onChange={e => {
          const raw = e.target.value
          setWeightDraft(raw)
          const value = Number(raw)
          if (raw === '') remember(null)
          else if (validWeight(value)) remember(value)
        }} /></label>
      <label>{text.intensity}<select aria-label={text.intensity} value={intensity} onChange={e => remember(e.target.value, 'intensity')}>
        <option value="light">{text.light}</option><option value="moderate">{text.moderate}</option><option value="vigorous">{text.vigorous}</option>
      </select></label>
    </details>
    {!apple && <div className="muted small">{text.unsupported}</div>}
    {apple && estimate && !invalidReason && !ledger && <Button variant="primary" disabled={lock.current} onClick={() => installed ? send(false) : setSetupOpen(true)}>{text.send}</Button>}
    {apple && !installed && setupOpen && <div className="energy-setup"><div className="muted small">{text.setup}</div>
      <a href={new URL('./GYM-Health.shortcut', window.location.href).href} target="_blank" rel="noopener">{text.install}</a>
      <Button size="sm" onClick={() => { setup(); setSetupOpen(false) }}>{text.installed}</Button>
    </div>}
    {exportError && <p role="alert" className="small muted">{exportError === 'not-persisted' ? text.storageError : text.error}</p>}
    {ledger?.status === 'pending' && <div className="energy-status"><div>{text.pending}</div><Button size="sm" onClick={confirm}>{text.present}</Button></div>}
    {ledger?.status === 'confirmed' && <div className="energy-status">{text.added}</div>}
    {ledger && <div className="energy-retry"><Button size="sm" onClick={() => setRetryOpen(v => !v)}>{text.retry}</Button>
      {retryOpen && <div><div className="muted small">{text.warning}</div>
        <a href={new URL('./GYM-Health.shortcut', window.location.href).href} target="_blank" rel="noopener">{text.install}</a>
        <Button size="sm" onClick={() => send(true)}>{text.repeat}</Button></div>}
    </div>}
  </section>
}
