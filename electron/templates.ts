/// <reference types="vite/client" />
import fs from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { app, dialog, type BrowserWindow } from 'electron'
import { getDb, getActiveUserId } from './db'
import { adoptDroppedFile, writeTempDroppedFile } from './fileHandler'
import { matchTemplateDocuments, type DocumentMatch, type DocumentMatchSummary } from './templateDocumentMatch'

// --- Schema ---------------------------------------------------------
//
// Mirrors the REAL src/services/scoringEngine/types.ts (confirmed —
// this replaces the earlier entities.md-guessed shape). One detail that
// matters for validation: CappedRule.inner is FlatRule | HoursRule
// ONLY — capped rules can't nest inside each other.
export interface FlatRule {
    type: 'flat'
    pointsPerUnit: number
}

export interface HoursRule {
    type: 'hours'
    pointsPerUnit: number
    unitSize: number
}

export interface CappedRule {
    type: 'capped'
    inner: FlatRule | HoursRule
    cap: number
}

/**
 * Caps EACH document's own contribution individually, before summing —
 * distinct from CappedRule's aggregate-sum cap. See the matching
 * comment in src/services/scoringEngine/types.ts for the full
 * reasoning; kept in sync manually here for the same main/renderer
 * boundary reason as the rest of this file's local Rule shape.
 */
export interface CappedPerDocumentRule {
    type: 'cappedPerDocument'
    inner: FlatRule | HoursRule
    capPerDocument: number
}

export type Rule = FlatRule | HoursRule | CappedRule | CappedPerDocumentRule

/**
 * A document reference carried by a `collection_export` JSON being reused
 * as a template (see src/services/reportEngine/exporters/exportJson.tsx —
 * that export is deliberately kept template-compatible). Absent on a plain
 * structure-only template. `file_name` is what gets matched against an
 * uploaded ZIP's entries at apply time.
 */
export interface TemplateDocumentRef {
    title: string
    issued_at: string | null
    quantity: number
    hours: number | null
    file_name: string | null
}

export interface TemplateCategory {
    name: string
    display_order: number
    rule: Rule
    documents?: TemplateDocumentRef[]
}

export interface TemplateSubgroup {
    name: string
    display_order: number
    min_points?: number | null
    max_points?: number | null
    categories: TemplateCategory[]
}

export interface TemplateGroup {
    name: string
    display_order: number
    min_points?: number | null
    max_points?: number | null
    bonus_rate?: number | null
    subgroups: TemplateSubgroup[]
}

export interface TemplateFile {
    schemaVersion: 1
    name: string
    description?: string
    groups: TemplateGroup[]
}

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

// --- Validation ---------------------------------------------------------

export interface ValidationResult {
    ok: boolean
    errors: string[]
    template?: TemplateFile
}

function validateFlatOrHours(rule: unknown, fieldPath: string, errors: string[]): boolean {
    if (!rule || typeof rule !== 'object') {
        errors.push(`${fieldPath}: rule is missing or not an object.`)
        return false
    }
    const r = rule as Record<string, unknown>

    if (r.type === 'flat') {
        if (typeof r.pointsPerUnit !== 'number' || r.pointsPerUnit <= 0) {
            errors.push(`${fieldPath}: flat rule needs a positive numeric pointsPerUnit.`)
            return false
        }
        return true
    }

    if (r.type === 'hours') {
        if (typeof r.pointsPerUnit !== 'number' || r.pointsPerUnit <= 0) {
            errors.push(`${fieldPath}: hours rule needs a positive numeric pointsPerUnit.`)
            return false
        }
        if (typeof r.unitSize !== 'number' || r.unitSize <= 0) {
            errors.push(`${fieldPath}: hours rule needs a positive numeric unitSize.`)
            return false
        }
        return true
    }

    errors.push(`${fieldPath}: expected "flat" or "hours", got "${String(r.type)}".`)
    return false
}

function validateRule(rule: unknown, fieldPath: string, errors: string[]): rule is Rule {
    if (!rule || typeof rule !== 'object') {
        errors.push(`${fieldPath}: rule is missing or not an object.`)
        return false
    }
    const r = rule as Record<string, unknown>

    if (r.type === 'flat' || r.type === 'hours') {
        return validateFlatOrHours(r, fieldPath, errors)
    }

    if (r.type === 'capped') {
        if (typeof r.cap !== 'number' || r.cap <= 0) {
            errors.push(`${fieldPath}: capped rule needs a numeric cap greater than zero.`)
            return false
        }
        // Deliberately validateFlatOrHours, not a recursive validateRule
        // call — capped rules can't wrap another capped rule.
        if (!validateFlatOrHours(r.inner, `${fieldPath}.inner`, errors)) {
            return false
        }
        return true
    }

    if (r.type === 'cappedPerDocument') {
        if (typeof r.capPerDocument !== 'number' || r.capPerDocument <= 0) {
            errors.push(`${fieldPath}: cappedPerDocument rule needs a numeric capPerDocument greater than zero.`)
            return false
        }
        if (!validateFlatOrHours(r.inner, `${fieldPath}.inner`, errors)) {
            return false
        }
        return true
    }

    errors.push(`${fieldPath}: unknown rule type "${String(r.type)}".`)
    return false
}

/**
 * Validates a parsed JSON value against the template schema, collecting
 * every problem found rather than stopping at the first one — so an
 * import failure can tell the user exactly what's wrong (NFR-12-02)
 * instead of a generic "invalid file" message.
 */
export function validateTemplate(data: unknown): ValidationResult {
    if (!data || typeof data !== 'object') {
        return { ok: false, errors: ['Template file is not a valid JSON object.'] }
    }

    const errors: string[] = []
    const t = data as Record<string, unknown>

    if (t.schemaVersion !== 1) {
        errors.push(`Unsupported schemaVersion (expected 1, got ${JSON.stringify(t.schemaVersion)}).`)
    }
    if (typeof t.name !== 'string' || t.name.trim() === '') {
        errors.push('Template is missing a name.')
    }

    let hasValidCategory = false

    if (!Array.isArray(t.groups) || t.groups.length === 0) {
        errors.push('Template must have at least one group.')
    } else {
        t.groups.forEach((grp: unknown, g: number) => {
            const grpPath = `groups[${g}]`
            if (!grp || typeof grp !== 'object') {
                errors.push(`${grpPath}: not a valid object.`)
                return
            }
            const group = grp as Record<string, unknown>

            if (typeof group.name !== 'string' || group.name.trim() === '') {
                errors.push(`${grpPath}: missing a name.`)
            }
            if (
                typeof group.min_points === 'number' &&
                typeof group.max_points === 'number' &&
                group.max_points <= group.min_points
            ) {
                errors.push(`${grpPath}: max_points must be greater than min_points.`)
            }
            if (group.bonus_rate != null) {
                if (typeof group.bonus_rate !== 'number' || group.bonus_rate <= 0) {
                    errors.push(`${grpPath}: bonus_rate must be a positive number when present.`)
                }
                if (typeof group.min_points !== 'number') {
                    errors.push(`${grpPath}: bonus_rate requires min_points to be set — a surplus bonus is only meaningful relative to a minimum.`)
                }
            }

            if (!Array.isArray(group.subgroups) || group.subgroups.length === 0) {
                errors.push(`${grpPath}: must have at least one subgroup.`)
                return
            }

            group.subgroups.forEach((sg: unknown, i: number) => {
                const sgPath = `${grpPath}.subgroups[${i}]`
                if (!sg || typeof sg !== 'object') {
                    errors.push(`${sgPath}: not a valid object.`)
                    return
                }
                const s = sg as Record<string, unknown>

                if (typeof s.name !== 'string' || s.name.trim() === '') {
                    errors.push(`${sgPath}: missing a name.`)
                }
                if (
                    typeof s.min_points === 'number' &&
                    typeof s.max_points === 'number' &&
                    s.max_points <= s.min_points
                ) {
                    errors.push(`${sgPath}: max_points must be greater than min_points.`)
                }

                if (!Array.isArray(s.categories) || s.categories.length === 0) {
                    errors.push(`${sgPath}: must have at least one category.`)
                    return
                }

                s.categories.forEach((cat: unknown, j: number) => {
                    const catPath = `${sgPath}.categories[${j}]`
                    if (!cat || typeof cat !== 'object') {
                        errors.push(`${catPath}: not a valid object.`)
                        return
                    }
                    const c = cat as Record<string, unknown>

                    if (typeof c.name !== 'string' || c.name.trim() === '') {
                        errors.push(`${catPath}: missing a name.`)
                    }
                    if (validateRule(c.rule, `${catPath}.rule`, errors)) {
                        hasValidCategory = true
                    }

                    // Optional — only present when this file is a collection_export
                    // being reused as a template. Light validation only: this isn't
                    // required for the template to be usable, just for the document
                    // list to be trustworthy if present at all.
                    if (c.documents !== undefined) {
                        if (!Array.isArray(c.documents)) {
                            errors.push(`${catPath}.documents: must be a list.`)
                        } else {
                            c.documents.forEach((docRaw: unknown, di: number) => {
                                const docPath = `${catPath}.documents[${di}]`
                                if (!docRaw || typeof docRaw !== 'object') {
                                    errors.push(`${docPath}: not a valid object.`)
                                    return
                                }
                                const d = docRaw as Record<string, unknown>
                                if (typeof d.title !== 'string' || d.title.trim() === '') {
                                    errors.push(`${docPath}: missing a title.`)
                                }
                                if (d.file_name !== null && typeof d.file_name !== 'string') {
                                    errors.push(`${docPath}.file_name: must be a string or null.`)
                                }
                            })
                        }
                    }
                })
            })
        })
    }

    // Mirrors NFR-A01-01: a template with no valid category anywhere is
    // useless even if every individual field technically parsed.
    if (Array.isArray(t.groups) && t.groups.length > 0 && !hasValidCategory) {
        errors.push('Template must have at least one category with a valid scoring rule.')
    }

    if (errors.length > 0) {
        return { ok: false, errors }
    }

    return { ok: true, errors: [], template: t as unknown as TemplateFile }
}

function readAndValidate(filePath: string): ValidationResult {
    let raw: string
    try {
        raw = fs.readFileSync(filePath, 'utf-8')
    } catch {
        return { ok: false, errors: ['Could not read the file.'] }
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return { ok: false, errors: ['File is not valid JSON.'] }
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

    for (const { fileName, sha256 } of remote) {
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
            if (!validation.ok) throw new Error(validation.errors.join('; '))

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
    | { ok: false; errors: string[] }

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

type PreviewResult = { ok: true; summary: DocumentMatchSummary } | { ok: false; errors: string[] }

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

    const { summary } = matchTemplateDocuments(validation.template, zipPath)
    return { ok: true, summary }
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
        throw new Error(`Template is no longer valid: ${validation.errors.join(' ')}`)
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