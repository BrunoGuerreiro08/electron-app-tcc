import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, dialog, type BrowserWindow } from 'electron'
import { getDb, getActiveUserId } from './db'

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

export type Rule = FlatRule | HoursRule | CappedRule

export interface TemplateCategory {
    name: string
    display_order: number
    rule: Rule
}

export interface TemplateSubgroup {
    name: string
    display_order: number
    min_points?: number | null
    max_points?: number | null
    categories: TemplateCategory[]
}

export interface TemplateFile {
    schemaVersion: 1
    name: string
    description?: string
    subgroups: TemplateSubgroup[]
}

export interface TemplateSummary {
    fileName: string
    source: 'official' | 'imported'
    template: TemplateFile
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
 * Bundled with the installer, shared across every user on this device,
 * read-only from the app's perspective. ASSUMPTION: in a packaged build
 * this expects an `extraResources` entry in your electron-builder config
 * copying an "official templates" folder to `resources/templates/
 * official` — haven't seen that config, so double-check this path
 * matches once you wire up packaging. In dev, reads straight from the
 * project source instead.
 */
function getOfficialTemplatesDir(): string {
    return app.isPackaged
        ? path.join(process.resourcesPath, 'templates', 'official')
        : path.join(app.getAppPath(), 'electron', 'templates', 'official')
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

    if (!Array.isArray(t.subgroups) || t.subgroups.length === 0) {
        errors.push('Template must have at least one subgroup.')
    } else {
        t.subgroups.forEach((sg: unknown, i: number) => {
            const sgPath = `subgroups[${i}]`
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
            })
        })
    }

    // Mirrors NFR-A01-01: a template with no valid category anywhere is
    // useless even if every individual field technically parsed.
    if (Array.isArray(t.subgroups) && t.subgroups.length > 0 && !hasValidCategory) {
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
    return listTemplatesIn(getOfficialTemplatesDir(), 'official')
}

export function listImportedTemplates(): TemplateSummary[] {
    return listTemplatesIn(getImportedTemplatesDir(), 'imported')
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

// --- Apply ---------------------------------------------------------

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
 */
export function applyTemplate(
    source: { kind: 'official' | 'imported'; fileName: string },
    collectionName: string,
    color: string | null
): string {
    const dir = source.kind === 'official' ? getOfficialTemplatesDir() : getImportedTemplatesDir()
    const filePath = path.join(dir, source.fileName)

    const validation = readAndValidate(filePath)
    if (!validation.ok || !validation.template) {
        throw new Error(`Template is no longer valid: ${validation.errors.join(' ')}`)
    }
    const template = validation.template

    const db = getDb()
    const create = db.transaction(() => {
        const collectionId = randomUUID()
        db.prepare('INSERT INTO collections (id, name, color) VALUES (?, ?, ?)').run(
            collectionId,
            collectionName,
            color
        )

        for (const sg of template.subgroups) {
            const subgroupId = randomUUID()
            db.prepare(
                `INSERT INTO subgroups (id, collection_id, name, display_order, min_points, max_points)
                 VALUES (?, ?, ?, ?, ?, ?)`
            ).run(subgroupId, collectionId, sg.name, sg.display_order, sg.min_points ?? null, sg.max_points ?? null)

            for (const cat of sg.categories) {
                db.prepare(
                    `INSERT INTO categories (id, subgroup_id, name, rule, display_order)
                     VALUES (?, ?, ?, ?, ?)`
                ).run(randomUUID(), subgroupId, cat.name, JSON.stringify(cat.rule), cat.display_order)
            }
        }

        return collectionId
    })

    return create()
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

    const subgroupRows = db
        .prepare('SELECT * FROM subgroups WHERE collection_id = ? ORDER BY display_order')
        .all(collectionId) as {
            id: string
            name: string
            display_order: number
            min_points: number | null
            max_points: number | null
        }[]

    const template: TemplateFile = {
        schemaVersion: 1,
        name: collection.name,
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

    const result = await dialog.showSaveDialog(win, {
        title: 'Export template',
        defaultPath: `${slugify(collection.name)}.template.json`,
        filters: [{ name: 'Template', extensions: ['json'] }],
    })
    if (result.canceled || !result.filePath) return null

    fs.writeFileSync(result.filePath, JSON.stringify(template, null, 2), 'utf-8')
    return { ok: true, filePath: result.filePath }
}