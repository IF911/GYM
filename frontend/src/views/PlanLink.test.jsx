// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  incoming: 'payload-1',
  nav: vi.fn(),
  decode: vi.fn(),
  extract: vi.fn(),
  parse: vi.fn(),
  importSheet: vi.fn(),
  state: { S: { unit: 'lb' } },
}))

vi.mock('react-router-dom', () => ({
  useNavigate: () => mocks.nav,
  useParams: () => ({ payload: mocks.incoming }),
}))
vi.mock('../lib/plan-link.js', () => ({
  decodePlanLink: (...args) => mocks.decode(...args),
  extractPlanLinkPayload: (...args) => mocks.extract(...args),
  PLAN_LINK_LIMITS: { maxPayloadLength: 64 * 1024, maxPlaintextBytes: 512 * 1024 },
}))
vi.mock('../lib/plan-share.js', () => ({ parsePlan: (...args) => mocks.parse(...args) }))
vi.mock('../sheets.jsx', () => ({ planImportSheet: (...args) => mocks.importSheet(...args) }))
vi.mock('../store/useStore.js', () => {
  const useStore = selector => selector ? selector(mocks.state) : mocks.state
  useStore.getState = () => mocks.state
  return { useStore }
})
vi.mock('../lib/i18n.js', () => ({ getLang: () => 'en', useLang: () => {} }))
vi.mock('../components/ui.jsx', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
  TextArea: props => <textarea {...props} />,
  TextField: props => <input {...props} />,
}))

import PlanLink from './PlanLink.jsx'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

let host, root
const mount = async () => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  await act(async () => { root.render(<PlanLink />) })
}
const input = type => host.querySelector(`input[type="${type}"]`)
const submit = () => host.querySelector('button[type="submit"]')
const typeInto = (element, value) => act(() => {
  const setter = Object.getOwnPropertyDescriptor(element.constructor.prototype, 'value').set
  setter.call(element, value)
  element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event('change', { bubbles: true }))
})
const flush = async () => act(async () => { await Promise.resolve(); await Promise.resolve() })

beforeEach(() => {
  mocks.incoming = 'payload-1'
  mocks.nav.mockReset()
  mocks.decode.mockReset().mockResolvedValue({ opengym_plan: 1 })
  mocks.extract.mockReset().mockReturnValue('pasted-payload')
  mocks.parse.mockReset().mockReturnValue({ routineCount: 1, exerciseCount: 1, routines: [{ id: 'r1' }] })
  mocks.importSheet.mockReset()
  mocks.state.S = { unit: 'lb' }
  vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  act(() => root?.unmount())
  host?.remove()
})

describe('PlanLink', () => {
  it('scrubs an incoming payload route from history before decrypting', async () => {
    const pending = new Promise(() => {})
    mocks.decode.mockReturnValue(pending)
    await mount()
    expect(window.history.replaceState).toHaveBeenCalledWith(window.history.state, '', window.location.pathname + '#/import-plan')
    expect(mocks.decode).not.toHaveBeenCalled()
  })

  it('keeps the diary untouched and shows one generic error for a wrong code', async () => {
    mocks.decode.mockRejectedValue({ code: 'invalid', message: 'secret details must stay hidden' })
    await mount()
    typeInto(input('password'), 'wrong-code')
    await act(async () => submit().click())
    await flush()
    expect(host.querySelector('[role="alert"]').textContent).toContain('Could not open the plan')
    expect(host.querySelector('[role="alert"]').textContent).not.toContain('secret')
    expect(mocks.importSheet).not.toHaveBeenCalled()
    expect(mocks.nav).not.toHaveBeenCalled()
  })

  it('normalizes the decrypted raw plan in the current unit before opening preview', async () => {
    const raw = { opengym_plan: 1, name: 'Imported' }
    const bundle = { routineCount: 1, exerciseCount: 2, routines: [{ id: 'r1' }] }
    mocks.decode.mockResolvedValue(raw)
    mocks.parse.mockReturnValue(bundle)
    await mount()
    typeInto(input('password'), 'correct-code')
    await act(async () => submit().click())
    await flush()
    expect(mocks.decode).toHaveBeenCalledWith('payload-1', 'correct-code')
    expect(mocks.parse).toHaveBeenCalledWith(raw, 'lb')
    expect(mocks.nav).toHaveBeenCalledWith('/plan', { replace: true })
    expect(mocks.importSheet).toHaveBeenCalledWith(bundle)
  })

  it('does not open a sheet after unmount while decrypt is pending', async () => {
    let resolve
    mocks.decode.mockReturnValue(new Promise(r => { resolve = r }))
    await mount()
    typeInto(input('password'), 'correct-code')
    await act(async () => submit().click())
    act(() => root.unmount())
    resolve({ opengym_plan: 1 })
    await flush()
    expect(mocks.parse).toHaveBeenCalled()
    expect(mocks.importSheet).not.toHaveBeenCalled()
    expect(mocks.nav).not.toHaveBeenCalled()
  })
})
