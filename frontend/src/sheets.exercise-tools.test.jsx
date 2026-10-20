// @vitest-environment happy-dom
import React, { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot } from 'react-dom/client'
import { EXIDX } from './lib/exercises.js'
import { DEF, useStore } from './store/useStore.js'
import { useUI } from './store/useUI.js'
import { exConfigSheet, exerciseDetailSheet } from './sheets.jsx'

const mounted = []
const renderTop = () => {
  const sheet = useUI.getState().sheets.at(-1)
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  mounted.push(root)
  act(() => root.render(sheet.render(() => useUI.getState().closeSheet(sheet.id))))
  return host
}
const text = host => host.textContent
const h4s = host => [...host.querySelectorAll('h4')].map(el => el.textContent.trim())

describe('exercise weight tools call-site policy', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    useUI.setState({ sheets: [], toasts: [] })
    useStore.setState({ S: { ...JSON.parse(JSON.stringify(DEF)), unit: 'kg', loadKind: {} }, user: null })
    document.body.innerHTML = ''
  })
  afterEach(() => act(() => mounted.splice(0).forEach(root => root.unmount())))

  it('hides both headings for a jump even with a stale pairs override', () => {
    const id = '4209'
    useStore.setState(s => ({ S: { ...s.S, loadKind: { [id]: { kind: 'pairs', _ts: 1 } } } }))
    act(() => exerciseDetailSheet(EXIDX[id]))
    const headings = h4s(renderTop())
    expect(headings).not.toContain('Plate loading')
    expect(headings).not.toContain('Estimated 1RM')
  })

  it.each(['0276', '3299'])('hides both headings for bodyweight/core exercise %s', id => {
    act(() => exerciseDetailSheet(EXIDX[id]))
    const headings = h4s(renderTop())
    expect(headings).not.toContain('Plate loading')
    expect(headings).not.toContain('Estimated 1RM')
  })

  it('shows both strength tools for a barbell exercise and leaves the calculator blank', () => {
    act(() => exerciseDetailSheet(EXIDX['0043']))
    const host = renderTop()
    expect(h4s(host)).toEqual(expect.arrayContaining(['Plate loading', 'Estimated 1RM']))
    const values = [...host.querySelectorAll('.stp-w input')].map(input => input.value)
    expect(values.slice(-2)).toEqual(['', ''])
  })

  it('shows 1RM for cable work but no plate loading', () => {
    act(() => exerciseDetailSheet(EXIDX['7583']))
    expect(h4s(renderTop())).toEqual(expect.arrayContaining(['Estimated 1RM']))
    expect(h4s(document.body)).not.toContain('Plate loading')
  })

  it('offers an explicit lever-machine plate opt-in and reveals the editor', () => {
    const ex = EXIDX['1455']
    act(() => exConfigSheet(ex, { sets: 3, reps: 8, weight: 0, mode: 'reps' }, vi.fn()))
    const host = renderTop()
    const optIn = [...host.querySelectorAll('button')].find(button => button.textContent.includes('machine uses plates') || button.textContent.includes('тренажёр с блинами'))
    expect(optIn).toBeTruthy()
    expect(text(host)).not.toContain('Plate loading')
    act(() => optIn.click())
    expect(text(host)).toContain('Plate loading')
  })
})
