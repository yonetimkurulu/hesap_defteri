const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('hesapDefteriDesktop', {
  platform: process.platform,
  version: process.versions.electron,

  // Auto-update API
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data)
    ipcRenderer.on('update-status', handler)
    return () => ipcRenderer.removeListener('update-status', handler)
  },
})
