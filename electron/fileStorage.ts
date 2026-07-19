import path from 'node:path'
import fs from 'node:fs'
import { app, dialog, type BrowserWindow } from 'electron'
import { store } from './store'
import { db } from './db'

const DEFAULT_SUBDIR = 'document-files'

function defaultStorageRoot(): string {
    return path.join(app.getPath('userData'), DEFAULT_SUBDIR)
}

/**
 * Resolves the folder documents are actually stored in. Falls back to
 * the default app-data location if the user hasn't picked a custom one
 * (e.g. a Google Drive-synced folder) — this is the seam the professor
 * asked for: FileHandler stays storage-agnostic, only the root path
 * changes (Adapter pattern, per project-context.md).
 */
export function getStorageRoot(): string {
    const configured = store.get('storageFolder')
    const root = configured ?? defaultStorageRoot()
    fs.mkdirSync(root, { recursive: true })
    return root
}

export function getConfiguredStorageFolder(): string | null {
    return store.get('storageFolder')
}

/**
 * Opens a native folder picker. Returns null if the user cancelled.
 */
export async function pickStorageFolder(win: BrowserWindow): Promise<string | null> {
    const result = await dialog.showOpenDialog(win, {
        properties: ['openDirectory', 'createDirectory'],
        title: 'Choose a folder for document storage',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
}

interface MigrationResult {
    moved: number
    failed: number
    errors: string[]
}

/**
 * Moves existing document files from the old root to a newly chosen
 * one, and updates each document's stored file_path to match. Only
 * touches files that actually live under the old root — anything else
 * (e.g. already-orphaned paths) is left alone and reported as a failure
 * rather than silently skipped.
 */
export function migrateStorageFolder(newRoot: string): MigrationResult {
    const oldRoot = getStorageRoot() // ensures it exists, resolves default if unset
    fs.mkdirSync(newRoot, { recursive: true })

    const result: MigrationResult = { moved: 0, failed: 0, errors: [] }

    if (path.resolve(oldRoot) === path.resolve(newRoot)) {
        store.set('storageFolder', newRoot)
        return result
    }

    const rows = db
        .prepare(`SELECT id, file_path FROM documents WHERE file_path IS NOT NULL`)
        .all() as { id: string; file_path: string }[]

    const updateStmt = db.prepare('UPDATE documents SET file_path = ? WHERE id = ?')

    for (const row of rows) {
        const relative = path.relative(oldRoot, row.file_path)
        const isInsideOldRoot = !relative.startsWith('..') && !path.isAbsolute(relative)

        if (!isInsideOldRoot) {
            result.failed++
            result.errors.push(`${row.file_path} is not under the current storage folder — skipped.`)
            continue
        }

        const destination = path.join(newRoot, relative)

        try {
            fs.mkdirSync(path.dirname(destination), { recursive: true })
            fs.renameSync(row.file_path, destination)
            updateStmt.run(destination, row.id)
            result.moved++
        } catch (err) {
            result.failed++
            result.errors.push(`Failed to move ${row.file_path}: ${(err as Error).message}`)
        }
    }

    store.set('storageFolder', newRoot)
    return result
}