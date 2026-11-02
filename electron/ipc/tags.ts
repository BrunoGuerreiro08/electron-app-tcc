import { ipcMain } from 'electron'
import { getDb } from '../db'
import { randomUUID } from 'node:crypto'
import { recordDelete, recordUpsert } from '../sync/recorder'

export function registerTagHandlers() {
    ipcMain.handle('tags:list', () => {
        return getDb().prepare('SELECT * FROM tags ORDER BY name').all()
    })

    ipcMain.handle('tags:create', (_event, name: string, color?: string) => {
        const id = randomUUID()
        const finalColor = color || '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')
        const db = getDb()
        db.transaction(() => {
            db.prepare('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)').run(id, name, finalColor)
            recordUpsert('tag', id, 'create')
        })()
        return id
    })

    ipcMain.handle('tags:update', (_event, id: string, name: string, color: string) => {
        const db = getDb()
        db.transaction(() => {
            db.prepare('UPDATE tags SET name = ?, color = ? WHERE id = ?').run(name, color, id)
            recordUpsert('tag', id, 'update')
        })()
    })

    ipcMain.handle('tags:delete', (_event, id: string) => {
        const db = getDb()
        db.transaction(() => {
            recordDelete('tag', id)
            db.prepare('DELETE FROM tags WHERE id = ?').run(id)
        })()
    })

    ipcMain.handle('tags:listForDocument', (_event, documentId: string) => {
        return getDb()
            .prepare(
                `SELECT t.* FROM tags t
         JOIN document_tags dt ON dt.tag_id = t.id
         WHERE dt.document_id = ?`
            )
            .all(documentId)
    })

    ipcMain.handle('tags:attachToDocument', (_event, documentId: string, tagId: string) => {
        const db = getDb()
        db.transaction(() => {
            const { changes } = db
                .prepare('INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)')
                .run(documentId, tagId)
            if (changes > 0) recordUpsert('document_tag', { document_id: documentId, tag_id: tagId }, 'create')
        })()
    })

    ipcMain.handle('tags:detachFromDocument', (_event, documentId: string, tagId: string) => {
        const db = getDb()
        db.transaction(() => {
            recordDelete('document_tag', { document_id: documentId, tag_id: tagId })
            db.prepare('DELETE FROM document_tags WHERE document_id = ? AND tag_id = ?').run(documentId, tagId)
        })()
    })
}