import { ipcMain } from 'electron'
import { db } from '../db'
import { randomUUID } from 'node:crypto'

export function registerTagHandlers() {
    ipcMain.handle('tags:list', () => {
        return db.prepare('SELECT * FROM tags ORDER BY name').all()
    })

    ipcMain.handle('tags:create', (_event, name: string, color?: string) => {
        const id = randomUUID()
        db.prepare('INSERT INTO tags (id, name, color) VALUES (?, ?, ?)').run(
            id,
            name,
            color ?? null
        )
        return id
    })

    ipcMain.handle('tags:delete', (_event, id: string) => {
        db.prepare('DELETE FROM tags WHERE id = ?').run(id)
    })

    ipcMain.handle('tags:listForDocument', (_event, documentId: string) => {
        return db
            .prepare(
                `SELECT t.* FROM tags t
         JOIN document_tags dt ON dt.tag_id = t.id
         WHERE dt.document_id = ?`
            )
            .all(documentId)
    })

    ipcMain.handle('tags:attachToDocument', (_event, documentId: string, tagId: string) => {
        db.prepare(
            'INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)'
        ).run(documentId, tagId)
    })

    ipcMain.handle('tags:detachFromDocument', (_event, documentId: string, tagId: string) => {
        db.prepare('DELETE FROM document_tags WHERE document_id = ? AND tag_id = ?').run(
            documentId,
            tagId
        )
    })
}