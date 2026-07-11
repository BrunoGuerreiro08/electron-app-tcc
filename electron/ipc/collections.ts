import { ipcMain } from 'electron'
import { db } from '../db'
import { randomUUID } from 'node:crypto'

export function registerCollectionHandlers() {
    ipcMain.handle('collections:list', () => {
        return db.prepare('SELECT * FROM collections ORDER BY created_at DESC').all()
    })

    ipcMain.handle('collections:create', (_event, name: string) => {
        const id = randomUUID()
        db.prepare('INSERT INTO collections (id, name) VALUES (?, ?)').run(id, name)
        return id
    })
}