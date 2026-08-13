import { ipcMain } from 'electron'
import { getDb } from '../db'
import { randomUUID } from 'node:crypto'

interface DocumentInput {
    title: string
    issuer?: string
    issuedAt?: string
    quantity?: number
    hours?: number
    notes?: string
    filePath?: string
}

export function registerDocumentHandlers() {
    ipcMain.handle('documents:list', () => {
        return getDb().prepare('SELECT * FROM documents ORDER BY created_at DESC').all()
    })

    // "Unfiled" documents — logged but not linked to any category yet.
    // Supports the "add throughout the year, organize later" workflow.
    ipcMain.handle('documents:listUnlinked', () => {
        return getDb()
            .prepare(
                `SELECT d.* FROM documents d
         LEFT JOIN document_category_links l ON l.document_id = d.id
         WHERE l.id IS NULL
         ORDER BY d.created_at DESC`
            )
            .all()
    })

    ipcMain.handle('documents:create', (_event, input: DocumentInput) => {
        const id = randomUUID()
        getDb().prepare(
            `INSERT INTO documents (id, title, issuer, issued_at, quantity, hours, notes, file_path, file_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
            id,
            input.title,
            input.issuer ?? null,
            input.issuedAt ?? null,
            input.quantity ?? 1,
            input.hours ?? null,
            input.notes ?? null,
            input.filePath ?? null,
            input.filePath ? 'ready' : 'pending'
        )
        return id
    })

    ipcMain.handle('documents:update', (_event, id: string, updates: Partial<DocumentInput>) => {
        const current = getDb().prepare('SELECT * FROM documents WHERE id = ?').get(id) as any
        if (!current) throw new Error('Document not found')

        getDb().prepare(
            `UPDATE documents SET title = ?, issuer = ?, issued_at = ?, quantity = ?, hours = ?, notes = ?
       WHERE id = ?`
        ).run(
            updates.title ?? current.title,
            updates.issuer ?? current.issuer,
            updates.issuedAt ?? current.issued_at,
            updates.quantity ?? current.quantity,
            updates.hours ?? current.hours,
            updates.notes ?? current.notes,
            id
        )
    })

    ipcMain.handle('documents:delete', (_event, id: string) => {
        // Cascades document_tags and document_category_links.
        // File deletion (native fs) is a separate concern — wire in once
        // the FileHandler service exists.
        getDb().prepare('DELETE FROM documents WHERE id = ?').run(id)
    })
}