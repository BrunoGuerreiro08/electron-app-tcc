import { ipcMain } from 'electron'
import { store, type SessionRecord } from '../store'

export function registerSessionHandlers() {
    ipcMain.handle('session:get', () => {
        return store.get('session')
    })

    ipcMain.handle('session:set', (_event, session: SessionRecord) => {
        store.set('session', session)
    })

    ipcMain.handle('session:clear', () => {
        store.set('session', null)
    })
}