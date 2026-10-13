const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { createRequire } = require('node:module')
const run = promisify(execFile)
const builderRequire = createRequire(require.resolve('electron-builder'))
const { buildBlockMap } = builderRequire('app-builder-lib/out/targets/blockmap/blockmap')

module.exports = async function notarizeDmg(event) {
  if (!event.file.endsWith('.dmg')) return
  const profile = process.env.FOLIO_NOTARY_PROFILE
  if (!profile) throw new Error('Set FOLIO_NOTARY_PROFILE before producing release disk images.')
  console.log(`Notarizing disk image: ${event.file}`)
  const { stdout } = await run('xcrun', ['notarytool', 'submit', event.file, '--keychain-profile', profile, '--wait', '--output-format', 'json'], { maxBuffer: 1024 * 1024 })
  const result = JSON.parse(stdout)
  if (result.status !== 'Accepted') throw new Error(`Disk image notarization ${result.status}; submission ${result.id}`)
  await run('xcrun', ['stapler', 'staple', event.file])
  await run('xcrun', ['stapler', 'validate', event.file])
  await run('codesign', ['--verify', '--verbose=2', event.file])
  await run('hdiutil', ['verify', event.file])
  await run('spctl', ['--assess', '--type', 'open', '--context', 'context:primary-signature', '--verbose=4', event.file])
  // Stapling changes the DMG bytes. Refresh both differential updates and the
  // update metadata before electron-builder emits this artifact for publication.
  event.updateInfo = await buildBlockMap(event.file, 'gzip', `${event.file}.blockmap`)
  console.log(`Signed and notarized disk image verified: ${event.file}`)
}
