// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

const mocks = vi.hoisted(() => {
  const state = {
    S: { unit: 'kg', bodyweight: [], localEnergy: {}, localHealth: {}, workouts: [] },
    updates: [],
    dispatch: vi.fn(),
    snapshot() { return { S: state.S, update: state.update } },
    update(mutator) {
      const next = structuredClone(state.S)
      mutator(next)
      state.S = next
      state.updates.push(next)
    },
  }
  return state
})

vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore }
})
vi.mock('../lib/i18n.js', () => ({ getLang: () => 'ru', useLang: () => {} }))
vi.mock('../lib/health-shortcut.js', () => ({
  healthWorkoutKey: w => w.id || 'workout-key',
  dispatchHealthExport: (...args) => mocks.dispatch(...args),
}), { virtual: true })

import WorkoutEnergy from './WorkoutEnergy.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root
const completed = (over = {}) => ({ id: 'w1', start: 1_700_000_000_000, end: 1_700_000_000_000 + 60 * 60 * 1000,
  entries: [{ sets: [{ w: 60, r: 8, done: true }] }], ...over })
const render = w => act(() => root.render(<WorkoutEnergy w={w} />))
const button = label => [...host.querySelectorAll('button')].find(b => b.textContent.includes(label))

beforeEach(() => {
  mocks.S = { unit: 'kg', bodyweight: [], localEnergy: {}, localHealth: {}, workouts: [] }
  mocks.updates.length = 0
  mocks.dispatch.mockReset()
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  window.history.replaceState({}, '', '/GYM/#/history')
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'iPhone' })
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 })
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('WorkoutEnergy', () => {
  it('renders the estimate and uses a prior weigh-in without inventing a weight', () => {
    mocks.S.bodyweight = [{ d: '2023-01-01', w: 80 }]
    mocks.S.workouts = [completed({ d: '2023-01-02' })]
    const historyBefore = structuredClone(mocks.S.workouts)
    render(completed({ d: '2023-01-02' }))
    expect(host.textContent).toContain('Примерный расход')
    expect(host.textContent).toContain('≈ 210 ккал')
    expect(host.querySelector('input').value).toBe('80')
    expect(mocks.S.workouts).toEqual(historyBefore)
  })

  it('converts a high raw pound bodyweight before applying the kg safety range', () => {
    mocks.S.unit = 'lb'
    render(completed({ unit: 'lb', bw: 440 }))
    expect(host.textContent).toContain('≈')
    expect(Number(host.querySelector('input').value)).toBeCloseTo(199.6, 1)
  })

  it('does not offer the strength MET estimate for a pure cardio record', () => {
    render(completed({ entries: [{ target: { mode: 'cardio' }, sets: [{ min: 30, done: true }] }] }))
    expect(host.textContent).toContain('Оценка пока доступна для силовых тренировок')
    expect(button('Добавить в Здоровье')).toBeUndefined()
  })

  it('explains missing weight and persists an entered estimate preference only', () => {
    render(completed())
    expect(host.textContent).toContain('Укажи вес тела')
    const input = host.querySelector('input')
    const setNativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    act(() => { setNativeValue.call(input, '80'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(mocks.S.bodyweight).toEqual([])
    expect(mocks.S.localEnergy.byWorkout.w1.weightKg).toBe(80)
    expect(mocks.S.localEnergy.weightKg).toBe(80)
  })

  it('blocks export for a missing duration or unfinished workout', () => {
    render(completed({ end: undefined }))
    expect(host.textContent).toContain('тренировка не завершена')
    expect(button('Добавить в Здоровье')).toBeUndefined()
  })

  it('requires setup before export and records pending as a pending state, not success', () => {
    mocks.S.bodyweight = [{ d: '2023-01-01', w: 80 }]
    render(completed({ d: '2023-01-02' }))
    expect(button('Добавить в Здоровье')).toBeTruthy()
    act(() => button('Добавить в Здоровье').click())
    expect(host.textContent).toContain('добавь команду')
    expect(host.querySelector('a').href).toContain('/GYM/GYM-Health.shortcut')
    act(() => button('Я добавил команду').click())
    expect(mocks.S.localHealth.shortcutInstalled).toBe(true)
    render(completed({ d: '2023-01-02' }))
    act(() => button('Добавить в Здоровье').click())
    expect(mocks.dispatch).toHaveBeenCalledTimes(1)
    expect(host.textContent).not.toContain('Отмечено как добавленное')
  })

  it('shows pending confirmation, then blocks normal repeat until explicit recovery', () => {
    mocks.S.bodyweight = [{ d: '2023-01-01', w: 80 }]
    mocks.S.localHealth = { shortcutInstalled: true, exports: { w1: { status: 'pending' } } }
    render(completed({ d: '2023-01-02' }))
    expect(host.textContent).toContain('Передача подготовлена')
    act(() => button('Тренировка есть в Здоровье').click())
    expect(mocks.S.localHealth.exports.w1.status).toBe('confirmed')
    render(completed({ d: '2023-01-02' }))
    expect(host.textContent).toContain('Отмечено как добавленное')
    act(() => button('Не добавилось').click())
    expect(host.textContent).toContain('может создать дубликат')
  })
})
