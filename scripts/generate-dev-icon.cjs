// Draw a development label with Chromium's canvas, keeping the release artwork intact.
const { app, BrowserWindow, nativeImage } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { execFileSync } = require('node:child_process')
const root = path.join(__dirname, '..')

app.whenReady().then(async () => {
  app.dock?.hide()
  const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } })
  try {
    const source = `data:image/png;base64,${fs.readFileSync(path.join(root, 'build/icon.png')).toString('base64')}`
    await win.loadURL('data:text/html,<html><body></body></html>')
    const png = await win.webContents.executeJavaScript(`(async () => {
      const image = new Image()
      image.src = ${JSON.stringify(source)}
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 1024
      const context = canvas.getContext('2d')
      context.drawImage(image, 0, 0, 1024, 1024)
      context.fillStyle = '#ea6b35'
      context.strokeStyle = '#191b20'
      context.lineWidth = 14
      context.beginPath()
      context.roundRect(570, 730, 342, 166, 40)
      context.fill()
      context.stroke()
      context.fillStyle = '#ffffff'
      context.font = '800 104px Arial, sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText('DEV', 741, 821)
      return canvas.toDataURL('image/png').split(',')[1]
    })()`)
    const buffer = Buffer.from(png, 'base64')
    fs.writeFileSync(path.join(root, 'build/icon-dev.png'), buffer)
    if (process.platform === 'darwin') {
      const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'folio-dev-icon-'))
      try {
        const iconset = path.join(temporary, 'icon.iconset')
        fs.mkdirSync(iconset)
        const icon = nativeImage.createFromBuffer(buffer)
        for (const size of [16, 32, 128, 256, 512]) {
          for (const scale of [1, 2]) {
            const name = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`
            fs.writeFileSync(path.join(iconset, name), icon.resize({ width: size * scale, height: size * scale }).toPNG())
          }
        }
        execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(root, 'build/icon-dev.icns')])
      } finally {
        fs.rmSync(temporary, { recursive: true, force: true })
      }
    }
    console.log('Generated development app icons.')
  } finally {
    win.destroy()
  }
  app.quit()
}).catch(error => {
  console.error(error)
  app.exit(1)
})
