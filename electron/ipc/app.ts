import os from 'node:os'
import { app, ipcMain, shell } from 'electron'

// Only links a user would expect to leave the app for; never file:, javascript: etc.
const EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:'])

export function registerAppHandlers() {
    ipcMain.handle('app:info', () => ({
        version: app.getVersion(),
        platform: process.platform,
        arch: process.arch,
        osRelease: os.release(),
        electron: process.versions.electron,
    }))

    ipcMain.handle('app:openExternal', async (_event, url: string) => {
        let parsed: URL
        try {
            parsed = new URL(url)
        } catch {
            throw new Error('Invalid URL.')
        }
        if (!EXTERNAL_PROTOCOLS.has(parsed.protocol)) throw new Error(`Refusing to open ${parsed.protocol} links.`)
        await shell.openExternal(parsed.href)
    })
}
