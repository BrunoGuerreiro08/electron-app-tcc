import { ipcMain, BrowserWindow } from 'electron'
import {
    listOfficialTemplates,
    listImportedTemplates,
    pickAndImportTemplate,
    applyTemplate,
    exportCollectionAsTemplate,
    deleteImportedTemplate,
} from '../templates'

export function registerTemplateHandlers() {
    ipcMain.handle('templates:listOfficial', () => {
        return listOfficialTemplates()
    })

    ipcMain.handle('templates:listImported', () => {
        return listImportedTemplates()
    })

    ipcMain.handle('templates:pickAndImport', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return null
        return pickAndImportTemplate(win)
    })

    ipcMain.handle(
        'templates:apply',
        (
            _event,
            source: { kind: 'official' | 'imported'; fileName: string },
            collectionName: string,
            color: string | null
        ) => {
            return applyTemplate(source, collectionName, color)
        }
    )

    ipcMain.handle('templates:exportCollection', async (event, collectionId: string) => {
        const win = BrowserWindow.fromWebContents(event.sender)
        if (!win) return null
        return exportCollectionAsTemplate(win, collectionId)
    })

    ipcMain.handle('templates:deleteImported', (_event, fileName: string) => {
        deleteImportedTemplate(fileName)
    })
}