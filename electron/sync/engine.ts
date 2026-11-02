import { randomUUID } from 'node:crypto'
import { BrowserWindow } from 'electron'
import { getActiveUserId, getDb } from '../db'
import { loadSession } from '../store'
import { getOrBackfillHash } from '../fileHandler'
import {
    SYNC_APPLY_ORDER,
    SYNC_ENTITIES,
    SYNC_PUSH_MAX_OPS,
    entityKeyValues,
    type SyncEntityType,
    type SyncPulledOp,
    type SyncPullResponse,
    type SyncPushResponse,
    type SyncSnapshotResponse,
    type SyncStatus,
} from '../../shared/syncProtocol'
import { compactOutbox, type OutboxRow } from './compact'
import { dropPendingForCollection, enqueueEverything, onOutboxChange, recordDelete, recordUpsert } from './recorder'

/**
 * Pushes the outbox and pulls other devices' changes, whenever the server
 * can be reached. Every step is safe to interrupt: outbox rows leave only
 * once acked, and the pull cursor moves in the same transaction as the
 * changes it covers.
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const REQUEST_TIMEOUT_MS = 15_000
const PUSH_DEBOUNCE_MS = 2_000
const PERIODIC_MS = 60_000

let status: SyncStatus = { state: 'disabled', pending: 0, lastSyncedAt: null, detachedRemotely: [] }

class HttpError extends Error {
    constructor(readonly status: number) {
        super(`HTTP ${status}`)
    }
}

// The run was started for one user and another logged in meanwhile: stop
// before touching what is now someone else's db.
class UserChangedError extends Error {}

function broadcast(channel: string, payload?: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload)
}

function pendingCount(): number {
    if (!getActiveUserId()) return 0
    return (getDb().prepare('SELECT COUNT(*) AS n FROM sync_outbox').get() as { n: number }).n
}

function setStatus(patch: Partial<SyncStatus>): void {
    status = { ...status, ...patch, pending: pendingCount() }
    broadcast('sync:status', status)
}

export function getSyncStatus(): SyncStatus {
    return { ...status, pending: pendingCount() }
}

export function clearRemoteDetachNotices(): void {
    setStatus({ detachedRemotely: [] })
}

function readMeta(key: string): string | null {
    return (getDb().prepare('SELECT value FROM sync_meta WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? null
}

function writeMeta(key: string, value: string): void {
    getDb().prepare('INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

async function request<T>(token: string, path: string, init?: { method: string; body: unknown }): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        method: init?.method ?? 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: init ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) throw new HttpError(res.status)
    return (await res.json()) as T
}

// --- Push -----------------------------------------------------------

async function pushAll(token: string, deviceId: string, assertUser: () => void): Promise<void> {
    const db = getDb()
    const rows = db.prepare('SELECT * FROM sync_outbox ORDER BY seq').all() as OutboxRow[]
    if (rows.length === 0) return

    const { ops, dropped } = compactOutbox(rows)
    const removeSeq = db.prepare('DELETE FROM sync_outbox WHERE seq = ?')
    db.transaction(() => dropped.forEach((seq) => removeSeq.run(seq)))()

    for (let i = 0; i < ops.length; i += SYNC_PUSH_MAX_OPS) {
        const batch = ops.slice(i, i + SYNC_PUSH_MAX_OPS)
        const response = await request<SyncPushResponse>(token, '/sync/push', {
            method: 'POST',
            body: { deviceId, ops: batch.map((c) => c.op) },
        })
        assertUser()

        const done = new Set([...response.acked, ...response.rejected.map((r) => r.opId)])
        for (const r of response.rejected) {
            // Not retried: the server will never accept it as-is. A duplicate
            // tag name gets resolved when the other device's tag is pulled.
            console.warn(`[sync] server rejected ${r.opId}: ${r.reason}`)
        }
        db.transaction(() => {
            for (const c of batch) if (done.has(c.op.opId)) c.seqs.forEach((seq) => removeSeq.run(seq))
        })()
    }
}

// --- Apply (pulled changes) -------------------------------------------

const NO_UPDATED_AT: SyncEntityType[] = ['document_tag', 'document_category_link']

function isNewer(a: unknown, b: string): boolean {
    if (typeof a !== 'string') return false
    const ms = Date.parse(a.includes('T') ? a : `${a.replace(' ', 'T')}Z`)
    return !Number.isNaN(ms) && ms > Date.parse(b)
}

function sqlValue(type: SyncEntityType, col: string, value: unknown): unknown {
    if (value === undefined || value === null) return null
    if (SYNC_ENTITIES[type].jsonColumns?.includes(col)) return JSON.stringify(value)
    return typeof value === 'boolean' ? Number(value) : value
}

/**
 * Two devices made a tag with the same name: keep the incoming one (the
 * server already has it). Deletes this device's tag, freeing the name, and
 * returns the documents that carried it, to be moved onto the incoming tag.
 */
function takeOverTagName(incomingId: string, name: unknown): string[] {
    const db = getDb()
    const local = db.prepare('SELECT id FROM tags WHERE name = ? AND id <> ?').get(name, incomingId) as
        | { id: string }
        | undefined
    if (!local) return []

    const docs = db.prepare('SELECT document_id FROM document_tags WHERE tag_id = ?').all(local.id) as {
        document_id: string
    }[]
    recordDelete('tag', local.id)
    db.prepare('DELETE FROM tags WHERE id = ?').run(local.id)
    return docs.map((d) => d.document_id)
}

/** The documents' tag links, moved onto the surviving tag and recorded for the server. */
function relinkTag(tagId: string, documentIds: string[]): void {
    const link = getDb().prepare('INSERT OR IGNORE INTO document_tags (document_id, tag_id) VALUES (?, ?)')
    for (const documentId of documentIds) {
        link.run(documentId, tagId)
        recordUpsert('document_tag', { document_id: documentId, tag_id: tagId }, 'create')
    }
}

function applyUpsert(
    type: SyncEntityType,
    keys: string[],
    payload: Record<string, unknown>,
    changedAt: string,
    mode: 'create' | 'update'
): boolean {
    const db = getDb()
    const def = SYNC_ENTITIES[type]
    const where = def.keyColumns.map((col) => `${col} = ?`).join(' AND ')
    const hasUpdatedAt = !NO_UPDATED_AT.includes(type)
    const local = db.prepare(`SELECT * FROM ${def.table} WHERE ${where}`).get(...keys) as
        | Record<string, unknown>
        | undefined

    // This device's own edit is newer (and already pushed, or about to be).
    if (local && hasUpdatedAt && isNewer(local.updated_at, changedAt)) return false

    if (!local) {
        if (mode === 'update') return false // deleted here; an update never resurrects
        const relinkDocs = type === 'tag' ? takeOverTagName(keys[0], payload.name) : []

        const cols = [...def.keyColumns, ...def.columns]
        const values = [...keys, ...def.columns.map((col) => sqlValue(type, col, payload[col]))]
        if (type === 'document_category_link') {
            cols.push('id') // local surrogate key
            values.push(randomUUID())
        }
        if (hasUpdatedAt) {
            cols.push('updated_at')
            values.push(changedAt)
        }
        db.prepare(`INSERT INTO ${def.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(
            ...values
        )

        relinkTag(keys[0], relinkDocs)
        return true
    }

    const cols = def.columns.filter((col) => col in payload)
    const sets = cols.map((col) => `${col} = ?`)
    const values = cols.map((col) => sqlValue(type, col, payload[col]))
    if (hasUpdatedAt) {
        sets.push('updated_at = ?')
        values.push(changedAt)
    }
    // A collection another device just re-enabled syncs here again too.
    if (type === 'collection' && mode === 'create') sets.push('sync_enabled = 1')
    if (sets.length === 0) return false
    db.prepare(`UPDATE ${def.table} SET ${sets.join(', ')} WHERE ${where}`).run(...values, ...keys)
    return true
}

function applyOp(op: SyncPulledOp): boolean {
    const db = getDb()
    const keys = entityKeyValues(op.entityType, op.entityId)
    const def = SYNC_ENTITIES[op.entityType]

    switch (op.op) {
        case 'create':
        case 'update':
            return applyUpsert(op.entityType, keys, op.payload, op.changedAt, op.op)
        case 'delete': {
            const where = def.keyColumns.map((col) => `${col} = ?`).join(' AND ')
            return db.prepare(`DELETE FROM ${def.table} WHERE ${where}`).run(...keys).changes > 0
        }
        case 'detach': {
            const row = db.prepare('SELECT name, sync_enabled FROM collections WHERE id = ?').get(op.entityId) as
                | { name: string; sync_enabled: number }
                | undefined
            if (!row || row.sync_enabled === 0) return false
            // Kept here as a local-only copy; nothing is deleted.
            db.prepare('UPDATE collections SET sync_enabled = 0 WHERE id = ?').run(op.entityId)
            dropPendingForCollection(op.entityId)
            status.detachedRemotely = [...status.detachedRemotely, row.name]
            return true
        }
    }
}

/** Applies one op in its own savepoint: one that can't apply here (e.g. its parent is gone) is skipped, not fatal. */
function applySafely(op: SyncPulledOp): boolean {
    try {
        return getDb().transaction(() => applyOp(op))()
    } catch (err) {
        console.warn(`[sync] skipped ${op.op} ${op.entityType} ${op.entityId}:`, (err as Error).message)
        return false
    }
}

// --- Pull -----------------------------------------------------------

async function pullAll(token: string, deviceId: string, assertUser: () => void): Promise<boolean> {
    const db = getDb()
    let changed = false

    if (readMeta('snapshot_done') !== '1') {
        const snapshot = await request<SyncSnapshotResponse>(token, '/sync/snapshot')
        assertUser()
        db.transaction(() => {
            for (const type of SYNC_APPLY_ORDER) {
                for (const row of snapshot.rows[type] ?? []) {
                    const def = SYNC_ENTITIES[type]
                    const entityId = def.keyColumns.map((col) => String(row[col])).join(':')
                    const changedAt = typeof row.updated_at === 'string' ? row.updated_at : new Date(0).toISOString()
                    const op: SyncPulledOp = {
                        seq: 0,
                        deviceId: '',
                        opId: '',
                        entityType: type,
                        entityId,
                        op: 'create',
                        payload: row,
                        changedAt,
                    }
                    changed = applySafely(op) || changed
                }
            }
            for (const { collectionId } of snapshot.detached) {
                db.prepare('UPDATE collections SET sync_enabled = 0 WHERE id = ?').run(collectionId)
            }
            writeMeta('last_pulled_seq', String(snapshot.seq))
            writeMeta('snapshot_done', '1')
        })()
    }

    let hasMore = true
    while (hasMore) {
        const since = Number(readMeta('last_pulled_seq') ?? 0)
        const page = await request<SyncPullResponse>(
            token,
            `/sync/pull?since=${since}&deviceId=${encodeURIComponent(deviceId)}`
        )
        assertUser()
        db.transaction(() => {
            // Log order is causal (parents before children), so ops apply as listed.
            for (const op of page.ops) changed = applySafely(op) || changed
            writeMeta('last_pulled_seq', String(page.nextSeq))
        })()
        hasMore = page.hasMore && page.nextSeq > since
    }
    return changed
}

// --- First sync on a device -----------------------------------------------------

function bootstrapIfNeeded(): void {
    if (readMeta('bootstrapped') === '1') return
    // Hashes first, so the queued snapshots carry them.
    const docs = getDb().prepare('SELECT id FROM documents WHERE file_path IS NOT NULL AND file_hash IS NULL').all() as {
        id: string
    }[]
    for (const { id } of docs) getOrBackfillHash(id)

    getDb().transaction(() => {
        enqueueEverything()
        writeMeta('bootstrapped', '1')
    })()
}

// --- Run / scheduling -----------------------------------------------

async function runSync(): Promise<void> {
    const session = loadSession()
    const userId = getActiveUserId()
    if (!session || session.isGuest || !userId || userId !== session.user.id) {
        setStatus({ state: 'disabled' })
        return
    }
    const assertUser = () => {
        if (getActiveUserId() !== userId) throw new UserChangedError()
    }

    setStatus({ state: 'syncing' })
    try {
        bootstrapIfNeeded()
        const deviceId = readMeta('device_id') as string
        await pushAll(session.token, deviceId, assertUser)
        const changed = await pullAll(session.token, deviceId, assertUser)
        setStatus({ state: 'idle', lastSyncedAt: Date.now() })
        if (changed) broadcast('sync:applied')
    } catch (err) {
        if (err instanceof UserChangedError) return
        if (err instanceof HttpError && err.status === 401) {
            // The renderer renews the token; session:update triggers a new run.
            setStatus({ state: 'unauthorized' })
        } else if (err instanceof HttpError) {
            console.error('[sync] server error:', err.message)
            setStatus({ state: 'error' })
        } else {
            setStatus({ state: 'offline' })
        }
    }
}

let inFlight: Promise<void> | null = null
let runAgain = false
let timer: NodeJS.Timeout | null = null
let periodic: NodeJS.Timeout | null = null

/** Runs a sync now; if one is running, another follows it (changes made meanwhile). */
export function syncNow(): Promise<void> {
    if (timer) {
        clearTimeout(timer)
        timer = null
    }
    if (inFlight) {
        runAgain = true
        return inFlight
    }
    inFlight = runSync().finally(() => {
        inFlight = null
        if (runAgain) {
            runAgain = false
            void syncNow()
        }
    })
    return inFlight
}

export function scheduleSync(delayMs = PUSH_DEBOUNCE_MS): void {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
        timer = null
        void syncNow()
    }, delayMs)
}

/** Called once at startup. Runs are no-ops without an account session. */
export function startSyncEngine(): void {
    onOutboxChange(() => scheduleSync())
    periodic ??= setInterval(() => void syncNow(), PERIODIC_MS)
}

/** Logout or account switch: forget this user's status. */
export function resetSyncStatus(): void {
    if (timer) clearTimeout(timer)
    timer = null
    status = { state: 'disabled', pending: 0, lastSyncedAt: null, detachedRemotely: [] }
    broadcast('sync:status', status)
}
