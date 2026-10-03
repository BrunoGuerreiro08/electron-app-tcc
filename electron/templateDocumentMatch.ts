import path from 'node:path'
import { createHash } from 'node:crypto'
import AdmZip from 'adm-zip'
import { getDb } from './db'
import { getOrBackfillHash } from './fileHandler'
import { sanitizeSegment } from '../src/services/dossierExport/sanitizeName'
import type { TemplateFile } from './templates'

export type DocumentMatchStatus = 'existing' | 'add' | 'missing'

export interface DocumentMatch {
    title: string
    issued_at: string | null
    quantity: number
    hours: number | null
    status: DocumentMatchStatus
    /** Only set when status === 'existing'. */
    existingDocumentId?: string
    /** Only set when status === 'add' — the file's bytes, read from the ZIP. */
    buffer?: Buffer
    /** Only set when status === 'add'. */
    ext?: string
}

export interface DocumentMatchSummary {
    added: number
    existing: number
    missing: number
}

export interface DocumentMatchResult {
    /**
     * One entry per category, in the exact same groups → subgroups →
     * categories walk order `applyTemplate` uses — callers zip the two
     * together with a shared running index rather than looking anything
     * up by name/id.
     */
    categoryMatches: DocumentMatch[][]
    summary: DocumentMatchSummary
}

/**
 * Strips the " (2)", " (3)", … dedupe suffix dedupeInFolder appends when two
 * documents in the same category sanitize to the same name, and lowercases
 * for a case-insensitive compare.
 */
function canonicalTitleKey(name: string): string {
    return name.replace(/ \(\d+\)$/, '').toLowerCase()
}

interface ZipFileEntry {
    buffer: Buffer
    ext: string
}

/**
 * Keyed by the document's TITLE, sanitized the exact same way
 * buildDossierPlan names an "individual" dossier ZIP's entries — NOT by the
 * document's internal storage filename (a random `<uuid>-<uuid>.ext`, see
 * fileHandler.ts, which is what a collection_export's `file_name` field
 * actually records and is therefore useless for matching against a ZIP).
 * Matching is by title anywhere in the ZIP, ignoring the folder path.
 */
function loadZipEntries(zipPath: string): Map<string, ZipFileEntry> {
    const zip = new AdmZip(zipPath)
    const entries = new Map<string, ZipFileEntry>()
    for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue
        const base = path.basename(entry.entryName)
        const { name, ext } = path.parse(base)
        const key = canonicalTitleKey(name)
        if (!entries.has(key)) entries.set(key, { buffer: entry.getData(), ext })
    }
    return entries
}

/**
 * Matches a template's per-category `documents[]` list (present only when
 * the template file is actually a `collection_export` being reused) against
 * an uploaded ZIP's contents. Pure read: the only writes are the lazy hash
 * backfill in getOrBackfillHash, which is safe to run during a preview.
 *
 * Reuse rule: a listed document counts as `existing` only when its
 * (sanitized) title is found in the ZIP AND that entry's content hash
 * matches an existing document's hash AND that existing document's title
 * matches — otherwise it's `add` (ZIP entry found, no matching existing
 * document) or `missing` (title not found in the ZIP at all).
 */
export function matchTemplateDocuments(template: TemplateFile, zipPath: string | null): DocumentMatchResult {
    const zipEntries = zipPath ? loadZipEntries(zipPath) : null
    const categoryMatches: DocumentMatch[][] = []
    const summary: DocumentMatchSummary = { added: 0, existing: 0, missing: 0 }

    const db = getDb()
    const findByTitle = db.prepare(
        `SELECT id FROM documents WHERE title = ? AND file_path IS NOT NULL`
    )

    for (const grp of template.groups) {
        for (const sg of grp.subgroups) {
            for (const cat of sg.categories) {
                const matches: DocumentMatch[] = []

                for (const docRef of cat.documents ?? []) {
                    const key = canonicalTitleKey(sanitizeSegment(docRef.title, 'documento'))
                    const zipFile = zipEntries?.get(key)

                    if (!zipFile) {
                        matches.push({
                            title: docRef.title,
                            issued_at: docRef.issued_at,
                            quantity: docRef.quantity,
                            hours: docRef.hours,
                            status: 'missing',
                        })
                        summary.missing++
                        continue
                    }

                    const hash = createHash('sha256').update(zipFile.buffer).digest('hex')
                    const candidates = findByTitle.all(docRef.title) as { id: string }[]
                    const existing = candidates.find((c) => getOrBackfillHash(c.id) === hash)

                    if (existing) {
                        matches.push({
                            title: docRef.title,
                            issued_at: docRef.issued_at,
                            quantity: docRef.quantity,
                            hours: docRef.hours,
                            status: 'existing',
                            existingDocumentId: existing.id,
                        })
                        summary.existing++
                    } else {
                        matches.push({
                            title: docRef.title,
                            issued_at: docRef.issued_at,
                            quantity: docRef.quantity,
                            hours: docRef.hours,
                            status: 'add',
                            buffer: zipFile.buffer,
                            ext: zipFile.ext,
                        })
                        summary.added++
                    }
                }

                categoryMatches.push(matches)
            }
        }
    }

    return { categoryMatches, summary }
}
