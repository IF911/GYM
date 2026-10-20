// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.hoisted(() => vi.stubEnv('VITE_LOCAL', '1'))
const nav = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => nav }))
vi.mock('../lib/i18n.js', async original => ({ ...(await original()), getLang: () => 'ru' }))
vi.mock('../sheets.jsx', () => ({
  dayAssignSheet: vi.fn(), starterPlanSheet: vi.fn(), confirmSheet: vi.fn(), menuSheet: vi.fn(),
  planHasRoutines: s => s.routines.length > 0, exportPlanFile: vi.fn(), printWholePlan: vi.fn(), importPlanFile: vi.fn(),
}))
import Plan from './Plan.jsx'
import { useStore, DEF } from '../store/useStore.js'
import { menuSheet } from '../sheets.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true
let host, root, original
beforeEach(() => {
  original = useStore.getState().S
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  nav.mockClear(); menuSheet.mockClear()
})
afterEach(() => {
  act(() => root.unmount()); host.remove(); localStorage.removeItem('gym_plan_view')
  useStore.setState({ S: original })
})

describe('visible private plan import', () => {
  for (const view of ['schedule', 'routines']) for (const populated of [false, true]) {
    it(`opens the paste screen directly in ${view}, populated=${populated}`, () => {
      localStorage.setItem('gym_plan_view', view)
      const state = JSON.parse(JSON.stringify(DEF))
      if (populated) state.routines = [{ id: 'kept', name: 'Kept', ex: [{ id: '0025' }] }]
      useStore.setState({ S: state, config: {}, user: null })
      act(() => root.render(<Plan />))
      const button = [...host.querySelectorAll('button')].find(b => b.textContent.trim() === 'Добавить программу по ссылке')
      expect(button, 'link import must be visible without opening an icon menu').toBeTruthy()
      act(() => button.click())
      expect(nav).toHaveBeenCalledWith('/import-plan')
      expect(menuSheet).not.toHaveBeenCalled()
      expect(useStore.getState().S).toEqual(state)
    })
  }
})
