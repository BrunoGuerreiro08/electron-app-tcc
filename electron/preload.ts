import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
    collections: {
        list: () => ipcRenderer.invoke('collections:list'),
        create: (name: string) => ipcRenderer.invoke('collections:create', name),
    },
    session: {
        get: () => ipcRenderer.invoke('session:get'),
        set: (session: unknown) => ipcRenderer.invoke('session:set', session),
        clear: () => ipcRenderer.invoke('session:clear'),
    },
})