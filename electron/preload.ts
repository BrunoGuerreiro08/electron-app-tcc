import { contextBridge } from 'electron'

// IPC bridges get added here as each domain (collections, certificates, etc.) is built
contextBridge.exposeInMainWorld('api', {
    // e.g. collections: { list: () => ipcRenderer.invoke('collections:list') }
})