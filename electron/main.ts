import { app, BrowserWindow, globalShortcut } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initSchema } from './db'
import { registerCollectionHandlers } from './ipc/collections'
import { registerSessionHandlers } from './ipc/session'

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

    // Reopen DevTools any time — useful once closed accidentally
    globalShortcut.register('F12', () => {
        win.webContents.toggleDevTools()
    })
    globalShortcut.register('CommandOrControl+Shift+I', () => {
        win.webContents.toggleDevTools()
    })
}

app.whenReady().then(() => {
    initSchema()
    registerCollectionHandlers()
    registerSessionHandlers()
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