// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'

const updater = vi.hoisted(() => {
  let snapshot = { checking: false, available: false, error: null }
  const listeners = new Set()
  const api = {
    check: vi.fn(async () => snapshot),
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    set(next) {
      snapshot = { ...snapshot, ...next }
      listeners.forEach(listener => listener())
    },
    reset() {
      snapshot = { checking: false, available: false, error: null }
      api.check.mockReset().mockResolvedValue(snapshot)
      listeners.clear()
    },
  }
  return api
})

vi.mock('../lib/local-pwa-update.js', () => ({
  getLocalPwaUpdateSnapshot: () => updater.getSnapshot(),
  subscribeLocalPwaUpdate: listener => updater.subscribe(listener),
  checkLocalPwaUpdate: (...args) => updater.check(...args),
}))

vi.mock('../lib/i18n.js', () => ({ getLang: () => 'ru', useLang: () => {} }))

import { LocalPwaUpdateBanner, LocalPwaUpdateRow } from './LocalPwaUpdate.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let root
let host

function mount(element) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(element))
  return host
}

function row() {
  return host.querySelector('.lrow')
}

function updateButton() {
  return [...host.querySelectorAll('button')].find(button => button.textContent.trim() === 'Обновить')
}

beforeEach(() => {
  updater.reset()
  document.body.innerHTML = ''
  localStorage.clear()
  vi.spyOn(window.location, 'reload').mockImplementation(() => {})
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  vi.restoreAllMocks()
})

describe('LocalPwaUpdateBanner', () => {
  it('renders no banner for the current version', () => {
    mount(<LocalPwaUpdateBanner />)

    expect(host.querySelector('.local-update-bar')).toBeNull()
  })

  it('shows a clear update action without reloading or changing local input data automatically', () => {
    const diary = { workout: 'today', text: 'не менять' }
    localStorage.setItem('gym-diary', JSON.stringify(diary))
    mount(<><input aria-label="Ввод" defaultValue="черновик" /><LocalPwaUpdateBanner /></>)

    act(() => updater.set({ available: true }))

    expect(host.querySelector('.local-update-bar').textContent).toContain('Новая версия готова')
    expect(updateButton()).toBeTruthy()
    expect(window.location.reload).not.toHaveBeenCalled()
    expect(host.querySelector('input').value).toBe('черновик')
    expect(JSON.parse(localStorage.getItem('gym-diary'))).toEqual(diary)

    act(() => updateButton().click())
    expect(window.location.reload).toHaveBeenCalledTimes(1)
    expect(host.querySelector('input').value).toBe('черновик')
    expect(JSON.parse(localStorage.getItem('gym-diary'))).toEqual(diary)
  })
})

describe('LocalPwaUpdateRow', () => {
  it('offers a manual check and says the app is current only after that check', async () => {
    mount(<LocalPwaUpdateRow />)

    expect(row().textContent).toContain('Проверить обновление GYM')
    expect(row().textContent).toContain('Тренировки и программы останутся на телефоне.')
    expect(row().textContent).not.toContain('актуальная версия')

    await act(async () => row().click())

    expect(updater.check).toHaveBeenCalledTimes(1)
    expect(row().textContent).toContain('Установлена актуальная версия.')
  })

  it('shows the available update copy and reloads only after the row is clicked', () => {
    mount(<LocalPwaUpdateRow />)
    act(() => updater.set({ available: true }))

    expect(row().textContent).toContain('Обновить GYM')
    expect(row().textContent).toContain('Экран перезапустится. Тренировки и программы сохранятся.')
    expect(window.location.reload).not.toHaveBeenCalled()

    act(() => row().click())
    expect(window.location.reload).toHaveBeenCalledTimes(1)
    expect(updater.check).not.toHaveBeenCalled()
  })

  it('shows an error as an error and does not claim that the app is up to date', () => {
    mount(<LocalPwaUpdateRow />)
    act(() => updater.set({ error: 'offline' }))

    expect(row().textContent).toContain('Не удалось проверить. Подключись к интернету и попробуй ещё раз.')
    expect(row().textContent).not.toContain('Установлена актуальная версия.')
  })
})
