// @vitest-environment happy-dom
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('../lib/local.js', () => ({ LOCAL: true }))
vi.mock('../lib/i18n.js', () => ({ t: value => value }))
vi.mock('./Icon.jsx', () => ({ default: ({ name }) => <span data-icon={name} /> }))
vi.mock('../lib/platform-now.js', () => ({ platformNow: () => 'web' }))

import YouTubeVideo from './YouTubeVideo.jsx'

let host, root, open
beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host)
  open = vi.fn()
  Object.defineProperty(window, 'open', { configurable: true, value: open })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  delete window.open
})

describe('LOCAL YouTube video card', () => {
  it('keeps external playback explicit and never embeds an in-app iframe', () => {
    act(() => root.render(<YouTubeVideo videoId="abc123" />))

    expect(host.querySelector('iframe')).toBeNull()
    expect(host.textContent).toContain('Opens in YouTube')
    expect(open).not.toHaveBeenCalled()

    act(() => host.querySelector('button').click())

    expect(host.querySelector('iframe')).toBeNull()
    expect(open).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledWith('https://www.youtube.com/watch?v=abc123', '_blank', 'noopener,noreferrer')
  })
})
