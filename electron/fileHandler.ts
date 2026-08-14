import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { dialog, shell, type BrowserWindow } from 'electron'
import { getStorageRoot } from './fileStorage'
import { getDb } from './db'

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png']
const MAX_SIZE_BYTES = 20 * 1024 * 1024 // 20 MB

// Every file the app copies or adopts ends up named `<uuid>-<uuid>.ext` —
// the document's id, a hyphen, a fresh random uuid, and the extension.
// That naming convention IS the ownership signal: a file matching it is
// already tracked by some document; a file that doesn't match it is
// something a person dropped in by hand. No separate bookkeeping table
// needed — the filename says everything.
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const OWNED_FILENAME_PATTERN = new RegExp(`^${UUID}-${UUID}\\.[a-zA-Z0-9]+$`, 'i')

function isOwnedFilename(name: string): boolean {
    return OWNED_FILENAME_PATTERN.test(name)
}

function documentsDir(): string {
    const dir = path.join(getStorageRoot(), 'documents')
    fs.mkdirSync(dir, { recursive: true })
    return dir
}

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
 * Copies a picked file (from anywhere on disk — e.g. Downloads) into the
 * storage folder and only updates the document's file_path/file_status
 * once the copy succeeds (NFR-06-01). If the copy fails, the save is
 * aborted and nothing in the DB changes (NFR-06-04).
 *
 * This is for the manual "Attach" flow, where the source is genuinely
 * external. For files already sitting inside the storage folder (dropped
 * in by hand), use adoptDroppedFile instead — that one renames in place
 * rather than duplicating bytes the app already has.
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

    const destDir = documentsDir()
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

/**
 * Adopts a file that's already sitting inside the storage folder's
 * documents/ directory (i.e. someone dropped it in by hand) by renaming
 * it to the owned naming convention and linking it to `documentId`.
 *
 * `fileName` must be a bare filename with no path segments — it's
 * resolved strictly against documentsDir(), never trusted as a path, so
 * a crafted value like `../../something` can't escape the storage
 * folder. Same-filesystem rename, not a copy: the app already has these
 * bytes, there's nothing to duplicate.
 */
export function adoptDroppedFile(documentId: string, fileName: string): AttachResult {
    if (fileName !== path.basename(fileName)) {
        return { ok: false, error: 'Invalid file name.' }
    }

    const dir = documentsDir()
    const sourcePath = path.join(dir, fileName)

    if (!fs.existsSync(sourcePath)) {
        return { ok: false, error: 'File no longer exists — it may have been moved or deleted.' }
    }

    const ext = path.extname(fileName).toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return { ok: false, error: 'Only PDF, JPG, and PNG files are accepted.' }
    }

    const { size } = fs.statSync(sourcePath)
    if (size > MAX_SIZE_BYTES) {
        return { ok: false, error: 'File exceeds the 20 MB limit.' }
    }

    const destination = path.join(dir, `${documentId}-${randomUUID()}${ext}`)
    fs.renameSync(sourcePath, destination)

    try {
        getDb().prepare(`UPDATE documents SET file_path = ?, file_status = 'ready' WHERE id = ?`).run(
            destination,
            documentId
        )
    } catch (err) {
        // Rename it back rather than leaving it stranded under a
        // generated name with nothing pointing at it.
        fs.renameSync(destination, sourcePath)
        throw err
    }

    return { ok: true, filePath: destination }
}

export function removeFileFromDocument(documentId: string) {
    const db = getDb()
    const row = db.prepare('SELECT file_path FROM documents WHERE id = ?').get(documentId) as
        | { file_path: string | null }
        | undefined

    if (row?.file_path && fs.existsSync(row.file_path)) {
        fs.unlinkSync(row.file_path)
    }

    db.prepare(`UPDATE documents SET file_path = NULL, file_status = 'pending' WHERE id = ?`).run(documentId)
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
 * On app load, detects files with no matching documents.file_path, and
 * documents whose file_path points to a missing file — queues both for
 * cleanup (NFR-06-03).
 *
 * Only considers files that already follow the owned naming convention.
 * A file that DOESN'T match it isn't an orphan — it's a dropped file
 * nobody's reviewed yet, which is detectDroppedFiles's job, not this
 * one's. Conflating the two would flag every fresh drop as "broken"
 * before the user ever gets a chance to import it.
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
            if (!isOwnedFilename(entry)) continue // not orphaned — undiscovered, see detectDroppedFiles

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

export interface ScannedFile {
    path: string
    name: string
    size: number
    valid: boolean
    reason?: string
}

/**
 * Scans the storage folder's documents/ directory (a flat scan — this is
 * an app-managed folder, not an arbitrary user directory, so there's no
 * need to recurse into subfolders) for files that DON'T match the owned
 * naming convention, and classifies each against the same extension/size
 * rules as single-file attach (NFR-06-05).
 *
 * This is the whole "bulk import" entry point now: there's no folder
 * picker and no separate tracking table. A file's presence here, under a
 * name the app didn't generate, is itself the signal that it's new.
 */
export function detectDroppedFiles(): ScannedFile[] {
    const dir = documentsDir()
    const results: ScannedFile[] = []

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isFile()) continue
        if (isOwnedFilename(entry.name)) continue // already owned — not a drop

        const fullPath = path.join(dir, entry.name)
        const ext = path.extname(entry.name).toLowerCase()
        const { size } = fs.statSync(fullPath)

        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            results.push({ path: fullPath, name: entry.name, size, valid: false, reason: 'Unsupported file type.' })
            continue
        }
        if (size > MAX_SIZE_BYTES) {
            const mb = (size / (1024 * 1024)).toFixed(1)
            results.push({
                path: fullPath,
                name: entry.name,
                size,
                valid: false,
                reason: `Exceeds the 20 MB limit (${mb} MB).`,
            })
            continue
        }

        results.push({ path: fullPath, name: entry.name, size, valid: true })
    }

    return results
}