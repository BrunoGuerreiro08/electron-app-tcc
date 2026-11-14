import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import {
    SYNC_APPLY_ORDER,
    SYNC_ENTITIES,
    entityKeyValues,
    type SyncEntityDef,
    type SyncEntityType,
    type SyncOp,
} from '../../shared/syncProtocol'

/**
 * Records local changes into sync_outbox for the sync engine to push.
 *
 * Every call must run inside the same transaction as the write it
 * describes — that's what makes the outbox crash-safe. Upserts are recorded
 * AFTER the write (they snapshot the row as it now is); deletes BEFORE it
 * (the row is still needed to tell which collection it belongs to).
 *
 * Payloads are full snapshots of the synced columns (SYNC_ENTITIES), not
 * diffs: the server keeps the newest snapshot per row (by changed_at), so
 * the latest one is all that matters.
 */

export type { SyncEntityType, SyncOp }

/** Join rows are keyed by their two ids, so the same link made on two devices is the same row. */
export type LinkKey = { document_id: string; tag_id: string } | { document_id: string; category_id: string }
type EntityKey = string | LinkKey

// Join tables have no updated_at locally: they're only ever created or deleted.
const NO_UPDATED_AT: SyncEntityType[] = ['document_tag', 'document_category_link']

// Guests never sync. Set by the session handlers whenever a user db opens.
let recordingEnabled = false

export function setSyncRecording(enabled: boolean): void {
    recordingEnabled = enabled
}

// The engine subscribes to push soon after a change (kept as a callback so
// the recorder doesn't import the engine).
let outboxListener: (() => void) | null = null

export function onOutboxChange(listener: (() => void) | null): void {
    outboxListener = listener
}

function keyValues(config: SyncEntityDef, key: EntityKey): string[] {
    if (typeof key === 'string') return [key]
    return config.keyColumns.map((col) => (key as Record<string, string>)[col])
}

function whereClause(config: SyncEntityDef): string {
    return config.keyColumns.map((col) => `${col} = ?`).join(' AND ')
}

function entityId(key: EntityKey, values: string[]): string {
    return typeof key === 'string' ? key : values.join(':')
}

/**
 * Which collection a row belongs to, or null for the global pool
 * (documents, tags and their tag links), which always syncs.
 */
function collectionIdOf(type: SyncEntityType, row: Record<string, unknown>): string | null {
    const db = getDb()
    switch (type) {
        case 'collection':
            return row.id as string
        case 'group':
        case 'subgroup':
            return row.collection_id as string
        case 'category':
            return (
                db.prepare('SELECT collection_id FROM subgroups WHERE id = ?').get(row.subgroup_id) as
                    | { collection_id: string }
                    | undefined
            )?.collection_id ?? null
        case 'document_category_link':
            return (
                db
                    .prepare(
                        `SELECT s.collection_id FROM categories c
                         JOIN subgroups s ON s.id = c.subgroup_id
                         WHERE c.id = ?`
                    )
                    .get(row.category_id) as { collection_id: string } | undefined
            )?.collection_id ?? null
        default:
            return null
    }
}

function shouldRecord(type: SyncEntityType, row: Record<string, unknown>): boolean {
    if (!recordingEnabled) return false
    const collectionId = collectionIdOf(type, row)
    if (!collectionId) return true
    const collection = getDb().prepare('SELECT sync_enabled FROM collections WHERE id = ?').get(collectionId) as
        | { sync_enabled: number }
        | undefined
    return collection?.sync_enabled !== 0
}

function toPayload(config: SyncEntityDef, row: Record<string, unknown>): Record<string, unknown> {
    const payload: Record<string, unknown> = {}
    for (const col of [...config.keyColumns, ...config.columns]) {
        const value = row[col] ?? null
        payload[col] = config.jsonColumns?.includes(col) && typeof value === 'string' ? JSON.parse(value) : value
    }
    return payload
}

function insertOutbox(
    type: SyncEntityType,
    id: string,
    op: SyncOp,
    payload: Record<string, unknown>,
    changedAt: string
): void {
    getDb()
        .prepare(
            `INSERT INTO sync_outbox (op_id, entity_type, entity_id, op, payload, changed_at)
             VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(randomUUID(), type, id, op, JSON.stringify(payload), changedAt)
    outboxListener?.()
}

/** Call right after inserting or updating the row. Stamps updated_at, then snapshots it. */
export function recordUpsert(type: SyncEntityType, key: EntityKey, op: 'create' | 'update'): void {
    if (!recordingEnabled) return
    const config = SYNC_ENTITIES[type]
    const values = keyValues(config, key)
    const db = getDb()
    const now = new Date().toISOString()

    if (!NO_UPDATED_AT.includes(type)) {
        db.prepare(`UPDATE ${config.table} SET updated_at = ? WHERE ${whereClause(config)}`).run(now, ...values)
    }
    const row = db.prepare(`SELECT * FROM ${config.table} WHERE ${whereClause(config)}`).get(...values) as
        | Record<string, unknown>
        | undefined
    if (!row || !shouldRecord(type, row)) return

    insertOutbox(type, entityId(key, values), op, toPayload(config, row), now)
}

/**
 * Call right BEFORE deleting the row. Only the root of a cascade is
 * recorded — every side cascades the children itself.
 */
export function recordDelete(type: SyncEntityType, key: EntityKey): void {
    if (!recordingEnabled) return
    const config = SYNC_ENTITIES[type]
    const values = keyValues(config, key)
    const row = getDb().prepare(`SELECT * FROM ${config.table} WHERE ${whereClause(config)}`).get(...values) as
        | Record<string, unknown>
        | undefined
    if (!row || !shouldRecord(type, row)) return

    insertOutbox(type, entityId(key, values), 'delete', {}, new Date().toISOString())
}

/**
 * Turns sync off for a collection: its pending changes are dropped and the
 * server is told to forget its copy. Local data is kept as local-only.
 */
export function detachCollection(collectionId: string): void {
    const db = getDb()
    db.transaction(() => {
        const wasSynced = db.prepare('SELECT sync_enabled FROM collections WHERE id = ?').get(collectionId) as
            | { sync_enabled: number }
            | undefined
        if (!wasSynced || wasSynced.sync_enabled === 0) return

        db.prepare('UPDATE collections SET sync_enabled = 0 WHERE id = ?').run(collectionId)
        dropPendingForCollection(collectionId)
        if (recordingEnabled) insertOutbox('collection', collectionId, 'detach', {}, new Date().toISOString())
    })()
}

/**
 * Turns sync back on: the whole subtree is queued as fresh creates, newer
 * than the detach, so the server takes it back (and other devices too).
 */
export function reattachCollection(collectionId: string): void {
    const db = getDb()
    db.transaction(() => {
        db.prepare('UPDATE collections SET sync_enabled = 1 WHERE id = ?').run(collectionId)
        if (!recordingEnabled) return
        const now = new Date().toISOString()
        for (const type of SYNC_APPLY_ORDER) {
            const where = SUBTREE_WHERE[type]
            if (!where) continue
            const rows = db.prepare(`SELECT * FROM ${SYNC_ENTITIES[type].table} WHERE ${where}`).all(collectionId)
            enqueueRows(type, rows as Record<string, unknown>[], () => now)
        }
    })()
}

/**
 * First sync on this device: queue everything that exists locally, since
 * it was all created before changes were being recorded. Stamped with each
 * row's own updated_at (or the epoch when it has none), so it never beats a
 * newer version already on the server.
 */
export function enqueueEverything(): void {
    const db = getDb()
    db.transaction(() => {
        for (const type of SYNC_APPLY_ORDER) {
            const where = SYNCED_WHERE[type]
            const rows = db.prepare(`SELECT * FROM ${SYNC_ENTITIES[type].table}${where ? ` WHERE ${where}` : ''}`).all()
            enqueueRows(type, rows as Record<string, unknown>[], (row) => toIsoOrEpoch(row.updated_at))
        }
    })()
}

const IN_COLLECTION_CATEGORIES = `SELECT c.id FROM categories c JOIN subgroups s ON s.id = c.subgroup_id`

/** Rows of one collection's subtree (`?` = collection id). */
const SUBTREE_WHERE: Partial<Record<SyncEntityType, string>> = {
    collection: 'id = ?',
    group: 'collection_id = ?',
    subgroup: 'collection_id = ?',
    category: 'subgroup_id IN (SELECT id FROM subgroups WHERE collection_id = ?)',
    document_category_link: `category_id IN (${IN_COLLECTION_CATEGORIES} WHERE s.collection_id = ?)`,
}

const SYNCED_COLLECTIONS = 'SELECT id FROM collections WHERE sync_enabled = 1'

/** Rows that sync at all; types not listed (the document pool) always do. */
const SYNCED_WHERE: Partial<Record<SyncEntityType, string>> = {
    collection: 'sync_enabled = 1',
    group: `collection_id IN (${SYNCED_COLLECTIONS})`,
    subgroup: `collection_id IN (${SYNCED_COLLECTIONS})`,
    category: `subgroup_id IN (SELECT id FROM subgroups WHERE collection_id IN (${SYNCED_COLLECTIONS}))`,
    document_category_link: `category_id IN (${IN_COLLECTION_CATEGORIES} WHERE s.collection_id IN (${SYNCED_COLLECTIONS}))`,
}

function enqueueRows(
    type: SyncEntityType,
    rows: Record<string, unknown>[],
    changedAt: (row: Record<string, unknown>) => string
): void {
    const config = SYNC_ENTITIES[type]
    for (const row of rows) {
        const values = config.keyColumns.map((col) => String(row[col]))
        const id = config.keyColumns.length > 1 ? values.join(':') : values[0]
        insertOutbox(type, id, 'create', toPayload(config, row), changedAt(row))
    }
}

function toIsoOrEpoch(value: unknown): string {
    // Old rows may carry SQLite's "YYYY-MM-DD HH:MM:SS" (UTC) instead of ISO.
    const ms = typeof value === 'string' ? Date.parse(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`) : NaN
    return new Date(Number.isNaN(ms) ? 0 : ms).toISOString()
}

/** Pending ops of entities that belong to `collectionId` (resolved through their snapshots). */
export function dropPendingForCollection(collectionId: string): void {
    const db = getDb()
    const pending = db
        .prepare(`SELECT seq, entity_type, entity_id, payload FROM sync_outbox`)
        .all() as { seq: number; entity_type: SyncEntityType; entity_id: string; payload: string }[]

    const remove = db.prepare('DELETE FROM sync_outbox WHERE seq = ?')
    for (const op of pending) {
        const payload = JSON.parse(op.payload) as Record<string, unknown>
        // Deletes carry no snapshot: look the row up instead. If it's already
        // gone the delete is kept — the server applies it before the detach,
        // which is harmless.
        const row = Object.keys(payload).length > 0 ? payload : lookupRow(op.entity_type, op.entity_id)
        const owner = op.entity_type === 'collection' ? op.entity_id : row && collectionIdOf(op.entity_type, row)
        if (owner === collectionId) remove.run(op.seq)
    }
}

function lookupRow(type: SyncEntityType, id: string): Record<string, unknown> | undefined {
    const config = SYNC_ENTITIES[type]
    return getDb()
        .prepare(`SELECT * FROM ${config.table} WHERE ${whereClause(config)}`)
        .get(...entityKeyValues(type, id)) as Record<string, unknown> | undefined
}
