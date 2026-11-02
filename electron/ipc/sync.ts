import { ipcMain } from 'electron'
import { clearRemoteDetachNotices, getSyncStatus, syncNow } from '../sync/engine'
import { detachCollection, reattachCollection } from '../sync/recorder'

export function registerSyncHandlers() {
    ipcMain.handle('sync:status', () => getSyncStatus())

    ipcMain.handle('sync:now', async () => {
        await syncNow()
        return getSyncStatus()
    })

    // Off: the server forgets its copy, every device keeps theirs as local-only.
    ipcMain.handle('sync:setCollectionEnabled', (_event, collectionId: string, enabled: boolean) => {
        if (enabled) reattachCollection(collectionId)
        else detachCollection(collectionId)
    })

    ipcMain.handle('sync:clearNotices', () => clearRemoteDetachNotices())
}
