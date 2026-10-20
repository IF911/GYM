#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.resolve(frontend, '..')
const dist = path.join(frontend, 'dist')
const env = { ...process.env, VITE_LOCAL: '1' }
for (const name of ['VITE_UMAMI_SRC', 'VITE_UMAMI_ID', 'MEDIA_TARGET', 'APP_MEDIA_DIR', 'VITE_CLIP_EXT', 'VITE_IMG_BASE', 'VITE_GIF_BASE', 'VITE_MEDIA_BASE', 'VITE_DEMO', 'VITE_MOBILE']) delete env[name]
// Explicit values also override Vite's ignored, machine-local .env files.
Object.assign(env, {
  VITE_MOBILE: '0', VITE_DEMO: '0', VITE_CLIP_EXT: 'mp4',
  VITE_IMG_BASE: 'exercise-media/still/', VITE_GIF_BASE: 'exercise-media/clip/',
  VITE_UMAMI_SRC: '', VITE_UMAMI_ID: ''
})

const result = spawnSync(process.platform === 'win32' ? 'vite.cmd' : 'vite', ['build'], { cwd: frontend, env, stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status || 1)

const media = path.join(root, 'catalogue', 'media')
if (!fs.existsSync(path.join(media, 'still')) || !fs.existsSync(path.join(media, 'clip')) || !fs.existsSync(path.join(media, 'NOTICE.md'))) {
  console.error('local build: catalogue/media is missing; restore the licensed 180px media before building GYM')
  process.exit(1)
}
const stage = spawnSync(process.execPath, [path.join(root, 'scripts/catalogue/stage-media.mjs'), dist], { cwd: root, env, stdio: 'inherit' })
if (stage.status !== 0) process.exit(stage.status || 1)

const excluded = [
  /^(?:\.git|node_modules|dist|data|private|runtime)(?:\/|$)/,
  /(?:^|\/)(?:\.DS_Store|\.npmrc|\.yarnrc(?:\.yml)?|.*\.log)$/i,
  /(?:^|\/)(?:\.env(?:\..*)?|.*\.(?:pem|key|p12|pfx|crt|der|sqlite|db))(?:$|\/)/i,
  /^(?:frontend\/(?:android|ios)|catalogue\/media)(?:\/|$)/
]
const names = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root, encoding: 'buffer' })
if (names.status !== 0) throw new Error('git ls-files failed while creating source archive')
const files = names.stdout.toString().split('\0').filter(Boolean)
  .filter(file => fs.existsSync(path.join(root, file)))
  .filter(file => !excluded.some(rule => rule.test(file)))
  .filter(file => !/\.(?:png|jpe?g|gif|webp|mp4|mov|avi|mkv|mp3|wav|zip|tar|gz|7z|pdf|woff2?|ttf|otf|dmg|ipa|apk)$/i.test(file) || /^frontend\/public\/icon-(?:180|512)\.png$/i.test(file))
if (!files.includes('LICENSE')) console.warn('local build: LICENSE is absent from source archive input')
const list = path.join(os.tmpdir(), `gym-source-${process.pid}.list`)
fs.writeFileSync(list, Buffer.concat(files.map(file => Buffer.from(`${file}\0`))))
try {
  fs.mkdirSync(dist, { recursive: true })
  const archive = path.join(dist, 'source.tar.gz')
  const tar = spawnSync('tar', ['-czf', archive, '--null', '--files-from', list], { cwd: root, env: { ...env, COPYFILE_DISABLE: '1' }, stdio: 'inherit' })
  if (tar.status !== 0) process.exit(tar.status || 1)
} finally {
  fs.rmSync(list, { force: true })
}
console.log(`local build: source.tar.gz (${files.length} source files)`)
