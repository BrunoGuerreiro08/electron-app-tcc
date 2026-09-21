import { app, ipcMain } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

/**
 * Storage for imported, READ-ONLY review snapshots.
 *
 * Deliberately separate from the collections database: there is no update channel
 * at all, so an imported snapshot cannot be edited, synced, or mixed with the
 * user's own collections. Main process treats `data` as an opaque payload — the
 * renderer validates/normalises it — and only guards what is its own job:
 * paths, sizes, and atomic writes.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_BYTES = 12 * 1024 * 1024

const reviewsDir = () => path.join(app.getPath('userData'), 'reviews')
const fileFor = (id: string) => path.join(reviewsDir(), `${id}.json`)

function assertId(id: unknown): asserts id is string {
    // The id ends up in a file path — never trust it from the renderer.
    if (typeof id !== 'string' || !UUID_RE.test(id)) throw new Error('Invalid review id')
}

async function writeAtomic(file: string, content: string) {
    const tmp = `${file}.tmp`
    await fs.writeFile(tmp, content, 'utf8')
    await fs.rename(tmp, file) // a crash mid-write never leaves a half-written review
}

interface StoredFile {
    id: string
    importedAt: string
    sourceFileName: string
    summary: unknown
    data: unknown
}

export function registerReviewHandlers() {
    ipcMain.handle('reviews:list', async () => {
        await fs.mkdir(reviewsDir(), { recursive: true })
        const names = (await fs.readdir(reviewsDir())).filter((n) => n.endsWith('.json'))
        const items: Array<Omit<StoredFile, 'data'>> = []
        for (const n of names) {
            try {
                const parsed = JSON.parse(await fs.readFile(path.join(reviewsDir(), n), 'utf8')) as StoredFile
                items.push({
                    id: parsed.id,
                    importedAt: parsed.importedAt,
                    sourceFileName: parsed.sourceFileName,
                    summary: parsed.summary,
                })
            } catch (err) {
                // One corrupt file must not hide the others.
                console.error(`[reviews] skipping unreadable file ${n}:`, err)
            }
        }
        return items.sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    })

    ipcMain.handle('reviews:get', async (_e, id: unknown) => {
        assertId(id)
        return JSON.parse(await fs.readFile(fileFor(id), 'utf8')) as StoredFile
    })

    ipcMain.handle(
        'reviews:save',
        async (_e, input: { data: unknown; summary: unknown; sourceFileName: unknown }) => {
            const serialized = JSON.stringify(input?.data ?? null)
            if (serialized.length > MAX_BYTES) throw new Error('Review too large')
            if (typeof input?.data !== 'object' || input.data === null) throw new Error('Invalid review data')

            const record: StoredFile = {
                id: randomUUID(),
                importedAt: new Date().toISOString(),
                // Display metadata only (the file on disk is named by the UUID). Strip both
                // Windows and POSIX separators regardless of the current OS.
                sourceFileName: (String(input.sourceFileName ?? '').split(/[\\/]/).pop() || 'export.json').slice(0, 255),
                summary: input.summary,
                data: input.data,
            }
            await fs.mkdir(reviewsDir(), { recursive: true })
            await writeAtomic(fileFor(record.id), JSON.stringify(record))
            return { id: record.id, importedAt: record.importedAt, sourceFileName: record.sourceFileName, summary: record.summary }
        }
    )

    ipcMain.handle('reviews:remove', async (_e, id: unknown) => {
        assertId(id)
        await fs.rm(fileFor(id), { force: true })
    })
}