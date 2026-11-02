import { ipcMain, BrowserWindow } from 'electron'
import {
    attachFileToDocument,
    detectDroppedFiles,
    detectOrphans,
    locateMissingFile,
    openDocumentFile,
    pickFile,
    relinkMissingFilesByHash,
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

    ipcMain.handle('files:locate', (_event, documentId: string, sourcePath: string, force: boolean) => {
        return locateMissingFile(documentId, sourcePath, force)
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

    // Replaces the old pickImportFolder + scanFolder pair: there's no
    // folder picker anymore. This just re-lists whatever's currently
    // sitting in the storage folder's documents/ dir under a non-owned
    // name — called whenever the document library screen mounts.
    ipcMain.handle('files:detectDroppedFiles', () => {
        // A dropped file that is another device's copy of a synced document
        // is linked to it here, instead of being offered as a new document.
        relinkMissingFilesByHash()
        return detectDroppedFiles()
    })
}