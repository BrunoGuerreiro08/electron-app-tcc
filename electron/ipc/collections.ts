import { ipcMain } from 'electron'
import { getDb } from '../db'
import { randomUUID } from 'node:crypto'
import { ensureDefaultGroupIfNone, ensureDefaultSubgroupIfNone } from '../groups'

export function registerCollectionHandlers() {
    ipcMain.handle('collections:get', (_event, id: string) => {
        return getDb().prepare('SELECT * FROM collections WHERE id = ?').get(id) ?? null
    })

    ipcMain.handle('collections:list', () => {
        return getDb().prepare('SELECT * FROM collections ORDER BY created_at DESC').all()
    })

    ipcMain.handle('collections:create', (_event, name: string, color?: string) => {
        const id = randomUUID()
        const createCollection = getDb().prepare(
            'INSERT INTO collections (id, name, color) VALUES (?, ?, ?)'
        )
        const tx = getDb().transaction(() => {
            createCollection.run(id, name, color ?? null)
            const defaultGroupId = ensureDefaultGroupIfNone(id)
            if (defaultGroupId) ensureDefaultSubgroupIfNone(id, defaultGroupId)
        })
        tx()

        return id
    })

    ipcMain.handle('collections:rename', (_event, id: string, name: string) => {
        getDb().prepare(
            `UPDATE collections SET name = ?, updated_at = datetime('now') WHERE id = ?`
        ).run(name, id)
    })

    ipcMain.handle('collections:delete', (_event, id: string) => {
        // ON DELETE CASCADE handles subgroups -> categories -> document_category_links.
        // Documents themselves are never touched.
        getDb().prepare('DELETE FROM collections WHERE id = ?').run(id)
    })
}