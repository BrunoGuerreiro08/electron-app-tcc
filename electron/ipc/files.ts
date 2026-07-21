import { ipcMain, BrowserWindow } from 'electron'
import {
    attachFileToDocument,
    detectOrphans,
    openDocumentFile,
    pickFile,
    removeFileFromDocument,
} from '../fileHandler'

export function registerFileHandlers() {
    ipcMain.handle('files:pick', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return null
        return pickFile(win)
    })

    ipcMain.handle('files:attach', (_event, documentId: string, sourcePath: string) => {
        return attachFileToDocument(documentId, sourcePath)
    })

    ipcMain.handle('files:remove', (_event, documentId: string) => {
        removeFileFromDocument(documentId)
    })

    ipcMain.handle('files:open', (_event, documentId: string) => {
        openDocumentFile(documentId)
    })

    ipcMain.handle('files:detectOrphans', () => {
        return detectOrphans()
    })
}