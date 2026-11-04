// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { directory } from '../lib/integrations.js'
import { searchSettings } from './settings-pages.js'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mocks = vi.hoisted(() => ({ calls: [], imports: 0, exports: 0 }))
vi.mock('../lib/local.js', () => ({ LOCAL: true }))
vi.mock('../store/useStore.js', () => {
  const snap = () => ({ S: {}, user: null, config: { integrations: { providers: ['webhook'] } }, coachLocal: null })
  const useStore = selector => selector ? selector(snap()) : snap()
  useStore.getState = snap
  return { useStore }
})
vi.mock('../store/useUI.js', () => {
  const snap = () => ({ toast: vi.fn(), openSheet: vi.fn() })
  const useUI = selector => selector ? selector(snap()) : snap()
  useUI.getState = snap
  return { useUI }
})
vi.mock('react-router-dom', () => ({ useNavigate: () => () => {} }))
vi.mock('../lib/api.js', () => ({ api: vi.fn(async (...args) => { mocks.calls.push(args); return {} }) }))
vi.mock('../lib/mobile.js', () => ({ MOBILE: false }))
vi.mock('../lib/demo.js', () => ({ DEMO: false }))
vi.mock('../lib/health-sync.js', () => ({
  healthStatus: vi.fn(), loadHealth: vi.fn(), onHealthChange: () => () => {}, disableHealth: vi.fn(), disableRead: vi.fn(),
}))
vi.mock('../sheets.jsx', () => ({
  importFromApp: vi.fn(() => { mocks.imports++ }), importFromHevy: vi.fn(), confirmSheet: vi.fn(), menuSheet: vi.fn(),
}))
vi.mock('../components/CsvExportSheet.jsx', () => ({ csvExportSheet: vi.fn(() => { mocks.exports++ }) }))

import IntegrationsPage from './Integrations.jsx'

let host, root
beforeEach(() => {
  mocks.calls = []; mocks.imports = 0; mocks.exports = 0
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
})
afterEach(() => { act(() => root.unmount()); host.remove() })

describe('LOCAL integrations', () => {
  it('offers file import and CSV export only', () => {
    const cards = directory({ local: true, user: null, mobile: false, mod: () => true })
      .flatMap(category => category.cards.map(card => card.id))
    expect(cards).toEqual(['files', 'csv'])
    act(() => root.render(<IntegrationsPage />))
    expect([...host.querySelectorAll('[data-card]')].map(node => node.dataset.card)).toEqual(['files', 'csv'])
    expect(host.querySelector('.intg-chips')).toBeNull()
    expect(host.querySelector('[data-card="webhook"]')).toBeNull()
    expect(host.querySelector('[data-card="apple-health"]')).toBeNull()
    expect(mocks.calls).toEqual([])
  })

  it('keeps file and CSV search hits without advertising remote or native integrations', () => {
    const ctx = { local: true, user: null, mobile: false, demo: false, mod: () => true }
    expect(searchSettings('Import a file', ctx).map(hit => hit.title)).toContain('Import a file')
    expect(searchSettings('Spreadsheet CSV', ctx).map(hit => hit.title)).toContain('Spreadsheet (CSV)')
    for (const term of ['Webhooks', 'Hevy', 'MCP', 'Garmin', 'Zepp']) {
      expect(searchSettings(term, ctx).some(hit => hit.page === 'zepp' || hit.page === 'integrations' && !['Import a file', 'Spreadsheet (CSV)'].includes(hit.title)), term).toBe(false)
    }
    expect(searchSettings('Apple Health', ctx).some(hit => hit.title === 'Apple Health' && hit.page === 'integrations')).toBe(false)
  })
})
