const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron')
const path = require('node:path')
const { autoUpdater } = require('electron-updater')

// ── Auto-updater ayarları ──────────────────────────────────────────
autoUpdater.autoDownload = false          // Kullanıcıya sorup indirsin
autoUpdater.autoInstallOnAppQuit = true   // İndirdikten sonra kapanışta kursun

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#f3f7f3',
    title: 'Hesap Defteri',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ── Auto-update olayları ───────────────────────────────────────────
autoUpdater.on('update-available', (info) => {
  if (!mainWindow) return
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Güncelleme mevcut',
    message: `Yeni sürüm ${info.version} yayınlandı.\nŞimdi indirmek ister misiniz?`,
    detail: 'Güncelleme arka planda indirilecek ve uygulama kapandığında kurulacaktır.',
    buttons: ['İndir', 'Daha sonra'],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => {
    if (response === 0) {
      autoUpdater.downloadUpdate()
      // İndirme başladığını renderer'a bildir
      mainWindow.webContents.send('update-status', { status: 'downloading' })
    }
  })
})

autoUpdater.on('update-downloaded', () => {
  if (!mainWindow) return
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Güncelleme hazır',
    message: 'Güncelleme indirildi. Şimdi yeniden başlatmak ister misiniz?',
    detail: 'Kayıtlarınız korunacaktır.',
    buttons: ['Şimdi yeniden başlat', 'Daha sonra'],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => {
    if (response === 0) {
      autoUpdater.quitAndInstall(false, true)
    }
  })
})

autoUpdater.on('update-not-available', () => {
  // Manuel kontrol yapıldıysa bilgilendir
  if (manualCheckTriggered) {
    manualCheckTriggered = false
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Güncel',
        message: 'Uygulamanız zaten en son sürümde.',
      })
    }
  }
})

autoUpdater.on('error', (err) => {
  if (manualCheckTriggered && mainWindow) {
    manualCheckTriggered = false
    dialog.showMessageBox(mainWindow, {
      type: 'warning',
      title: 'Güncelleme hatası',
      message: 'Güncelleme kontrol edilirken bir hata oluştu.',
      detail: err?.message || String(err),
    })
  }
})

autoUpdater.on('download-progress', (progress) => {
  if (mainWindow) {
    mainWindow.setProgressBar(progress.percent / 100)
    mainWindow.webContents.send('update-status', {
      status: 'downloading',
      percent: Math.round(progress.percent),
    })
  }
})

// Renderer'dan güncelleme kontrolü isteyebilsin
let manualCheckTriggered = false
ipcMain.handle('check-for-updates', () => {
  manualCheckTriggered = true
  autoUpdater.checkForUpdates()
})

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

// ── Uygulama başlatma ──────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()

  // Başlangıçta sessizce güncelleme kontrol et
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // İnternet yoksa sessizce geç
    })
  }, 3000)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
