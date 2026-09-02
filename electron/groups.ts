import { randomUUID } from 'node:crypto'
import { getDb } from './db'

export interface GroupRecord {
    id: string
    collection_id: string
    name: string
    display_order: number
    min_points: number | null
    max_points: number | null
    bonus_rate: number | null
}

interface GroupCreateInput {
    name: string
    displayOrder?: number
}

interface GroupUpdateInput {
    name?: string
    displayOrder?: number
    minPoints?: number | null
    maxPoints?: number | null
    bonusRate?: number | null
}

/**
 * Same checks as validateGroupThresholds in
 * src/services/scoringEngine/validateGroup.ts — duplicated here, not
 * imported, because electron/ (Node/main process) and src/ (Vite
 * renderer) are separate compilation contexts. Same reasoning as
 * templates.ts's local Rule shape.
 *
 * Throws rather than returning a result object — matches
 * subgroups:create/update's existing Promise<string>/Promise<void>
 * shape (no {ok,error} wrapper) for the equivalent min/max check one
 * level down. Same kind of validation, same error-handling convention,
 * rather than introducing a second pattern for it.
 *
 * Keep in sync manually if validateGroupThresholds changes — same
 * caveat already noted on templates.ts's rule validator.
 */
function validateThresholds(minPoints: number | null, maxPoints: number | null, bonusRate: number | null): void {
    if (minPoints != null && !Number.isFinite(minPoints)) {
        throw new Error('min_points must be a finite number.')
    }
    if (maxPoints != null && !Number.isFinite(maxPoints)) {
        throw new Error('max_points must be a finite number.')
    }
    if (minPoints != null && maxPoints != null && maxPoints <= minPoints) {
        throw new Error('max_points must be greater than min_points.')
    }
    if (bonusRate != null) {
        if (!Number.isFinite(bonusRate) || bonusRate <= 0) {
            throw new Error('bonus_rate must be a positive number.')
        }
        if (minPoints == null) {
            throw new Error(
                'bonus_rate requires min_points to be set — a surplus bonus is only meaningful relative to a minimum.'
            )
        }
    }
}

export function listGroupsByCollection(collectionId: string): GroupRecord[] {
    return getDb()
        .prepare('SELECT * FROM groups WHERE collection_id = ? ORDER BY display_order')
        .all(collectionId) as GroupRecord[]
}

/**
 * Creation deliberately doesn't accept min/max/bonus_rate — mirrors
 * subgroups:create's existing shape (name + displayOrder only;
 * thresholds get set afterward via update). Keeps the "create, then
 * configure" flow consistent across both levels rather than introducing
 * a different pattern just for groups.
 */
export function createGroup(collectionId: string, input: GroupCreateInput): string {
    const id = randomUUID()
    getDb()
        .prepare(`INSERT INTO groups (id, collection_id, name, display_order) VALUES (?, ?, ?, ?)`)
        .run(id, collectionId, input.name, input.displayOrder ?? 0)

    return id
}

export function updateGroup(id: string, updates: GroupUpdateInput): void {
    const db = getDb()
    const current = db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as GroupRecord | undefined
    if (!current) throw new Error('Group not found.')

    const minPoints = updates.minPoints !== undefined ? updates.minPoints : current.min_points
    const maxPoints = updates.maxPoints !== undefined ? updates.maxPoints : current.max_points
    const bonusRate = updates.bonusRate !== undefined ? updates.bonusRate : current.bonus_rate

    validateThresholds(minPoints, maxPoints, bonusRate)

    db.prepare(
        `UPDATE groups SET name = ?, display_order = ?, min_points = ?, max_points = ?, bonus_rate = ? WHERE id = ?`
    ).run(
        updates.name ?? current.name,
        updates.displayOrder ?? current.display_order,
        minPoints,
        maxPoints,
        bonusRate,
        id
    )
}

export function deleteGroup(id: string): void {
    // Cascades to subgroups -> categories -> document_category_links via
    // ON DELETE CASCADE (db.ts). Never touches documents themselves or
    // their files — same "unlink, don't delete" philosophy already
    // applied to document_category_links elsewhere in the schema.
    getDb().prepare('DELETE FROM groups WHERE id = ?').run(id)
}

/**
 * Auto-creates a default "Geral" group for a collection, but ONLY if it
 * has zero groups so far — mirrors the existing "default General
 * sub-group" pattern for categories (NFR-02-03), one level up. Returns
 * the new group's id, or null if the collection already has at least
 * one group.
 *
 * That null-if-non-empty behavior is deliberate: if a collection already
 * has explicit groups (e.g. applied from the UTFPR template, or created
 * by hand), silently attaching a new ungrouped subgroup to "whichever
 * group happens to be first" would be surprising and likely wrong. This
 * function only covers the genuinely unambiguous case — a brand-new or
 * simple collection that's never touched groups at all. subgroups.ts's
 * create handler should call this when no groupId is supplied, and
 * throw a clear "which group?" error if it comes back null rather than
 * guessing.
 */
export function ensureDefaultGroupIfNone(collectionId: string): string | null {
    const db = getDb()
    const { n } = db
        .prepare('SELECT COUNT(*) as n FROM groups WHERE collection_id = ?')
        .get(collectionId) as { n: number }

    if (n > 0) return null

    const id = randomUUID()
    db.prepare(`INSERT INTO groups (id, collection_id, name, display_order) VALUES (?, ?, 'Geral', 0)`).run(
        id,
        collectionId
    )
    return id
}