import { ipcMain } from 'electron'
import { listGroupsByCollection, createGroup, updateGroup, deleteGroup } from '../groups'

export function registerGroupHandlers() {
    ipcMain.handle('groups:listByCollection', (_event, collectionId: string) => {
        return listGroupsByCollection(collectionId)
    })

    ipcMain.handle('groups:create', (_event, collectionId: string, name: string, displayOrder?: number) => {
        return createGroup(collectionId, { name, displayOrder })
    })

    ipcMain.handle('groups:update', (_event, id: string, updates: unknown) => {
        return updateGroup(id, updates as Parameters<typeof updateGroup>[1])
    })

    ipcMain.handle('groups:delete', (_event, id: string) => {
        deleteGroup(id)
    })
}