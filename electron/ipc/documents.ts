import { ipcMain } from 'electron'
import { getDb } from '../db'
import { randomUUID } from 'node:crypto'
import { adoptDroppedFile, deleteDocumentWithFile } from '../fileHandler'

interface DocumentInput {
    title: string
    issuer?: string
    issuedAt?: string
    quantity?: number
    hours?: number
    notes?: string
    filePath?: string
}

interface BulkImportItem {
    fileName: string
    title: string
}

interface BulkImportResult {
    fileName: string
    ok: boolean
    documentId?: string
    error?: string
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

    /**
     * Creates one bare document row per item (title only) and adopts its
     * already-present file via adoptDroppedFile — a rename, not a copy,
     * since the file is already inside the storage folder (someone
     * dropped it there by hand). Deliberately does NOT ask for
     * issuer/date/hours/category: those stay editable later via
     * documents:update and documentCategoryLinks, same as any
     * manually-created document.
     *
     * Per-item, not all-or-nothing: one bad file doesn't block the rest
     * of the batch. If adoption fails after the row was created, the row
     * is deleted — a document should never claim a file that isn't
     * actually there (mirrors NFR-06-04).
     */
    ipcMain.handle('documents:bulkImport', (_event, items: BulkImportItem[]) => {
        const results: BulkImportResult[] = []

        for (const item of items) {
            const id = randomUUID()
            getDb()
                .prepare(`INSERT INTO documents (id, title, quantity, file_status) VALUES (?, ?, 1, 'pending')`)
                .run(id, item.title)

            const adopted = adoptDroppedFile(id, item.fileName)

            if (!adopted.ok) {
                deleteDocumentWithFile(id)
                results.push({ fileName: item.fileName, ok: false, error: adopted.error })
                continue
            }

            results.push({ fileName: item.fileName, ok: true, documentId: id })
        }

        return results
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
        deleteDocumentWithFile(id)
    })
}