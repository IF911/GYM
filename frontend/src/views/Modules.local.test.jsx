// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MODULES } from '../lib/modules.js'
import { searchSettings } from './settings-pages.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => {
  const state = { S: { workouts: [], routines: [] }, calls: [] }
  state.snapshot = () => ({
    S: state.S, user: null, config: null, coachLocal: null,
    update: mut => { const next = structuredClone(state.S); mut(next); state.S = next },
  })
  return state
})
vi.mock('../lib/local.js', () => ({ LOCAL: true }))
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.snapshot()) : mocks.snapshot()
  useStore.getState = mocks.snapshot
  return { useStore }
})
vi.mock('../sheets.jsx', () => ({ confirmSheet: vi.fn() }))
vi.mock('../lib/api.js', () => ({ api: vi.fn((...args) => { mocks.calls.push(args); return Promise.resolve({}) }) }))
vi.mock('../lib/mobile.js', () => ({ MOBILE: false }))

import ModulesPage from './Modules.jsx'

let host, root
beforeEach(() => {
  mocks.S = { workouts: [], routines: [] }; mocks.calls = []
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('LOCAL modules', () => {
  it('shows only modules available in the local PWA', () => {
    act(() => root.render(<ModulesPage />))
    const visible = [...host.querySelectorAll('.module-row .lrow-t')].map(node => node.textContent)
    expect(visible).toEqual(MODULES.filter(m => !['watch', 'health', 'coach', 'integrations'].includes(m.id)).map(m => m.title))
    expect(host.textContent).not.toContain('Apple Health or Health Connect')
    expect(host.textContent).not.toContain('AI Coach')
    expect(mocks.calls).toEqual([])
  })

  it('hides unavailable modules and native/server features from Settings search', () => {
    const ctx = { local: true, user: null, mobile: false, demo: false, mod: () => true }
    for (const title of ['Watch', 'Health', 'AI Coach', 'Integrations']) {
      expect(searchSettings(title, ctx).some(hit => hit.page === 'modules' && hit.title === title), title).toBe(false)
    }
    for (const term of ['Webhooks', 'MCP', 'Garmin', 'Zepp']) {
      expect(searchSettings(term, ctx).some(hit => hit.page === 'zepp' || hit.page === 'integrations' && !['Import a file', 'Spreadsheet (CSV)'].includes(hit.title)), term).toBe(false)
    }
  })
})
