#!/usr/bin/env node
/*
 * Browser smoke check for a static local GYM upgrade.
 *
 * Usage: node frontend/scripts/check-local-upgrade.mjs <old-dist> <new-dist>
 * The two directories are served successively by one small server, so the
 * browser keeps exactly the same origin and storage during the update.
 */
import assert from 'node:assert/strict'
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { extname, join, normalize, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = '/GYM/'
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.gz': 'application/gzip',
}

function loadPlaywright() {
  return import('playwright')
}

function staticServer(initialDir) {
  let dir = resolve(initialDir)
  const server = http.createServer((req, res) => {
    try {
      const raw = new URL(req.url, 'http://127.0.0.1').pathname
      if (!raw.startsWith(ROOT) || req.method !== 'GET' && req.method !== 'HEAD') return void (res.statusCode = 404, res.end())
      const rel = decodeURIComponent(raw.slice(ROOT.length))
      if (rel.includes('\0') || rel.split('/').includes('..')) return void (res.statusCode = 400, res.end('bad path'))
      let path = join(dir, normalize(rel || 'index.html'))
      if (!path.startsWith(dir + '/') && path !== dir) return void (res.statusCode = 403, res.end())
      if (!existsSync(path) || !statSync(path).isFile()) {
        path = join(dir, 'index.html')
        if (!existsSync(path)) return void (res.statusCode = 404, res.end())
      }
      res.setHeader('content-type', MIME[extname(path).toLowerCase()] || 'application/octet-stream')
      res.setHeader('cache-control', 'no-store')
      if (req.method === 'HEAD') return void res.end()
      createReadStream(path).on('error', () => { if (!res.headersSent) res.statusCode = 500; res.end() }).pipe(res)
    } catch (e) { res.statusCode = 400; res.end(String(e.message || e)) }
  })
  return { server, setDir: d => { dir = resolve(d) } }
}

const withTimeout = async (promise, ms, message) => {
  let timer
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms) })])
  } finally { clearTimeout(timer) }
}

async function main(oldDir, newDir) {
  for (const d of [oldDir, newDir]) assert.ok(existsSync(join(d, 'index.html')), `${d}: index.html missing`)
  const oldIndex = readFileSync(join(oldDir, 'index.html'), 'utf8')
  const newIndex = readFileSync(join(newDir, 'index.html'), 'utf8')
  const oldSw = existsSync(join(oldDir, 'sw.js')) ? readFileSync(join(oldDir, 'sw.js'), 'utf8') : null
  const newSw = existsSync(join(newDir, 'sw.js')) ? readFileSync(join(newDir, 'sw.js'), 'utf8') : null
  const workerChanged = oldSw !== newSw
  const buildsEqual = oldIndex === newIndex && !workerChanged
  const newModuleSrc = newIndex.match(/<script\s+[^>]*type=["']module["'][^>]*src=["']([^"']+)["']/i)?.[1]
  assert.ok(newModuleSrc, `${newDir}/index.html: module script src missing`)
  const { chromium } = await loadPlaywright()
  const { server, setDir } = staticServer(oldDir)
  const temp = await mkdtemp(join(tmpdir(), 'gym-upgrade-'))
  let browser, context
  const requests = [], pageErrors = []
  try {
    const port = await new Promise((resolvePort, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolvePort(server.address().port)) })
    const origin = `http://127.0.0.1:${port}${ROOT}`
    browser = await chromium.launch(process.env.GYM_CHROMIUM_EXECUTABLE ? { headless: true, executablePath: process.env.GYM_CHROMIUM_EXECUTABLE } : { headless: true })
    context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, locale: 'en-US', acceptDownloads: true })
    const page = await context.newPage()
    context.on('request', req => requests.push({ method: req.method(), url: req.url() }))
    page.on('pageerror', e => pageErrors.push(e.message))
    const local = url => url.startsWith(origin)
    const assertCleanRequests = stage => {
      const bad = requests.filter(r => !local(r.url) || r.method !== 'GET' || new URL(r.url).pathname.startsWith(`${ROOT}api/`))
      assert.deepEqual(bad, [], `${stage}: external/API/write request(s): ${JSON.stringify(bad)}`)
    }
    await page.goto(origin, { waitUntil: 'networkidle' })
    await withTimeout(page.evaluate(() => navigator.serviceWorker.ready), 10000, 'old service worker did not become ready')
    await withTimeout(page.waitForFunction(() => !!navigator.serviceWorker.controller), 10000, 'old service worker did not control the page')
    // This shared smoke test uses English selectors. Pick English deliberately after the
    // one-time Russian default migration, just as Settings does; upgrades must respect it.
    await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('gym_state_v1') || '{"weighIn":false,"gifSize":"mini"}')
      s.lang = 'en'; s.langAuto = false
      localStorage.setItem('gym_state_v1', JSON.stringify(s))
      localStorage.setItem('gym_ru_default_v1', '1')
    })
    await page.reload({ waitUntil: 'networkidle' })
    await page.goto(origin + '#/plan', { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Load starter plan', exact: true }).click()
    await page.getByRole('button', { name: /Full Body.*3 days/ }).click()
    await page.getByRole('button', { name: 'Start', exact: true }).click()
    await page.waitForURL('**/#/workout')
    await page.getByRole('heading', { name: 'Start workout', exact: true }).waitFor()
    await page.getByText('Full Body A', { exact: true }).click()
    await page.getByRole('checkbox', { name: 'Set 1 done', exact: true }).waitFor()
    await page.locator('.setrow').first().locator('input').nth(0).fill('60')
    await page.locator('.setrow').first().locator('input').nth(1).fill('8')
    await page.getByRole('checkbox', { name: 'Set 1 done', exact: true }).click()
    await page.getByRole('button', { name: 'Finish', exact: true }).click()
    await page.getByRole('button', { name: 'Finish and save', exact: true }).click()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('gym_state_v1') || '{}').workouts?.length === 1)
    await page.getByRole('button', { name: 'Nice!', exact: true }).click()

    const media = { hash: 'a'.repeat(64), mime: 'image/png', size: 8, width: 1, height: 1, at: 1 }
    const state = await page.evaluate(media => {
      const s = JSON.parse(localStorage.getItem('gym_state_v1'))
      s.bodyweight = [{ date: '2026-10-20', weight: 82 }]
      s.customEx = [{ id: 'qa-custom', n: 'QA local media', bp: 'back', custom: true, media }]
      localStorage.setItem('gym_state_v1', JSON.stringify(s))
      return s
    }, media)
    await page.evaluate(async ({ media, bytes }) => {
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open('opengym-media', 1); r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('blobs')) r.result.createObjectStore('blobs', { keyPath: 'hash' }) }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error) })
      await new Promise((resolve, reject) => { const tx = db.transaction('blobs', 'readwrite'); tx.objectStore('blobs').put({ ...media, blob: new Blob([new Uint8Array(bytes)], { type: media.mime }), putAt: 1, shownAt: 0, pending: true, rejected: false }); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error) })
      db.close()
    }, { media, bytes: [137, 80, 78, 71, 13, 10, 26, 10] })
    // Blob.arrayBuffer cannot be awaited from an IDB request handler in older engines; read it separately.
    const mediaBytesBefore = await page.evaluate(async () => new Promise((resolve, reject) => { const r = indexedDB.open('opengym-media'); r.onsuccess = () => { const q = r.result.transaction('blobs').objectStore('blobs').get('a'.repeat(64)); q.onsuccess = async () => resolve([...new Uint8Array(await (q.result.blob ? q.result.blob.arrayBuffer() : q.result.data))]); q.onerror = () => reject(q.error) }; r.onerror = () => reject(r.error) }))
    await page.reload({ waitUntil: 'networkidle' })
    await page.goto(origin + '#/settings/data', { waitUntil: 'domcontentloaded' })
    await page.getByText('Export backup (JSON)', { exact: true }).waitFor()
    const dlWait = page.waitForEvent('download')
    await page.getByText('Export backup (JSON)', { exact: true }).click()
    const download = await dlWait
    const backupPath = join(temp, 'backup.json')
    await download.saveAs(backupPath)
    const backup = JSON.parse(await (await import('node:fs/promises')).readFile(backupPath, 'utf8'))
    assert.equal(backup.workouts.length, 1, 'JSON export lost workout')
    assert.ok(backup.customEx.some(x => x.id === 'qa-custom'), 'JSON export lost custom exercise')

    await page.goto(origin + '#/workout', { waitUntil: 'domcontentloaded' })
    await page.getByText('Full Body A', { exact: true }).click()
    await page.getByRole('checkbox', { name: 'Set 1 done', exact: true }).waitFor()
    await page.locator('.setrow').first().locator('input').nth(0).fill('40')
    await page.locator('.setrow').first().locator('input').nth(1).fill('6')
    await page.getByRole('checkbox', { name: 'Set 1 done', exact: true }).click()
    const activeBeforeUpdate = await page.evaluate(() => JSON.parse(localStorage.getItem('gym_state_v1')).active)
    assert.ok(activeBeforeUpdate, 'second workout must still be active during update')
    await page.goto(origin + '#/settings/about', { waitUntil: 'domcontentloaded' })
    const hasUpdateUI = await page.getByText('Check for GYM updates', { exact: true }).count() > 0
    const oldModuleSrc = await page.locator('script[type="module"]').first().getAttribute('src')
    await page.evaluate(() => {
      // Unsaved DOM state must survive receiving the update. The app offers a reload; it
      // must never navigate a resident iPhone client out from under an open form/workout.
      const field = document.createElement('input')
      field.id = 'qa-unsaved-input'; field.value = 'Keep my unfinished input'
      document.body.appendChild(field)
      window.__gymControllerChanges = 0
      navigator.serviceWorker.addEventListener('controllerchange', () => { window.__gymControllerChanges++ })
    })
    setDir(newDir)
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration(); if (r) await r.update()
    })
    if (workerChanged) await withTimeout(page.waitForFunction(() => window.__gymControllerChanges > 0), 10000, 'changed service worker did not trigger controllerchange')
    assert.equal(await page.locator('script[type="module"]').first().getAttribute('src'), oldModuleSrc, 'update unexpectedly reloaded a resident client')
    assert.equal(await page.locator('#qa-unsaved-input').inputValue(), 'Keep my unfinished input', 'update discarded unsaved input')
    if (hasUpdateUI && oldIndex !== newIndex) {
      await page.getByRole('button', { name: 'Update', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Update', exact: true }).click()
      await page.waitForLoadState('networkidle')
    } else {
      // A client from before the updater UI needs one real restart. There is no listener
      // in that older bundle; forcing WindowClient.navigate would discard open input.
      await page.reload({ waitUntil: 'networkidle' })
    }
    await page.goto(origin + '#/settings/data', { waitUntil: 'domcontentloaded' })
    await page.getByText('Export backup (JSON)', { exact: true }).waitFor()
    const loadedModuleSrc = await page.locator('script[type="module"]').first().getAttribute('src')
    assert.equal(new URL(loadedModuleSrc, origin).href, new URL(newModuleSrc, origin).href, 'page loaded a module script other than new-index script')
    const afterUpdate = await page.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('gym_state_v1') || '{}')
      const q = await new Promise((resolve, reject) => { const r = indexedDB.open('opengym-media'); r.onsuccess = () => { const x = r.result.transaction('blobs').objectStore('blobs').get('a'.repeat(64)); x.onsuccess = () => resolve(x.result); x.onerror = () => reject(x.error) }; r.onerror = () => reject(r.error) })
      return { state: s, media: q ? [...new Uint8Array(await (q.blob ? q.blob.arrayBuffer() : q.data))] : null }
    })
    assert.deepEqual(afterUpdate.state.workouts, state.workouts, 'workouts changed across deployment')
    assert.deepEqual(afterUpdate.state.routines, state.routines, 'routines changed across deployment')
    assert.deepEqual(afterUpdate.state.customEx, state.customEx, 'custom exercises changed across deployment')
    assert.deepEqual(afterUpdate.state.bodyweight, state.bodyweight, 'bodyweight changed across deployment')
    assert.deepEqual(afterUpdate.state.active, activeBeforeUpdate, 'active workout changed across deployment')
    assert.deepEqual(afterUpdate.media, mediaBytesBefore, 'IndexedDB media bytes changed across deployment')

    await context.setOffline(true)
    await page.evaluate(() => {
      localStorage.clear()
      localStorage.setItem('gym_ru_default_v1', '1')
      localStorage.setItem('gym_state_v1', JSON.stringify({ lang: 'en', langAuto: false, weighIn: false }))
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText('Export backup (JSON)', { exact: true }).waitFor()
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('gym_state_v1') || '{}').workouts?.length || 0), 0, 'disposable state was not cleared')
    await page.locator('input[type=file]').first().setInputFiles(backupPath)
    await page.getByRole('button', { name: 'Import', exact: true }).click()
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('gym_state_v1') || '{}').workouts?.length === 1)
    const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('gym_state_v1')))
    assert.deepEqual(restored.workouts, backup.workouts, 'offline JSON import changed workouts')
    assert.ok(restored.customEx.some(x => x.id === 'qa-custom'), 'offline JSON import lost custom exercise')
    assertCleanRequests('upgrade check')
    assert.deepEqual(pageErrors, [], `page errors: ${JSON.stringify(pageErrors)}`)
    const result = { oldDir: resolve(oldDir), newDir: resolve(newDir), buildsEqual, workerChanged, mobileViewport: '390x844', serviceWorkerUpgrade: workerChanged ? 'controllerchange observed' : 'same build accepted', deliberateUpdateUI: hasUpdateUI && oldIndex !== newIndex, unsavedInputKeptUntilRestart: true, activeWorkoutKept: true, workout: true, routines: state.routines.length, bodyweight: true, customExercise: true, mediaBytes: mediaBytesBefore.length, jsonExport: true, offlineJsonImport: true, externalApiOrWriteRequests: 0, pageErrors: 0 }
    console.log(JSON.stringify(result, null, 2))
  } finally {
    await context?.close().catch(() => {})
    await browser?.close().catch(() => {})
    await new Promise(resolve => server.close(resolve))
    await rm(temp, { recursive: true, force: true })
  }
}

const [oldDir, newDir] = process.argv.slice(2).map(path => resolve(path))
if (!oldDir || !newDir) { console.error('Usage: node frontend/scripts/check-local-upgrade.mjs <old-dist> <new-dist>'); process.exit(2) }
main(oldDir, newDir).catch(error => { console.error(`✗ local upgrade check failed: ${error.stack || error}`); process.exitCode = 1 })
