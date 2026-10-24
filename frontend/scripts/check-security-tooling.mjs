#!/usr/bin/env node
/*
 * Consumer smoke checks for the native-tool dependency overrides.
 * This script never writes to the repository: all archives, projects and images
 * live below one temporary directory which is removed in finally.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, dirname, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const frontend = fileURLToPath(new URL('..', import.meta.url))
const repo = resolve(frontend, '..')
const temp = await mkdtemp(join(tmpdir(), 'gym-security-tooling-'))

const assetsRoot = dirname(require.resolve('@capacitor/assets/package.json'))
const assetsRequire = createRequire(join(assetsRoot, 'package.json'))
const cliRoot = dirname(assetsRequire.resolve('@capacitor/cli/package.json'))
const cliRequire = createRequire(join(cliRoot, 'package.json'))
const xcodeRequire = createRequire(cliRequire.resolve('xcode/package.json'))

async function assertVersions() {
  assert.equal(assetsRequire('@capacitor/cli/package.json').version, require('@capacitor/cli/package.json').version)
  assert.equal(assetsRequire('sharp').versions.sharp, '0.35.5')
  assert.equal(xcodeRequire('uuid/package.json').version, '11.1.1')
  assert.equal(cliRequire('tar/package.json').version, '7.5.22')
}

async function smokeTar() {
  const tar = cliRequire('tar')
  const source = join(temp, 'archive-source')
  const archive = join(temp, 'fixture.tar.gz')
  const destination = join(temp, 'archive-output')
  await mkdir(source)
  await mkdir(destination)
  await writeFile(join(source, 'safe.txt'), 'GYM security fixture\n')
  await tar.c({ gzip: true, cwd: source, file: archive }, ['safe.txt'])

  const cliTemplate = join(cliRoot, 'dist', 'util', 'template.js')
  const { extractTemplate } = cliRequire(cliTemplate)
  await extractTemplate(archive, destination)
  assert.equal(await readFile(join(destination, 'safe.txt'), 'utf8'), 'GYM security fixture\n')
}

async function smokeXcode() {
  const xcode = cliRequire('xcode')
  const input = join(repo, 'frontend', 'ios', 'App', 'App.xcodeproj', 'project.pbxproj')
  const copy = join(temp, 'project.pbxproj')
  await cp(input, copy)
  const project = xcode.project(copy)
  project.parseSync()
  const generated = project.generateUuid()
  assert.match(generated, /^[A-F0-9]{24}$/)
  const output = project.writeSync()
  assert.match(output, /PBXProject/)
  await writeFile(copy, output)
  const reparsed = xcode.project(copy)
  reparsed.parseSync()
  assert.ok(reparsed.hash.project.objects)
}

async function smokeAssets() {
  const sharp = assetsRequire('sharp')
  const { InputAsset } = assetsRequire(join(assetsRoot, 'dist', 'input-asset.js'))
  const { PwaAssetGenerator } = assetsRequire(join(assetsRoot, 'dist', 'platforms', 'pwa', 'index.js'))
  const project = join(temp, 'asset-project')
  const assets = join(project, 'assets')
  const publicDir = join(project, 'public')
  await mkdir(assets, { recursive: true })
  await mkdir(publicDir, { recursive: true })
  await mkdir(join(publicDir, 'assets'))
  await writeFile(join(publicDir, 'manifest.json'), JSON.stringify({ icons: [] }))
  const source = join(assets, 'icon-only.png')
  await sharp({ create: { width: 64, height: 48, channels: 4, background: '#336699' } }).png().toFile(source)

  const input = new InputAsset(source, 'icon', 'any')
  await input.load()
  const generated = await new PwaAssetGenerator({ pwaNoAppleFetch: true }).generate(input, { directory: project })
  assert.ok(generated.length > 0)
  for (const output of generated) {
    const file = output.getDestFilename(Object.keys(output.destFilenames)[0])
    assert.ok(file.startsWith(temp + sep), `asset escaped the fixture: ${file}`)
    assert.ok(existsSync(file), `missing generated asset ${file}`)
    const metadata = await sharp(file).metadata()
    assert.equal(metadata.format, 'png')
    assert.equal(metadata.width, output.template.width)
    assert.equal(metadata.height, output.template.height)
  }
}

try {
  await assertVersions()
  await smokeTar()
  await smokeXcode()
  await smokeAssets()
  console.log('Native security tooling consumers OK')
} finally {
  await rm(temp, { recursive: true, force: true })
}
