// Exercise the real plugin pipeline: CSS-only JS chunks can disappear after generateBundle.
// An install list containing one of those chunks prevents the LOCAL worker from activating.
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontend = join(dirname(fileURLToPath(import.meta.url)), '..')

describe('the built LOCAL offline shell', () => {
  it('only asks the worker to cache files the final build emitted', () => {
    const out = mkdtempSync(join(tmpdir(), 'gym-local-shell-'))
    try {
      execFileSync(process.execPath, [join(frontend, 'node_modules/vite/bin/vite.js'),
        'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error'], {
        cwd: frontend, stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'production', VITE_LOCAL: '1', VITE_MOBILE: '0', VITE_DEMO: '0' },
      })
      const sw = readFileSync(join(out, 'sw.js'), 'utf8')
      const literal = sw.match(/^const LAZY = (.+)$/m)?.[1]
      expect(literal).toBeTruthy()
      const files = JSON.parse(JSON.parse(literal))
      expect(files.length).toBeGreaterThan(0)
      const missing = files.filter(file => !existsSync(join(out, file)))
      expect(missing).toEqual([])
      expect(new Set(files).size).toBe(files.length)
    } finally { rmSync(out, { recursive: true, force: true }) }
  }, 180_000)
})
