/// <reference types="vite/client" />
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { app, dialog, type BrowserWindow } from 'electron'
import { getDb, getActiveUserId } from './db'
import { adoptDroppedFile, writeTempDroppedFile } from './fileHandler'
import { matchTemplateDocuments, type DocumentMatch, type DocumentMatchSummary } from './templateDocumentMatch'
import {
    formatTemplateError,
    validateTemplate,
    type TemplateError,
    type TemplateFile,
    type ValidationResult,
} from '../shared/templateValidation'

export * from '../shared/templateValidation'

export interface TemplateSummary {
    fileName: string
    source: 'official' | 'imported'
    template: TemplateFile
    /** Official only: set when the template arrived or changed recently. */
    change?: 'added' | 'updated'
}

// --- Paths ------------------------------------------------------------

function requireActiveUserId(): string {
    const userId = getActiveUserId()
    if (!userId) throw new Error('No active user — cannot resolve templates folder before login.')
    return userId
}

/**
 * Per-user, writable — where imported templates land. Isolated the same
 * way everything else is: users/<userId>/templates/imported/.
 */
function getImportedTemplatesDir(): string {
    const dir = path.join(app.getPath('userData'), 'users', requireActiveUserId(), 'templates', 'imported')
    fs.mkdirSync(dir, { recursive: true })
    return dir
}

/**
 * Local mirror of the server's official templates (see syncOfficialTemplates).
 * Per device, not per user — official templates are the same for everyone —
 * and readable with the server offline. Read-only to everything but the sync.
 */
function getOfficialTemplatesRoot(): string {
    return path.join(app.getPath('userData'), 'templates')
}

function getOfficialTemplatesDir(): string {
    const dir = path.join(getOfficialTemplatesRoot(), 'official')
    fs.mkdirSync(dir, { recursive: true })
    return dir
}

function slugify(name: string): string {
    return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'template'
}

function readAndValidate(filePath: string): ValidationResult {
    let raw: string
    try {
        raw = fs.readFileSync(filePath, 'utf-8')
    } catch {
        return { ok: false, errors: [{ key: 'file.unreadable' }] }
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return { ok: false, errors: [{ key: 'file.invalidJson' }] }
    }

    return validateTemplate(parsed)
}

// --- Listing ---------------------------------------------------------

function listTemplatesIn(dir: string, source: 'official' | 'imported'): TemplateSummary[] {
    if (!fs.existsSync(dir)) return []

    const summaries: TemplateSummary[] = []
    for (const entry of fs.readdirSync(dir)) {
        if (!entry.endsWith('.json')) continue

        const result = readAndValidate(path.join(dir, entry))
        if (result.ok && result.template) {
            summaries.push({ fileName: entry, source, template: result.template })
        }
        // Invalid files already sitting in the folder (hand-edited,
        // corrupted) are silently skipped from the list rather than
        // crashing it — one bad file shouldn't take down every other
        // template with it.
    }
    return summaries
}

export function listOfficialTemplates(): TemplateSummary[] {
    const { entries } = readOfficialIndex()
    const badgeCutoff = Date.now() - CHANGE_BADGE_MS
    return listTemplatesIn(getOfficialTemplatesDir(), 'official').map((summary) => {
        const entry = entries[summary.fileName]
        return entry?.change && entry.changedAt > badgeCutoff ? { ...summary, change: entry.change } : summary
    })
}

export function listImportedTemplates(): TemplateSummary[] {
    return listTemplatesIn(getImportedTemplatesDir(), 'imported')
}

// --- Official templates sync ------------------------------------------
//
// The server (GET /templates) is the only source of official templates.
// Each sync downloads what changed into the local mirror; the mirror is
// what the app lists and applies from, so they keep working offline.

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const SYNC_TIMEOUT_MS = 5000
const CHANGE_BADGE_MS = 7 * 24 * 60 * 60 * 1000 // "New"/"Updated" badge lifetime

interface OfficialIndexEntry {
    sha256: string
    changedAt: number
    change: 'added' | 'updated'
}

interface OfficialIndex {
    lastSyncedAt: number | null
    entries: Record<string, OfficialIndexEntry>
}

interface ServerTemplateEntry {
    fileName: string
    sha256: string
    valid?: boolean
}

export type OfficialSyncResult =
    | { ok: true; lastSyncedAt: number; added: number; updated: number; removed: number }
    | { ok: false; lastSyncedAt: number | null }

function getOfficialIndexPath(): string {
    return path.join(getOfficialTemplatesRoot(), 'official-index.json')
}

function readOfficialIndex(): OfficialIndex {
    try {
        const parsed = JSON.parse(fs.readFileSync(getOfficialIndexPath(), 'utf-8'))
        return { lastSyncedAt: parsed.lastSyncedAt ?? null, entries: parsed.entries ?? {} }
    } catch {
        return { lastSyncedAt: null, entries: {} }
    }
}

// Write-then-rename, so a crash mid-write never leaves a half file behind.
function writeFileAtomic(filePath: string, content: string): void {
    const tmp = `${filePath}.tmp`
    fs.writeFileSync(tmp, content, 'utf-8')
    fs.renameSync(tmp, filePath)
}

function isSafeTemplateFileName(fileName: string): boolean {
    return fileName === path.basename(fileName) && fileName.endsWith('.json')
}

async function fetchWithTimeout(url: string): Promise<Response> {
    const res = await fetch(url, { signal: AbortSignal.timeout(SYNC_TIMEOUT_MS) })
    if (!res.ok) throw new Error(`${url} responded ${res.status}`)
    return res
}

async function runOfficialSync(): Promise<OfficialSyncResult> {
    const index = readOfficialIndex()

    let remote: ServerTemplateEntry[]
    try {
        const res = await fetchWithTimeout(`${API_BASE}/templates`)
        remote = ((await res.json()) as { templates: ServerTemplateEntry[] }).templates
            .filter((entry) => isSafeTemplateFileName(entry.fileName))
    } catch (err) {
        console.warn('[templates] official sync skipped, server unreachable:', (err as Error).message)
        return { ok: false, lastSyncedAt: index.lastSyncedAt }
    }

    const dir = getOfficialTemplatesDir()
    const now = Date.now()
    let added = 0
    let updated = 0
    let removed = 0

    for (const { fileName, sha256, valid } of remote) {
        // Listed but withdrawn by server-side validation: keep whatever copy
        // is cached (it's still in remoteNames below, so it isn't removed).
        if (valid === false) continue

        const known = index.entries[fileName]
        const filePath = path.join(dir, fileName)
        if (known?.sha256 === sha256 && fs.existsSync(filePath)) continue

        try {
            const res = await fetchWithTimeout(`${API_BASE}/templates/${encodeURIComponent(fileName)}`)
            const bytes = Buffer.from(await res.arrayBuffer())
            // Same bytes the server hashed, before any decoding.
            if (createHash('sha256').update(bytes).digest('hex') !== sha256) {
                throw new Error('checksum mismatch')
            }
            const raw = bytes.toString('utf-8')
            const validation = validateTemplate(JSON.parse(raw))
            if (!validation.ok) throw new Error(validation.errors.map(formatTemplateError).join('; '))

            writeFileAtomic(filePath, raw)
            const change = known ? 'updated' : 'added'
            index.entries[fileName] = { sha256, changedAt: now, change }
            if (change === 'added') added++
            else updated++
        } catch (err) {
            // Keep whatever version is already cached; try again next sync.
            console.warn(`[templates] could not update ${fileName}:`, (err as Error).message)
        }
    }

    // The server dropped these — mirror that. Collections already created
    // from them are unaffected; they're independent copies.
    const remoteNames = new Set(remote.map((entry) => entry.fileName))
    for (const fileName of fs.readdirSync(dir)) {
        if (!fileName.endsWith('.json') || remoteNames.has(fileName)) continue
        fs.rmSync(path.join(dir, fileName), { force: true })
        delete index.entries[fileName]
        removed++
    }
    for (const fileName of Object.keys(index.entries)) {
        if (!remoteNames.has(fileName)) delete index.entries[fileName]
    }

    index.lastSyncedAt = now
    writeFileAtomic(getOfficialIndexPath(), JSON.stringify(index, null, 2))
    return { ok: true, lastSyncedAt: now, added, updated, removed }
}

let syncInFlight: Promise<OfficialSyncResult> | null = null

/** Never throws: on any failure the cached templates stay as they were. */
export function syncOfficialTemplates(): Promise<OfficialSyncResult> {
    syncInFlight ??= runOfficialSync()
        .catch((err): OfficialSyncResult => {
            console.error('[templates] official sync failed:', err)
            return { ok: false, lastSyncedAt: readOfficialIndex().lastSyncedAt }
        })
        .finally(() => {
            syncInFlight = null
        })
    return syncInFlight
}

export function getOfficialTemplatesStatus(): { lastSyncedAt: number | null } {
    return { lastSyncedAt: readOfficialIndex().lastSyncedAt }
}

// --- Import ---------------------------------------------------------

type ImportResult =
    | { ok: true; fileName: string; template: TemplateFile }
    | { ok: false; errors: TemplateError[] }

/**
 * Opens a native file picker, validates the chosen file (NFR-12-01), and
 * — only if valid — copies it into this user's imported/ folder under a
 * de-duplicated, slugified filename. Nothing is written on failure.
 */
export async function pickAndImportTemplate(win: BrowserWindow): Promise<ImportResult | null> {
    const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'Template', extensions: ['json'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null

    const validation = readAndValidate(result.filePaths[0])
    if (!validation.ok || !validation.template) {
        return { ok: false, errors: validation.errors }
    }

    const dir = getImportedTemplatesDir()
    const base = slugify(validation.template.name)
    let fileName = `${base}.json`
    let destination = path.join(dir, fileName)
    let suffix = 2
    while (fs.existsSync(destination)) {
        fileName = `${base}-${suffix}.json`
        destination = path.join(dir, fileName)
        suffix++
    }

    fs.copyFileSync(result.filePaths[0], destination)

    return { ok: true, fileName, template: validation.template }
}

export function deleteImportedTemplate(fileName: string): void {
    if (fileName !== path.basename(fileName)) {
        throw new Error('Invalid file name.')
    }
    const filePath = path.join(getImportedTemplatesDir(), fileName)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}

// --- Document matching (template + ZIP) --------------------------------

/** Opens a native file picker filtered to .zip — the documents bundle paired with a template. */
export async function pickDocumentsZip(win: BrowserWindow): Promise<string | null> {
    const result = await dialog.showOpenDialog(win, {
        properties: ['openFile'],
        filters: [{ name: 'ZIP', extensions: ['zip'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
}

type PreviewResult = { ok: true; summary: DocumentMatchSummary } | { ok: false; errors: TemplateError[] }

/**
 * Read-only preview of what applying `source` + `zipPath` together would
 * do, shown before the user commits to actually creating the collection.
 * `applyTemplate` re-runs the same match itself rather than trusting this
 * result, so the two can never drift apart.
 */
export function previewDocumentMatch(
    source: { kind: 'official' | 'imported'; fileName: string },
    zipPath: string
): PreviewResult {
    const dir = source.kind === 'official' ? getOfficialTemplatesDir() : getImportedTemplatesDir()
    const filePath = path.join(dir, source.fileName)

    const validation = readAndValidate(filePath)
    if (!validation.ok || !validation.template) {
        return { ok: false, errors: validation.errors }
    }

    try {
        const { summary } = matchTemplateDocuments(validation.template, zipPath)
        return { ok: true, summary }
    } catch (err) {
        // Corrupt or non-ZIP file: report it like any other problem instead
        // of rejecting the IPC call, which the dialog had no message for.
        console.warn('[templates] could not read documents ZIP:', err)
        return { ok: false, errors: [{ key: 'zip.unreadable' }] }
    }
}

// --- Apply ---------------------------------------------------------

/** Attaches one matched document to a freshly-created category, inside the caller's transaction. */
function attachMatchedDocument(categoryId: string, match: DocumentMatch): void {
    if (match.status === 'missing') {
        // Listed in the template but not found in the ZIP — still create the
        // document and link it to the category so the collection matches
        // the template's content, just left unattached (file_status stays
        // 'pending', exactly like any manually-created document with no
        // file yet).
        const documentId = randomUUID()
        getDb()
            .prepare(
                `INSERT INTO documents (id, title, issued_at, quantity, hours, file_status) VALUES (?, ?, ?, ?, ?, 'pending')`
            )
            .run(documentId, match.title, match.issued_at, match.quantity, match.hours)

        getDb()
            .prepare(`INSERT OR IGNORE INTO document_category_links (id, document_id, category_id) VALUES (?, ?, ?)`)
            .run(randomUUID(), documentId, categoryId)
        return
    }

    if (match.status === 'existing') {
        getDb()
            .prepare(
                `INSERT OR IGNORE INTO document_category_links (id, document_id, category_id) VALUES (?, ?, ?)`
            )
            .run(randomUUID(), match.existingDocumentId, categoryId)
        return
    }

    // status === 'add' — create the document row, then adopt the ZIP bytes
    // via the same path a manually-dropped file goes through (naming
    // convention, extension/size validation, file_status/hash updates).
    const documentId = randomUUID()
    getDb()
        .prepare(
            `INSERT INTO documents (id, title, issued_at, quantity, hours, file_status) VALUES (?, ?, ?, ?, ?, 'pending')`
        )
        .run(documentId, match.title, match.issued_at, match.quantity, match.hours)

    const tempFileName = writeTempDroppedFile(match.buffer as Buffer, match.ext || '')
    const adopted = adoptDroppedFile(documentId, tempFileName)
    if (!adopted.ok) {
        // A document should never claim a file it doesn't actually have.
        getDb().prepare('DELETE FROM documents WHERE id = ?').run(documentId)
        return
    }

    getDb()
        .prepare(`INSERT OR IGNORE INTO document_category_links (id, document_id, category_id) VALUES (?, ?, ?)`)
        .run(randomUUID(), documentId, categoryId)
}

export interface ApplyTemplateResult {
    collectionId: string
    documentSummary: DocumentMatchSummary | null
}

/**
 * Instantiates a brand-new collection from a template: fresh UUIDs on
 * every row (NFR-11-01 — nothing from the template file's own state is
 * reused, it has none to begin with per NFR-A02-01), no certificates
 * (templates never carry any), immediately a normal, fully editable
 * collection afterward (NFR-11-02) since it's indistinguishable from one
 * built by hand.
 *
 * Re-validates the file at apply time, not just at import time — it's a
 * plain JSON file a user could have hand-edited on disk since importing.
 * Wrapped in a single transaction: either the whole structure is
 * created, or none of it is.
 *
 * When `zipPath` is given and the template carries a `documents[]` list
 * (i.e. it's a collection_export being reused as a template), the match
 * against the ZIP is freshly recomputed here rather than trusting whatever
 * a prior preview call returned, so the two can never drift apart. The
 * match itself is read-only (aside from the harmless, idempotent hash
 * backfill) — only the actual document/link creation it feeds into runs
 * inside the transaction below.
 */
export function applyTemplate(
    source: { kind: 'official' | 'imported'; fileName: string },
    collectionName: string,
    color: string | null,
    zipPath: string | null = null
): ApplyTemplateResult {
    const dir = source.kind === 'official' ? getOfficialTemplatesDir() : getImportedTemplatesDir()
    const filePath = path.join(dir, source.fileName)

    const validation = readAndValidate(filePath)
    if (!validation.ok || !validation.template) {
        throw new Error(`Template is no longer valid: ${validation.errors.map(formatTemplateError).join(' ')}`)
    }
    const template = validation.template
    const matchResult = zipPath ? matchTemplateDocuments(template, zipPath) : null

    const db = getDb()
    const create = db.transaction(() => {
        const collectionId = randomUUID()
        db.prepare('INSERT INTO collections (id, name, color) VALUES (?, ?, ?)').run(
            collectionId,
            collectionName,
            color
        )

        let categoryIndex = 0

        for (const grp of template.groups) {
            const groupId = randomUUID()
            db.prepare(
                `INSERT INTO groups (id, collection_id, name, display_order, min_points, max_points, bonus_rate)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`
            ).run(
                groupId,
                collectionId,
                grp.name,
                grp.display_order,
                grp.min_points ?? null,
                grp.max_points ?? null,
                grp.bonus_rate ?? null
            )

            for (const sg of grp.subgroups) {
                const subgroupId = randomUUID()
                db.prepare(
                    `INSERT INTO subgroups (id, collection_id, group_id, name, display_order, min_points, max_points)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`
                ).run(
                    subgroupId,
                    collectionId,
                    groupId,
                    sg.name,
                    sg.display_order,
                    sg.min_points ?? null,
                    sg.max_points ?? null
                )

                for (const cat of sg.categories) {
                    const categoryId = randomUUID()
                    db.prepare(
                        `INSERT INTO categories (id, subgroup_id, name, rule, display_order)
                         VALUES (?, ?, ?, ?, ?)`
                    ).run(categoryId, subgroupId, cat.name, JSON.stringify(cat.rule), cat.display_order)

                    const matches = matchResult?.categoryMatches[categoryIndex] ?? []
                    for (const match of matches) {
                        attachMatchedDocument(categoryId, match)
                    }
                    categoryIndex++
                }
            }
        }

        return collectionId
    })

    const collectionId = create()
    return { collectionId, documentSummary: matchResult?.summary ?? null }
}

// --- Export ---------------------------------------------------------

type ExportResult = { ok: true; filePath: string } | { ok: false; error: string }

/**
 * Converts ANY existing collection's structure into a template file
 * (UCA02 — not admin-gated for now, per current scope). Deliberately
 * touches only collections/subgroups/categories — never documents or
 * document_category_links — so certificate data can't leak into an
 * exported file even by accident (NFR-A02-02). Collection id and color
 * are also left out: the template is structure only, and color is
 * chosen fresh whenever the template is applied.
 */
export async function exportCollectionAsTemplate(
    win: BrowserWindow,
    collectionId: string
): Promise<ExportResult | null> {
    const db = getDb()

    const collection = db.prepare('SELECT id, name FROM collections WHERE id = ?').get(collectionId) as
        | { id: string; name: string }
        | undefined
    if (!collection) return { ok: false, error: 'Collection not found.' }

    const groupRows = db
        .prepare('SELECT * FROM groups WHERE collection_id = ? ORDER BY display_order')
        .all(collectionId) as {
            id: string
            name: string
            display_order: number
            min_points: number | null
            max_points: number | null
            bonus_rate: number | null
        }[]

    const template: TemplateFile = {
        schemaVersion: 1,
        name: collection.name,
        groups: groupRows.map((grp) => {
            const subgroupRows = db
                .prepare('SELECT * FROM subgroups WHERE group_id = ? ORDER BY display_order')
                .all(grp.id) as {
                    id: string
                    name: string
                    display_order: number
                    min_points: number | null
                    max_points: number | null
                }[]

            return {
                name: grp.name,
                display_order: grp.display_order,
                min_points: grp.min_points,
                max_points: grp.max_points,
                bonus_rate: grp.bonus_rate,
                subgroups: subgroupRows.map((sg) => {
                    const categoryRows = db
                        .prepare('SELECT * FROM categories WHERE subgroup_id = ? ORDER BY display_order')
                        .all(sg.id) as { name: string; display_order: number; rule: string }[]

                    return {
                        name: sg.name,
                        display_order: sg.display_order,
                        min_points: sg.min_points,
                        max_points: sg.max_points,
                        categories: categoryRows.map((cat) => ({
                            name: cat.name,
                            display_order: cat.display_order,
                            rule: JSON.parse(cat.rule),
                        })),
                    }
                }),
            }
        }),
    }

    const result = await dialog.showSaveDialog(win, {
        title: 'Export template',
        defaultPath: `${slugify(collection.name)}.template.json`,
        filters: [{ name: 'Template', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return null

    fs.writeFileSync(result.filePath, JSON.stringify(template, null, 2), 'utf-8')
    return { ok: true, filePath: result.filePath }
}