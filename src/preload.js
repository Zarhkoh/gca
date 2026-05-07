const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  getProps:   ()     => ipcRenderer.invoke('props:get'),
  listSD:     ()     => ipcRenderer.invoke('sd:list'),
  createSD:   (opts) => ipcRenderer.invoke('sd:create', opts),
  openUrl:    (url)  => ipcRenderer.send('open:url', url),
  minimize:   ()     => ipcRenderer.send('window:minimize'),
  close:      ()     => ipcRenderer.send('window:close'),
  onPipeline: (cb)   => {
    ipcRenderer.on('pipeline:update', (_, data) => cb(data))
    return () => ipcRenderer.removeAllListeners('pipeline:update')
  },
})
