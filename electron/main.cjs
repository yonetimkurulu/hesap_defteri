const { app, BrowserWindow, shell, ipcMain, Menu } = require('electron')
const path = require('node:path')
const { autoUpdater } = require('electron-updater')

// ── Auto-updater ayarları ──────────────────────────────────────────
autoUpdater.autoDownload = false          // Kullanıcı arayüzden butona basınca indirsin
autoUpdater.autoInstallOnAppQuit = true   // İndirildikten sonra uygulama kapanırsa yine de kurulsun

let mainWindow = null

function createWindow() {
  Menu.setApplicationMenu(null)
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#f3f7f3',
    title: 'Hesap Defteri',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.removeMenu()

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ── Auto-update olayları (Renderer'a bildirim) ─────────────────────
let isManualCheck = false

function sendUpdateStatus(data) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('update-status', data)
  }
}

autoUpdater.on('checking-for-update', () => {
  if (isManualCheck) {
    sendUpdateStatus({ status: 'checking' })
  }
})

autoUpdater.on('update-available', (info) => {
  isManualCheck = false
  sendUpdateStatus({
    status: 'available',
    version: info.version,
    releaseDate: info.releaseDate,
  })
})

autoUpdater.on('update-not-available', () => {
  if (isManualCheck) {
    isManualCheck = false
    sendUpdateStatus({ status: 'not-available' })
  }
})

autoUpdater.on('error', (err) => {
  if (isManualCheck) {
    isManualCheck = false
    sendUpdateStatus({
      status: 'error',
      message: err?.message || String(err),
    })
  }
  // Arka plan otomatik kontrollerindeki hataları sessizce yut
})

autoUpdater.on('download-progress', (progress) => {
  if (mainWindow) {
    mainWindow.setProgressBar(progress.percent / 100)
  }
  sendUpdateStatus({
    status: 'downloading',
    percent: Math.round(progress.percent),
    bytesPerSecond: progress.bytesPerSecond,
    total: progress.total,
    transferred: progress.transferred,
  })
})

autoUpdater.on('update-downloaded', (info) => {
  if (mainWindow) {
    mainWindow.setProgressBar(-1) // Progress bar'ı temizle
  }
  sendUpdateStatus({
    status: 'downloaded',
    version: info.version,
  })
})

// ── Renderer'dan gelen IPC komutları ───────────────────────────────
ipcMain.handle('check-for-updates', () => {
  isManualCheck = true
  sendUpdateStatus({ status: 'checking' })
  return autoUpdater.checkForUpdates().catch((err) => {
    isManualCheck = false
    sendUpdateStatus({ status: 'error', message: err.message })
  })
})

ipcMain.handle('start-download-update', () => {
  sendUpdateStatus({ status: 'downloading', percent: 0 })
  return autoUpdater.downloadUpdate()
})

ipcMain.handle('quit-and-install', () => {
  autoUpdater.quitAndInstall(false, true)
})

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// ── Uygulama başlatma ──────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()

  // Başlangıçta 3 saniye sonra arka planda sessizce kontrol et
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 3000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
