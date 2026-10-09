const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

if (process.platform !== 'darwin') {
  process.exit(0)
}

const root = path.join(__dirname, '..')
const distDir = path.join(root, 'node_modules/electron/dist')
const legacyAppPath = path.join(distDir, 'Electron.app')
const folioAppPath = path.join(distDir, 'Folio.app')
const appPath = fs.existsSync(folioAppPath) ? folioAppPath : legacyAppPath

if (!fs.existsSync(appPath)) {
  process.exit(0)
}

// 1. Rename Electron.app to Folio.app if needed
let targetAppPath = appPath
if (fs.existsSync(legacyAppPath) && !fs.existsSync(folioAppPath)) {
  fs.renameSync(legacyAppPath, folioAppPath)
  targetAppPath = folioAppPath
}

// 2. Rename executable inside MacOS/ if needed
const oldExe = path.join(targetAppPath, 'Contents/MacOS/Electron')
const newExe = path.join(targetAppPath, 'Contents/MacOS/Folio')
if (fs.existsSync(oldExe) && !fs.existsSync(newExe)) {
  fs.renameSync(oldExe, newExe)
}

// 3. Update path.txt so electron CLI launches Folio.app
const pathTxt = path.join(root, 'node_modules/electron/path.txt')
if (fs.existsSync(pathTxt)) {
  fs.writeFileSync(pathTxt, 'Folio.app/Contents/MacOS/Folio')
}

// 4. Update Info.plist
const plistPath = path.join(targetAppPath, 'Contents/Info.plist')
function setOrAddPlistKey(key, value) {
  try {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plistPath], { stdio: 'ignore' })
  } catch {
    try {
      execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${value}`, plistPath], { stdio: 'ignore' })
    } catch {
      // Ignored
    }
  }
}

if (fs.existsSync(plistPath)) {
  setOrAddPlistKey('CFBundleDisplayName', 'Folio')
  setOrAddPlistKey('CFBundleName', 'Folio')
  setOrAddPlistKey('CFBundleExecutable', 'Folio')
}

// 5. Update bundle icon
const iconSrc = path.join(root, 'build/icon.icns')
const resourcesPath = path.join(targetAppPath, 'Contents/Resources')
if (fs.existsSync(iconSrc) && fs.existsSync(resourcesPath)) {
  fs.copyFileSync(iconSrc, path.join(resourcesPath, 'electron.icns'))
}

try {
  execFileSync('touch', [targetAppPath], { stdio: 'ignore' })
} catch {
  // Ignored
}
