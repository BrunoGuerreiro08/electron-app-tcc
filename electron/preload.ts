import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
    collections: {
        list: () => ipcRenderer.invoke('collections:list'),
        create: (name: string) => ipcRenderer.invoke('collections:create', name),
    },
})