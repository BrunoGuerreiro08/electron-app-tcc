import { app, BrowserWindow, globalShortcut } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initSchema } from './db'
import { registerCollectionHandlers } from './ipc/collections'
import { registerSubgroupHandlers } from './ipc/subgroups'
import { registerCategoryHandlers } from './ipc/categories'
import { registerDocumentHandlers } from './ipc/documents'
import { registerTagHandlers } from './ipc/tags'
import { registerDocumentCategoryLinkHandlers } from './ipc/documentCategoryLinks'
import { registerSessionHandlers } from './ipc/session'
import { registerSettingsHandlers } from './ipc/settings'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    })

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
    initSchema()
    registerCollectionHandlers()
    registerSubgroupHandlers()
    registerCategoryHandlers()
    registerDocumentHandlers()
    registerTagHandlers()
    registerDocumentCategoryLinkHandlers()
    registerSessionHandlers()
    registerSettingsHandlers()
    createWindow()
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