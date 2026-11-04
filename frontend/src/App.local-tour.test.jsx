// @vitest-environment happy-dom
// Exercise the real App timer, PlanLink's payload scrubbing, and the tour overlay together:
// a first-run tour must leave the private-plan form usable, then remain available on Home.
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./lib/local.js', async importOriginal => ({ ...(await importOriginal()), LOCAL: true }))
vi.mock('./lib/sound.js', async importOriginal => ({ ...(await importOriginal()), setPlayOnSilent: vi.fn(), setVibrate: vi.fn(), setAlarmBuzzer: vi.fn(), setNativeBuzzer: vi.fn() }))
vi.mock('./views/Home.jsx', () => ({ default: () => <h1>Home fixture</h1> }))

import App from './App.jsx'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { closeTour, tourState } from './lib/tour.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host, root, originalStore
const mount = async hash => {
  window.history.replaceState(null, '', '/' + hash)
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => { root.render(<App />) })
}
const go = async hash => act(async () => {
  window.location.hash = hash
  window.dispatchEvent(new PopStateEvent('popstate'))
})
const settle = async () => act(async () => { await vi.advanceTimersByTimeAsync(1200) })
const expectImportUsable = () => {
  expect(document.querySelector('.tour-ask')).toBeNull()
  expect(tourState()).toBeNull()
  const field = host.querySelector('input[type="password"]')
  expect(field).not.toBeNull()
  expect(field.disabled).toBe(false)
  field.focus()
  expect(document.activeElement).toBe(field)
}

beforeEach(async () => {
  // Resolve the actual lazy overlay before fake timers so Home proves the visible offer too.
  await import('./components/Tour.jsx')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  originalStore = useStore.getState()
  localStorage.clear()
  closeTour()
  useUI.setState({ sheets: [], toastMsg: '' })
  useStore.setState({
    S: { ...structuredClone(DEF), lang: 'en', langAuto: false },
    user: null, ready: true, needsMobileOnboarding: false, permSteps: false,
    boot: vi.fn(),
  })
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
})

afterEach(async () => {
  await act(async () => { root?.unmount(); closeTour() })
  host?.remove()
  useStore.setState(originalStore, true)
  localStorage.clear()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('LOCAL private-plan entry and the first-run tour', () => {
  it.each(['#/import-plan', '#/import-plan/synthetic-payload'])('keeps %s usable after the tour-offer timer', async hash => {
    await mount(hash)
    // The real PlanLink removes the payload from the visible address immediately.
    expect(window.location.hash).toBe('#/import-plan')
    await settle()
    expectImportUsable()
    if (hash === '#/import-plan') expect(host.querySelector('#plan-link-url')).not.toBeNull()
  })

  it('still visibly offers the tour on first-run Home', async () => {
    await mount('#/home')
    expect(tourState()).toBeNull()
    await settle()
    expect(tourState()).toEqual({ kind: 'offer' })
    expect(document.querySelector('.tour-ask [role="dialog"]')).not.toBeNull()
  })

  it('cancels a pending Home offer when the user opens the import form', async () => {
    await mount('#/home')
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    await go('#/import-plan')
    await settle()
    expectImportUsable()
  })

  it('can offer the tour after the user leaves the import form for Home', async () => {
    await mount('#/import-plan')
    await settle()
    expectImportUsable()
    await go('#/home')
    await settle()
    expect(tourState()).toEqual({ kind: 'offer' })
    expect(document.querySelector('.tour-ask [role="dialog"]')).not.toBeNull()
  })
})
