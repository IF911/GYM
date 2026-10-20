#!/usr/bin/env node
// This runs on GitHub's runner. It never reads a phone or a user's backup.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

const UPSTREAM = 'https://github.com/DuarteSantos8/openGym.git'
const ISSUE_TITLE = 'GYM: автоматическое обновление остановлено'
const SHA = /^[a-f0-9]{40}$/
const protectedFiles = new Set([
  'LICENSE', 'NOTICE.md', 'catalogue/media/NOTICE.md', '.gitmodules', '.gitattributes',
  'frontend/index.html', 'frontend/vite.config.js', 'frontend/public/manifest.json',
  'frontend/public/sw-local.js', 'frontend/scripts/build-local.mjs',
  'frontend/scripts/check-local-upgrade.mjs', 'frontend/src/main.jsx', 'frontend/src/lib/api.js',
  'frontend/src/store/useStore.js', 'frontend/src/App.jsx',
  'frontend/src/views/Settings.jsx', 'frontend/src/views/settings-pages.js',
  'frontend/src/store/useStore.local.test.js', 'frontend/src/views/Settings.local.test.jsx',
])
export function isProtected(file) {
  return protectedFiles.has(file) || file.startsWith('.github/workflows/') ||
    file.startsWith('scripts/upstream-sync') || file.startsWith('frontend/src/lib/local') ||
    file.startsWith('frontend/src/lib/plan-link') || file.startsWith('frontend/src/views/PlanLink') ||
    file === 'frontend/src/lib/sw-local.test.js' || file.startsWith('frontend/scripts/fixtures/local-upgrade')
}
function git(cwd, args, { allowFailure = false, env = {} } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } })
  if (r.error) throw r.error
  if (r.status && !allowFailure) throw new Error(`git ${args[0]} failed: ${(r.stderr || r.stdout).trim().slice(0, 1500)}`)
  return { code: r.status, text: r.stdout.trim(), error: r.stderr.trim() }
}
function resultFile(outDir, result) {
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2) + '\n')
  if (process.env.GITHUB_OUTPUT) {
    for (const key of ['state', 'base', 'candidate', 'upstream']) {
      if (result[key]) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${result[key]}\n`)
    }
  }
  return result
}
export function prepareUpdate({ cwd = process.cwd(), outDir, upstream = UPSTREAM, verify = false }) {
  if (!outDir) throw new Error('outDir is required')
  const base = git(cwd, ['rev-parse', 'HEAD']).text
  if (git(cwd, ['status', '--porcelain']).text) throw new Error('Refusing to merge into a dirty checkout')
  git(cwd, ['fetch', '--no-tags', upstream, 'refs/heads/main'])
  const upstreamSha = git(cwd, ['rev-parse', 'FETCH_HEAD']).text
  const result = { base, upstream: upstreamSha }
  if (git(cwd, ['merge-base', '--is-ancestor', upstreamSha, base], { allowFailure: true }).code === 0) {
    return resultFile(outDir, { ...result, state: verify ? 'verify' : 'noop', candidate: base })
  }
  const ancestor = git(cwd, ['merge-base', base, upstreamSha], { allowFailure: true })
  if (ancestor.code) return resultFile(outDir, { ...result, state: 'blocked', reason: 'Upstream history has no common ancestor' })
  const changed = git(cwd, ['diff', '--no-renames', '--name-only', '-z', ancestor.text, upstreamSha]).text.split('\0').filter(Boolean)
  const protectedChanges = changed.filter(isProtected)
  if (protectedChanges.length) {
    return resultFile(outDir, { ...result, state: 'blocked', reason: 'Upstream changes local privacy, licensing or automation boundaries', files: protectedChanges })
  }
  const merge = git(cwd, ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=github-actions[bot]',
    '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'merge', '--no-commit', '--no-ff', upstreamSha], { allowFailure: true })
  if (merge.code) {
    const files = git(cwd, ['diff', '--name-only', '--diff-filter=U']).text.split('\n').filter(Boolean)
    const mergeHead = path.resolve(cwd, git(cwd, ['rev-parse', '--git-path', 'MERGE_HEAD']).text)
    if (fs.existsSync(mergeHead)) git(cwd, ['merge', '--abort'])
    return resultFile(outDir, { ...result, state: 'blocked', reason: files.length
      ? 'Git could not merge upstream without conflicts' : `Merge failed: ${merge.error}`, files })
  }
  const packageBefore = JSON.parse(git(cwd, ['show', `${base}:frontend/package.json`], { allowFailure: true }).text || '{}')
  const packagePath = path.join(cwd, 'frontend/package.json')
  const packageAfter = fs.existsSync(packagePath) ? JSON.parse(fs.readFileSync(packagePath, 'utf8')) : {}
  for (const name of ['test', 'build:local', 'test:fatigue-probe']) {
    if (packageBefore.scripts?.[name] !== packageAfter.scripts?.[name]) {
      git(cwd, ['merge', '--abort'])
      return resultFile(outDir, { ...result, state: 'blocked', reason: `Upstream changes the trusted ${name} command`, files: ['frontend/package.json'] })
    }
  }
  git(cwd, ['diff', '--cached', '--check'])
  git(cwd, ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=github-actions[bot]',
    '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
    'commit', '-m', `chore: merge openGym ${upstreamSha.slice(0, 8)}`])
  const candidate = git(cwd, ['rev-parse', 'HEAD']).text
  fs.mkdirSync(outDir, { recursive: true })
  git(cwd, ['bundle', 'create', path.join(outDir, 'candidate.bundle'), 'HEAD', `^${base}`])
  return resultFile(outDir, { ...result, state: 'update', candidate })
}

function loadResult(dir) {
  const result = JSON.parse(fs.readFileSync(path.join(dir, 'result.json'), 'utf8'))
  for (const key of ['base', 'candidate', 'upstream']) {
    if (result[key] && !SHA.test(result[key])) throw new Error(`Invalid ${key} revision`)
  }
  return result
}
async function github(endpoint, { method = 'GET', body } = {}) {
  const repo = process.env.GITHUB_REPOSITORY
  if (repo !== 'IF911/GYM') throw new Error('GitHub writes are restricted to IF911/GYM')
  const response = await fetch(`https://api.github.com/repos/${repo}/${endpoint}`, {
    method, headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
  })
  if (!response.ok) throw new Error(`GitHub ${method} ${endpoint}: HTTP ${response.status}`)
  return response.status === 204 ? null : response.json()
}
export async function promoteUpdate({ dir, cwd = process.cwd(), dispatch = candidate => github('actions/workflows/local-pwa.yml/dispatches', {
  method: 'POST', body: { ref: 'main', inputs: { expected_sha: candidate } },
}) }) {
  const r = loadResult(dir)
  if (r.state !== 'update' || !r.candidate || !r.base) throw new Error('No validated candidate to promote')
  if (git(cwd, ['rev-parse', 'HEAD']).text !== r.base) throw new Error('Promotion checkout is not the tested base')
  git(cwd, ['fetch', '--no-tags', path.join(dir, 'candidate.bundle'), 'HEAD'])
  if (git(cwd, ['rev-parse', 'FETCH_HEAD']).text !== r.candidate) throw new Error('Candidate bundle revision mismatch')
  const parents = git(cwd, ['show', '-s', '--format=%P', r.candidate]).text.split(' ')
  if (parents.length !== 2 || parents[0] !== r.base || parents[1] !== r.upstream) throw new Error('Unexpected merge parents')
  const touched = git(cwd, ['diff', '--no-renames', '--name-only', r.base, r.candidate]).text.split('\n').filter(Boolean)
  if (touched.some(isProtected)) throw new Error('Candidate changes protected files')
  const remote = git(cwd, ['ls-remote', 'origin', 'refs/heads/main']).text.split(/\s/)[0]
  if (remote !== r.base) throw new Error('main changed during validation; no push was performed')
  // No force push, reset or upstream code execution in this privileged job.
  git(cwd, ['push', 'origin', `${r.candidate}:refs/heads/main`])
  await dispatch(r.candidate)
  console.log(`Validated upstream ${r.upstream}; release requested for ${r.candidate}`)
}
export async function reportUpdate({ dir, request = github, stage: failedStage = process.env.SYNC_FAILED_STAGE, runId = process.env.GITHUB_RUN_ID }) {
  let r
  try { r = loadResult(dir) } catch { r = { state: 'error', reason: 'Preparation failed before a candidate was available' } }
  const run = `https://github.com/IF911/GYM/actions/runs/${runId}`
  const stage = failedStage || r.reason || 'Validation or release dispatch failed'
  const fingerprint = `<!-- gym-upstream:${r.upstream || 'unknown'}:${stage} -->`
  const issues = await request('issues?state=open&creator=github-actions%5Bbot%5D&per_page=100')
  const existing = issues.find(issue => !issue.pull_request && issue.title === ISSUE_TITLE)
  if (existing?.body?.includes(fingerprint)) return console.log('The same blockage has already been reported')
  const files = (r.files || []).map(file => `- \`${file.replaceAll('`', '')}\``).join('\n')
  const body = `${fingerprint}\nАвтоматическое обновление openGym остановлено; успешная публикация этим процессом не подтверждена. Данные телефона не читались и не отправлялись в GitHub.\n\nПричина: ${stage}\n\nUpstream: \`${r.upstream || 'unknown'}\`\nБаза GYM: \`${r.base || 'unknown'}\`\n\n${files}\n\n[Проверки и журнал](${run})\n\nНужно совместить изменения или исправить проверку, затем повторить **GYM upstream sync** из Actions. Если push уже прошёл, main может содержать новый commit при прежнем сайте; если не удался запуск публикации, можно запустить **GYM local PWA** на main. Не используйте force push или замену нашей ветки upstream-веткой.`
  if (existing) await request(`issues/${existing.number}`, { method: 'PATCH', body: { body } })
  else await request('issues', { method: 'POST', body: { title: ISSUE_TITLE, body, assignees: ['IF911'] } })
}

async function resolveBlockage() {
  const issues = await github('issues?state=open&creator=github-actions%5Bbot%5D&per_page=100')
  const existing = issues.find(issue => !issue.pull_request && issue.title === ISSUE_TITLE)
  if (existing) await github(`issues/${existing.number}`, { method: 'PATCH', body: { state: 'closed', state_reason: 'completed' } })
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [mode, dir] = process.argv.slice(2)
  try {
    if (mode === 'prepare') {
      const r = prepareUpdate({ outDir: dir, verify: process.env.SYNC_VERIFY === 'true' })
      console.log(JSON.stringify(r))
    } else if (mode === 'promote') await promoteUpdate({ dir })
    else if (mode === 'report') await reportUpdate({ dir })
    else if (mode === 'resolve') await resolveBlockage()
    else throw new Error('Usage: upstream-sync.mjs prepare|promote|report <artifact-directory>')
  } catch (error) {
    if (mode === 'prepare' && dir) resultFile(dir, { state: 'error', reason: error.message })
    console.error(error.message)
    process.exitCode = 1
  }
}
