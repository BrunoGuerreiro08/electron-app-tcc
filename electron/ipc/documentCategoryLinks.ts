import { ipcMain } from 'electron'
import { getDb } from '../db'
import { randomUUID } from 'node:crypto'
import { recordDelete, recordUpsert } from '../sync/recorder'

export function registerDocumentCategoryLinkHandlers() {
    // Feeds the scoring engine directly — returns rows shaped close to
    // ScorableDocument (id, hours, quantity).
    ipcMain.handle('documentCategoryLinks:listByCategory', (_event, categoryId: string) => {
        return getDb()
            .prepare(
                `SELECT d.id, d.title, d.issuer, d.issued_at, d.hours, d.quantity,d.file_path,d.file_status
        FROM documents d
        JOIN document_category_links l ON l.document_id = d.id
        WHERE l.category_id = ?`
            )
            .all(categoryId)
    })

    ipcMain.handle('documentCategoryLinks:listByDocument', (_event, documentId: string) => {
        return getDb()
            .prepare(
                `SELECT c.*, s.collection_id
         FROM categories c
         JOIN document_category_links l ON l.category_id = c.id
         JOIN subgroups s ON s.id = c.subgroup_id
         WHERE l.document_id = ?`
            )
            .all(documentId)
    })

    ipcMain.handle(
        'documentCategoryLinks:link',
        (_event, documentId: string, categoryId: string) => {
            const db = getDb()
            db.transaction(() => {
                const { changes } = db
                    .prepare('INSERT OR IGNORE INTO document_category_links (id, document_id, category_id) VALUES (?, ?, ?)')
                    .run(randomUUID(), documentId, categoryId)
                if (changes > 0) {
                    recordUpsert('document_category_link', { document_id: documentId, category_id: categoryId }, 'create')
                }
            })()
        }
    )

    ipcMain.handle(
        'documentCategoryLinks:unlink',
        (_event, documentId: string, categoryId: string) => {
            const db = getDb()
            db.transaction(() => {
                recordDelete('document_category_link', { document_id: documentId, category_id: categoryId })
                db.prepare('DELETE FROM document_category_links WHERE document_id = ? AND category_id = ?').run(
                    documentId,
                    categoryId
                )
            })()
        }
    )
}