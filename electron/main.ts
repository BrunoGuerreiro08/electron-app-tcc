import { app, BrowserWindow, globalShortcut } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { detectOrphans } from './fileHandler'
import { registerCollectionHandlers } from './ipc/collections'
import { registerGroupHandlers } from './ipc/groups'
import { registerSubgroupHandlers } from './ipc/subgroups'
import { registerCategoryHandlers } from './ipc/categories'
import { registerDocumentHandlers } from './ipc/documents'
import { registerTagHandlers } from './ipc/tags'
import { registerDocumentCategoryLinkHandlers } from './ipc/documentCategoryLinks'
import { registerSessionHandlers, restoreActiveSession } from './ipc/session'
import { registerSettingsHandlers } from './ipc/settings'
import { registerFileHandlers } from './ipc/files'
import { registerReportHandlers } from './ipc/reports'
import { registerReviewHandlers } from './ipc/reviews'
import { registerPreferencesHandlers } from './ipc/preferences'
import { registerTemplateHandlers } from './ipc/templates'
import { syncOfficialTemplates } from './templates'
import { registerDossierHandlers } from './ipc/dossier'
import { registerExportFileHandlers } from './ipc/exportFiles'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = process.env.NODE_ENV === 'development'

function createWindow() {

    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        icon: path.join(__dirname, '../public/favicon.png'),
        // frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

    win.removeMenu()

    if (isDev) {
        win.loadURL('http://localhost:5173')
        win.webContents.openDevTools()
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'))
    }

    win.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12') {
            win.webContents.toggleDevTools()
            event.preventDefault()
        }

        const isCtrlOrCmd = input.control || input.meta
        if (isCtrlOrCmd && input.shift && input.key.toLowerCase() === 'i') {
            win.webContents.toggleDevTools()
            event.preventDefault()
        }
    })
}

app.whenReady().then(() => {
    // Note: no initSchema() here anymore — schema creation now happens
    // lazily inside openUserDb(), the first time a user is known (either
    // via restoreActiveSession() below, or on session:set at login time).
    registerPreferencesHandlers()
    registerCollectionHandlers()
    registerGroupHandlers()
    registerSubgroupHandlers()
    registerCategoryHandlers()
    registerDocumentHandlers()
    registerTagHandlers()
    registerDocumentCategoryLinkHandlers()
    registerSessionHandlers()
    registerSettingsHandlers()
    registerFileHandlers()
    registerReportHandlers()
    registerTemplateHandlers()
    registerReviewHandlers()
    registerDossierHandlers()
    registerExportFileHandlers()

    // If a user was already logged in on this device, reopen their db/store
    // before the renderer loads so collections:list etc. work immediately
    // instead of racing the login screen.
    const session = restoreActiveSession()
    if (session) detectOrphans()

    createWindow()

    // Refresh the local copy of the official templates in the background;
    // offline, the cached ones are used as-is. A no-op without an
    // institutional session (login screen, guest mode) — session:set
    // triggers it after login instead.
    void syncOfficialTemplates()
})

app.on('will-quit', () => {
    globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
})