import { ipcMain, BrowserWindow } from 'electron'
import {
    getConfiguredStorageFolder,
    getStorageRoot,
    migrateStorageFolder,
    pickStorageFolder,
} from '../fileStorage'

export function registerSettingsHandlers() {
    ipcMain.handle('settings:getStorageFolder', () => {
        return {
            path: getStorageRoot(),
            isCustom: getConfiguredStorageFolder() !== null,
        }
    })

    ipcMain.handle('settings:pickStorageFolder', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return null
        return pickStorageFolder(win)
    })

    ipcMain.handle('settings:changeStorageFolder', (_event, newFolder: string) => {
        return migrateStorageFolder(newFolder)
    })
}