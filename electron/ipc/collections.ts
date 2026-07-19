import { ipcMain } from 'electron'
import { db } from '../db'
import { randomUUID } from 'node:crypto'

export function registerCollectionHandlers() {
    ipcMain.handle('collections:list', () => {
        return db.prepare('SELECT * FROM collections ORDER BY created_at DESC').all()
    })

    ipcMain.handle('collections:create', (_event, name: string, color?: string) => {
        const id = randomUUID()
        const createCollection = db.prepare(
            'INSERT INTO collections (id, name, color) VALUES (?, ?, ?)'
        )
        const createDefaultSubgroup = db.prepare(
            'INSERT INTO subgroups (id, collection_id, name, display_order) VALUES (?, ?, ?, 0)'
        )

        const tx = db.transaction(() => {
            createCollection.run(id, name, color ?? null)
            createDefaultSubgroup.run(randomUUID(), id, 'General')
        })
        tx()

        return id
    })

    ipcMain.handle('collections:rename', (_event, id: string, name: string) => {
        db.prepare(
            `UPDATE collections SET name = ?, updated_at = datetime('now') WHERE id = ?`
        ).run(name, id)
    })

    ipcMain.handle('collections:delete', (_event, id: string) => {
        // ON DELETE CASCADE handles subgroups -> categories -> document_category_links.
        // Documents themselves are never touched.
        db.prepare('DELETE FROM collections WHERE id = ?').run(id)
    })
}