const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('hesapDefteriDesktop', {
  platform: process.platform,
  version: process.versions.electron,
})
