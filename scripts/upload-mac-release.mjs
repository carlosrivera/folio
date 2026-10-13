import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, rmSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import YAML from 'yaml'

process.chdir(fileURLToPath(new URL('..', import.meta.url)))
const args = process.argv.slice(2)
if (args.some(arg => !['--cleanup-only', '--legacy'].includes(arg))) {
  throw new Error('Supported options: --cleanup-only, --legacy')
}
const { version } = JSON.parse(readFileSync('package.json', 'utf8'))
const output = path.resolve(args.includes('--legacy') ? 'dist-packaged' : 'dist-packaged.noindex', `v${version}`)
const tag = `v${version}`
const repository = 'carlosrivera/folio'
const files = [
  `Folio-${version}-arm64.dmg`, `Folio-${version}.dmg`,
  `Folio-${version}-arm64-mac.zip`, `Folio-${version}-mac.zip`,
]
const metadata = YAML.parse(readFileSync(path.join(output, 'latest-mac.yml'), 'utf8'))
if (metadata.version !== version || metadata.files.length !== files.length) throw new Error('Unexpected update metadata')
for (const name of files) {
  const entry = metadata.files.find(file => file.url === name)
  const bytes = readFileSync(path.join(output, name))
  if (!entry || entry.size !== bytes.length || entry.sha512 !== createHash('sha512').update(bytes).digest('base64')) {
    throw new Error(`Update checksum mismatch: ${name}`)
  }
}
const artifacts = [...files, ...files.map(name => `${name}.blockmap`), 'latest-mac.yml']
const manifest = artifacts.map(name => {
  const bytes = readFileSync(path.join(output, name))
  if (!bytes.length) throw new Error(`Empty artifact: ${name}`)
  return { name, size: bytes.length, digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}` }
})
if (!args.includes('--cleanup-only')) {
  for (const arch of ['mac', 'mac-arm64']) {
    const bundle = path.join(output, arch, 'Folio.app')
    execFileSync('codesign', ['--verify', '--deep', '--strict', bundle], { stdio: 'inherit' })
    execFileSync('spctl', ['--assess', '--type', 'execute', bundle], { stdio: 'inherit' })
    execFileSync('xcrun', ['stapler', 'validate', bundle], { stdio: 'inherit' })
  }
  // The existing release stays a draft until all platform builds are ready.
  execFileSync('gh', ['release', 'upload', tag, ...artifacts.map(name => path.join(output, name)), '--repo', repository, '--clobber'], { stdio: 'inherit' })
}
const release = JSON.parse(execFileSync('gh', ['api', `repos/${repository}/releases/tags/${tag}`], { encoding: 'utf8' }))
for (const file of manifest) {
  const remote = release.assets.find(asset => asset.name === file.name)
  if (!remote || remote.size !== file.size || remote.digest !== file.digest) {
    throw new Error(`Upload verification failed: ${file.name}. Local output retained.`)
  }
}
if (!statSync(output).isDirectory()) throw new Error('Invalid staging directory')
rmSync(output, { recursive: true })
console.log(`Verified all nine Mac artifacts on ${tag}; removed local release staging output.`)
