import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { prepareUpdate, promoteUpdate, reportUpdate, isProtected } from './upstream-sync.mjs'

// A clean CI runner must not depend on a developer's implicit Git identity.
process.env.GIT_CONFIG_COUNT = '1'
process.env.GIT_CONFIG_KEY_0 = 'user.useConfigOnly'
process.env.GIT_CONFIG_VALUE_0 = 'true'

const gitEnv = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'upstream-sync fixture',
  GIT_AUTHOR_EMAIL: 'upstream-sync-fixture@example.test',
  GIT_COMMITTER_NAME: 'upstream-sync fixture',
  GIT_COMMITTER_EMAIL: 'upstream-sync-fixture@example.test'
}

function git(cwd, args, { allowFailure = false } = {}) {
  try {
    return execFileSync('git', args, { cwd, env: gitEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    if (allowFailure) return error
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${error.stderr?.toString() || error.message}`)
  }
}

function commit(cwd, message) {
  git(cwd, ['add', '-A'])
  git(cwd, ['commit', '-m', message])
  return git(cwd, ['rev-parse', 'HEAD'])
}

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'upstream-sync-'))
  const upstream = join(root, 'upstream')
  const cwd = join(root, 'cwd')
  mkdirSync(upstream)
  git(upstream, ['init', '-b', 'main'])
  writeFileSync(join(upstream, 'README.md'), 'base\n')
  mkdirSync(join(upstream, '.github', 'workflows'), { recursive: true })
  writeFileSync(join(upstream, '.github', 'workflows', 'pages.yml'), 'name: base\n')
  mkdirSync(join(upstream, 'frontend'))
  writeFileSync(join(upstream, 'frontend', 'package.json'), JSON.stringify({ version: '1.0.0', scripts: {
    test: 'vitest run', 'build:local': 'node scripts/build-local.mjs', 'test:fatigue-probe': 'node fatigue.mjs'
  } }, null, 2) + '\n')
  const base = commit(upstream, 'base')
  git(root, ['clone', upstream, cwd])
  return { root, upstream, cwd, base }
}

function status(cwd) {
  return git(cwd, ['status', '--porcelain=v1'])
}

function result(outDir) {
  return JSON.parse(readFileSync(join(outDir, 'result.json'), 'utf8'))
}

test('no upstream change is a noop and does not create an update bundle', t => {
  const f = fixtureRoot()
  t.after(() => rmSync(f.root, { recursive: true, force: true }))
  const outDir = join(f.root, 'out')
  const response = prepareUpdate({ cwd: f.cwd, outDir, upstream: f.upstream })
  assert.equal(response.state, 'noop')
  assert.equal(response.base, f.base)
  assert.equal(response.upstream, f.base)
  assert.deepEqual(result(outDir), response)
  assert.equal(existsSync(join(outDir, 'candidate.bundle')), false)
  assert.equal(status(f.cwd), '')
})

test('verify mode reports no update without changing the checkout', t => {
  const f = fixtureRoot()
  t.after(() => rmSync(f.root, { recursive: true, force: true }))
  const before = git(f.cwd, ['rev-parse', 'HEAD'])
  const response = prepareUpdate({ cwd: f.cwd, outDir: join(f.root, 'out'), upstream: f.upstream, verify: true })
  assert.equal(response.state, 'verify')
  assert.equal(response.base, before)
  assert.equal(response.upstream, before)
  assert.equal(git(f.cwd, ['rev-parse', 'HEAD']), before)
  assert.equal(status(f.cwd), '')
})

test('clean upstream merge retains local-only files, has both parents, and writes a valid bundle', t => {
  const f = fixtureRoot()
  t.after(() => rmSync(f.root, { recursive: true, force: true }))
  writeFileSync(join(f.cwd, 'LOCAL_ONLY.md'), 'keep me\n')
  const base = commit(f.cwd, 'local-only change')
  writeFileSync(join(f.upstream, 'README.md'), 'base\nupstream change\n')
  const upstream = commit(f.upstream, 'upstream change')
  const outDir = join(f.root, 'out')
  const response = prepareUpdate({ cwd: f.cwd, outDir, upstream: f.upstream })
  assert.equal(response.state, 'update')
  assert.equal(response.base, base)
  assert.equal(response.upstream, upstream)
  assert.ok(response.candidate)
  assert.equal(readFileSync(join(f.cwd, 'LOCAL_ONLY.md'), 'utf8'), 'keep me\n')
  const parents = git(f.cwd, ['rev-list', '--parents', '-n', '1', 'HEAD']).split(' ')
  assert.deepEqual(parents.slice(1).sort(), [base, upstream].sort())
  assert.equal(status(f.cwd), '')
  git(f.cwd, ['bundle', 'verify', join(outDir, 'candidate.bundle')])
  assert.ok(git(outDir, ['bundle', 'list-heads', join(outDir, 'candidate.bundle')]).includes(response.candidate))
  assert.deepEqual(result(outDir), response)
})

test('text conflict aborts the temporary merge and restores the base file', t => {
  const f = fixtureRoot()
  t.after(() => rmSync(f.root, { recursive: true, force: true }))
  writeFileSync(join(f.cwd, 'README.md'), 'base\nlocal\n')
  const base = commit(f.cwd, 'local conflicting change')
  writeFileSync(join(f.upstream, 'README.md'), 'base\nupstream\n')
  const upstream = commit(f.upstream, 'upstream conflicting change')
  const response = prepareUpdate({ cwd: f.cwd, outDir: join(f.root, 'out'), upstream: f.upstream })
  assert.equal(response.state, 'blocked')
  assert.equal(response.base, base)
  assert.equal(response.upstream, upstream)
  assert.equal(readFileSync(join(f.cwd, 'README.md'), 'utf8'), 'base\nlocal\n')
  assert.equal(git(f.cwd, ['rev-parse', 'HEAD']), base)
  assert.ok(git(f.cwd, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { allowFailure: true }).status)
  assert.equal(status(f.cwd), '')
})

test('protected workflow edits are blocked before changing the checkout', t => {
  const f = fixtureRoot()
  t.after(() => rmSync(f.root, { recursive: true, force: true }))
  const base = git(f.cwd, ['rev-parse', 'HEAD'])
  writeFileSync(join(f.upstream, '.github', 'workflows', 'pages.yml'), 'name: protected change\n')
  const upstream = commit(f.upstream, 'upstream workflow change')
  const response = prepareUpdate({ cwd: f.cwd, outDir: join(f.root, 'out'), upstream: f.upstream })
  assert.equal(response.state, 'blocked')
  assert.equal(response.base, base)
  assert.equal(response.upstream, upstream)
  assert.ok(response.reason)
  assert.equal(git(f.cwd, ['rev-parse', 'HEAD']), base)
  assert.equal(readFileSync(join(f.cwd, '.github', 'workflows', 'pages.yml'), 'utf8'), 'name: base\n')
  assert.equal(status(f.cwd), '')
})

test('dirty checkout refuses without changing files or HEAD', t => {
  const f = fixtureRoot()
  t.after(() => rmSync(f.root, { recursive: true, force: true }))
  const before = git(f.cwd, ['rev-parse', 'HEAD'])
  writeFileSync(join(f.cwd, 'README.md'), 'uncommitted\n')
  assert.throws(() => prepareUpdate({ cwd: f.cwd, outDir: join(f.root, 'out'), upstream: f.upstream }), /dirty checkout/)
  assert.equal(git(f.cwd, ['rev-parse', 'HEAD']), before)
  assert.equal(readFileSync(join(f.cwd, 'README.md'), 'utf8'), 'uncommitted\n')
  assert.equal(status(f.cwd).trim(), 'M README.md')
})

test('promotion pushes the exact validated merge and dispatches its SHA', async t => {
  const f = fixtureRoot()
  t.after(() => rmSync(f.root, { recursive: true, force: true }))
  writeFileSync(join(f.cwd, 'LOCAL_ONLY.md'), 'private-mode guard\n')
  const base = commit(f.cwd, 'local change')
  const origin = join(f.root, 'origin.git')
  git(f.root, ['clone', '--bare', f.cwd, origin])
  git(f.cwd, ['remote', 'set-url', 'origin', origin])
  writeFileSync(join(f.upstream, 'feature.txt'), 'new feature\n')
  commit(f.upstream, 'feature')
  const dir = join(f.root, 'out')
  const r = prepareUpdate({ cwd: f.cwd, outDir: dir, upstream: f.upstream })
  git(f.cwd, ['checkout', '--detach', base])
  const calls = []
  await promoteUpdate({ cwd: f.cwd, dir, dispatch: async sha => calls.push(sha) })
  assert.equal(git(origin, ['rev-parse', 'main']), r.candidate)
  assert.deepEqual(calls, [r.candidate])
  assert.equal(git(f.cwd, ['rev-parse', 'HEAD']), base, 'privileged checkout must stay on trusted code')
})

test('promotion stops if main moved while compatibility checks were running', async t => {
  const f = fixtureRoot()
  t.after(() => rmSync(f.root, { recursive: true, force: true }))
  const origin = join(f.root, 'origin.git')
  git(f.root, ['clone', '--bare', f.cwd, origin])
  git(f.cwd, ['remote', 'set-url', 'origin', origin])
  writeFileSync(join(f.upstream, 'feature.txt'), 'feature\n')
  commit(f.upstream, 'feature')
  const dir = join(f.root, 'out')
  const r = prepareUpdate({ cwd: f.cwd, outDir: dir, upstream: f.upstream })
  git(f.cwd, ['checkout', '--detach', r.base])
  writeFileSync(join(f.cwd, 'parallel.txt'), 'parallel edit\n')
  const other = commit(f.cwd, 'parallel edit')
  git(f.cwd, ['push', 'origin', `${other}:refs/heads/main`])
  git(f.cwd, ['checkout', '--detach', r.base])
  await assert.rejects(promoteUpdate({ cwd: f.cwd, dir, dispatch: async () => assert.fail('must not dispatch') }), /main changed/)
  assert.equal(git(origin, ['rev-parse', 'main']), other)
})

test('local diary, backup, network boundaries and the automation itself are protected', () => {
  for (const file of ['frontend/src/store/useStore.js', 'frontend/src/views/Settings.jsx',
    'frontend/src/views/settings-pages.js', 'frontend/src/lib/local.js', 'frontend/src/App.jsx',
    'frontend/src/lib/api.js', 'frontend/public/sw-local.js', '.github/workflows/new-job.yml',
    'frontend/src/lib/plan-link.js', 'frontend/src/views/PlanLink.jsx',
    'frontend/src/lib/local-pwa-update.js', 'frontend/src/components/LocalPwaUpdate.jsx',
    'frontend/src/lib/health-shortcut.js', 'frontend/src/components/WorkoutEnergy.jsx', 'frontend/public/GYM-Health.shortcut',
    'frontend/public/shortcuts/v2/GYM-Health.shortcut',
    'frontend/scripts/check-local-upgrade.mjs', 'scripts/upstream-sync.mjs', 'NOTICE.md']) {
    assert.ok(isProtected(file), file)
  }
  for (const file of ['catalogue/i18n/ru.json', 'frontend/src/views/Stats.jsx', 'docs/FAQ.md']) {
    assert.equal(isProtected(file), false, file)
  }
})

test('a blockage creates one assigned issue and repeating it does not post again', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'gym-report-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'result.json'), JSON.stringify({ state: 'blocked', upstream: 'a'.repeat(40), base: 'b'.repeat(40), reason: 'Merge conflict', files: ['example.js'] }))
  const issues = [], writes = []
  const request = async (endpoint, options = {}) => {
    if (!options.method) return issues
    writes.push({ endpoint, ...options })
    if (options.method === 'POST') issues.push({ ...options.body, number: 1 })
    else issues[0].body = options.body.body
  }
  await reportUpdate({ dir, request, runId: '1' })
  await reportUpdate({ dir, request, runId: '2' })
  assert.equal(writes.length, 1)
  assert.equal(writes[0].method, 'POST')
  assert.deepEqual(writes[0].body.assignees, ['IF911'])
  assert.ok(writes[0].body.body.includes('example.js'))
  await reportUpdate({ dir, request, runId: '3', stage: 'Changed blockage' })
  assert.equal(writes.length, 2)
  assert.equal(writes[1].endpoint, 'issues/1')
  assert.equal(writes[1].method, 'PATCH')
})

test('version bumps may merge but changing mandatory verification commands is blocked', t => {
  for (const changeCommand of [false, true]) {
    const f = fixtureRoot()
    t.after(() => rmSync(f.root, { recursive: true, force: true }))
    const file = join(f.upstream, 'frontend', 'package.json')
    const pkg = JSON.parse(readFileSync(file, 'utf8'))
    if (changeCommand) pkg.scripts['build:local'] = 'vite build'
    else pkg.version = '1.1.0'
    writeFileSync(file, JSON.stringify(pkg, null, 2) + '\n')
    commit(f.upstream, 'package update')
    const response = prepareUpdate({ cwd: f.cwd, outDir: join(f.root, 'out'), upstream: f.upstream })
    assert.equal(response.state, changeCommand ? 'blocked' : 'update')
    if (changeCommand) assert.equal(git(f.cwd, ['rev-parse', 'HEAD']), f.base)
  }
})
