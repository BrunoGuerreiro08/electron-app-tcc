import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { dialog, shell, type BrowserWindow } from 'electron'
import { getStorageRoot } from './fileStorage'
import { getDb } from './db'

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png']
const MAX_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

interface PickedFile {
    path: string
    size: number
}

/**
 * Opens a native file picker filtered to PDF/JPG/PNG, then validates
 * size before returning anything to the renderer — rejects oversized
 * files immediately rather than after a wasted copy (NFR-06-05).
 */
type PickResult =
    | { ok: true; path: string; size: number }
    | { ok: false; error: string }

export async function pickFile(win: BrowserWindow): Promise<PickResult | null> {
    const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'Documents', extensions: ['pdf', 'jpg', 'jpeg', 'png'] }],
    })

    if (result.canceled || result.filePaths.length === 0) return null

    const filePath = result.filePaths[0]
    const ext = path.extname(filePath).toLowerCase()
    const { size } = fs.statSync(filePath)

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return { ok: false, error: 'Only PDF, JPG, and PNG files are accepted.' }
    }
    if (size > MAX_SIZE_BYTES) {
        return { ok: false, error: 'File exceeds the 20 MB limit.' }
    }

    return { ok: true, path: filePath, size }
}

/**
 * Copies a picked file into the storage folder and only updates the
 * document's file_path/file_status once the copy succeeds (NFR-06-01).
 * If the copy fails, the save is aborted and nothing in the DB changes
 * (NFR-06-04) — the caller sees the thrown error and can notify the user.
 */
type AttachResult = { ok: true; filePath: string } | { ok: false; error: string }

export function attachFileToDocument(documentId: string, sourcePath: string): AttachResult {
    const ext = path.extname(sourcePath).toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return { ok: false, error: 'Only PDF, JPG, and PNG files are accepted.' }
    }

    const { size } = fs.statSync(sourcePath)
    if (size > MAX_SIZE_BYTES) {
        return { ok: false, error: 'File exceeds the 20 MB limit.' }
    }

    const root = getStorageRoot()
    const destDir = path.join(root, 'documents')
    fs.mkdirSync(destDir, { recursive: true })

    const destination = path.join(destDir, `${documentId}-${randomUUID()}${ext}`)

    fs.copyFileSync(sourcePath, destination)

    try {
        getDb().prepare(`UPDATE documents SET file_path = ?, file_status = 'ready' WHERE id = ?`).run(
            destination,
            documentId
        )
    } catch (err) {
        fs.unlinkSync(destination)
        // A DB write failing after a successful copy is genuinely
        // unexpected — this one still throws, on purpose.
        throw err
    }

    return { ok: true, filePath: destination }
}

export function removeFileFromDocument(documentId: string) {
    const row = getDb().prepare('SELECT file_path FROM documents WHERE id = ?').get(documentId) as
        | { file_path: string | null }
        | undefined

    if (row?.file_path && fs.existsSync(row.file_path)) {
        fs.unlinkSync(row.file_path)
    }

    getDb().prepare(
        `UPDATE documents SET file_path = NULL, file_status = 'pending' WHERE id = ?`
    ).run(documentId)
}

export function openDocumentFile(documentId: string) {
    const row = getDb().prepare('SELECT file_path FROM documents WHERE id = ?').get(documentId) as
        | { file_path: string | null }
        | undefined

    if (!row?.file_path || !fs.existsSync(row.file_path)) {
        throw new Error('File not found.')
    }

    shell.openPath(row.file_path)
}

/**
 * On app load, detects files on disk (under the storage root) with no
 * matching documents.file_path, and documents whose file_path points
 * to a missing file — queues both for cleanup (NFR-06-03).
 */
export function detectOrphans(): { orphanedFiles: string[]; missingFiles: string[] } {
    const root = path.join(getStorageRoot(), 'documents')
    const orphanedFiles: string[] = []
    const missingFiles: string[] = []

    const referencedPaths = new Set(
        (
            getDb().prepare(`SELECT file_path FROM documents WHERE file_path IS NOT NULL`).all() as {
                file_path: string
            }[]
        ).map((r) => path.resolve(r.file_path))
    )

    if (fs.existsSync(root)) {
        for (const entry of fs.readdirSync(root)) {
            const full = path.resolve(path.join(root, entry))
            if (!referencedPaths.has(full)) {
                orphanedFiles.push(full)
            }
        }
    }

    for (const referenced of referencedPaths) {
        if (!fs.existsSync(referenced)) {
            missingFiles.push(referenced)
        }
    }

    if (missingFiles.length > 0) {
        const markOrphaned = getDb().prepare(
            `UPDATE documents SET file_status = 'orphaned' WHERE file_path = ?`
        )
        for (const missing of missingFiles) {
            markOrphaned.run(missing)
        }
    }

    return { orphanedFiles, missingFiles }
}