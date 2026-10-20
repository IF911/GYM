// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Settings from './Settings.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: null }
  state.snapshot = () => ({
    S: state.S, user: null, coachLocal: null, sync: null, config: null,
    update: vi.fn(), importConflict: vi.fn(() => Promise.resolve(null)), importBackup: vi.fn(),
    setUnit: vi.fn(), resetEverything: vi.fn(), setUser: vi.fn(), pullState: vi.fn(), pushState: vi.fn(),
    resetDemo: vi.fn(),
  })
  return state
})

vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore, DEF: { reminder: { time: '17:30' } }, hasData: () => false }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: vi.fn(), openSheet: vi.fn() })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../lib/local.js', () => ({ LOCAL: true }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(), webauthnOK: () => true, passkeyRegister: vi.fn(), passkeyError: vi.fn(), IS_ANDROID: false }))
vi.mock('../lib/push.js', () => ({ pushSupported: () => false, enablePush: vi.fn(), disablePush: vi.fn(), sendTestPush: vi.fn(), syncPushSubscription: vi.fn() }))
vi.mock('../lib/wakelock.js', () => ({ wakeLockSupported: () => false }))
vi.mock('../lib/mobile.js', () => ({ MOBILE: false, isAndroid: () => Promise.resolve(false), shareExport: vi.fn(), shareExportBlob: vi.fn(), syncReminder: vi.fn() }))
vi.mock('../sheets.jsx', () => ({ starterPlanSheet: vi.fn(), confirmSheet: vi.fn(), importFromApp: vi.fn(), importFromHevy: vi.fn(), equipmentProfileSheet: vi.fn(), plateInventorySheet: vi.fn(), dumbbellInventorySheet: vi.fn(), menuSheet: vi.fn() }))

globalThis.__APP_VERSION__ ??= 'test'

let host, root
beforeEach(() => {
  mocks.S = {
    unit: 'kg', restSec: 90, restPauseSec: 15, sound: false, effort: 'none', gifSize: 'full',
    workouts: [], routines: [], exWeights: {}, reminder: { on: false },
  }
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('Settings in the local PWA build', () => {
  it('describes local storage and offers backup from the account page', () => {
    act(() => root.render(<Settings page="account" />))
    expect(host.textContent).toContain('All data stays on this phone')
    expect(host.textContent).toContain('Back it up anytime in Data & backup.')
    expect(host.textContent).not.toContain('Create passkey profile')
    expect(host.textContent).not.toContain('Sign in with passkey')
    expect(host.textContent).not.toContain('Connect to my server')
  })

  it('keeps JSON backup and import while hiding Hevy API import', () => {
    act(() => root.render(<Settings page="data" />))
    expect(host.textContent).toContain('Export backup (JSON)')
    expect(host.textContent).toContain('Import backup')
    expect(host.textContent).toContain('Import from another app')
    expect(host.textContent).not.toContain('Import from Hevy')
  })
})
