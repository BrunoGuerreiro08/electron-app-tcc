import { Hono } from 'hono'
import type pg from 'pg'
import { pool } from '../db.js'
import { requireAuth, type AuthedVariables } from '../middleware.js'
import {
    SYNC_ENTITIES,
    SYNC_ENTITY_TYPES,
    SYNC_PULL_MAX_LIMIT,
    SYNC_PUSH_MAX_OPS,
    entityKeyValues,
    type SyncEntityType,
    type SyncPulledOp,
    type SyncPullResponse,
    type SyncPushOp,
    type SyncPushResponse,
    type SyncSnapshotResponse,
} from '../../../shared/syncProtocol.js'

export const syncRoutes = new Hono<{ Variables: AuthedVariables }>()

syncRoutes.use('*', requireAuth)

const OPS = new Set(['create', 'update', 'delete', 'detach'])

type ApplyOutcome = { status: 'applied' | 'ignored' } | { status: 'rejected'; reason: string }

// pg error codes that mean "this op can't apply", not "the server broke".
const REJECT_CODES: Record<string, string> = {
    '23503': 'parent_missing', // FK: parent deleted on another device
    '23505': 'duplicate', // UNIQUE: e.g. same tag name created on two devices
    '23502': 'invalid', // NOT NULL
}

function isValidOp(op: SyncPushOp): boolean {
    if (!op || typeof op.opId !== 'string' || typeof op.entityId !== 'string') return false
    if (!SYNC_ENTITY_TYPES.includes(op.entityType) || !OPS.has(op.op)) return false
    if (op.op === 'detach' && op.entityType !== 'collection') return false
    if (entityKeyValues(op.entityType, op.entityId).length !== SYNC_ENTITIES[op.entityType].keyColumns.length) {
        return false
    }
    return !Number.isNaN(Date.parse(op.changedAt)) && (op.payload === undefined || typeof op.payload === 'object')
}

function keyWhere(type: SyncEntityType, firstParam: number): string {
    return SYNC_ENTITIES[type].keyColumns.map((col, i) => `${col} = $${firstParam + i}`).join(' AND ')
}

function columnValue(type: SyncEntityType, col: string, value: unknown): unknown {
    if (value === undefined) return null
    return SYNC_ENTITIES[type].jsonColumns?.includes(col) ? JSON.stringify(value) : value
}

async function selectOne<T>(client: pg.PoolClient, sql: string, params: unknown[]): Promise<T | undefined> {
    return (await client.query(sql, params)).rows[0] as T | undefined
}

/** Which collection an op touches (null for the always-synced document pool). */
async function collectionOf(client: pg.PoolClient, userId: string, op: SyncPushOp): Promise<string | null> {
    const payload = op.payload ?? {}
    const [id] = entityKeyValues(op.entityType, op.entityId)
    switch (op.entityType) {
        case 'collection':
            return op.entityId
        case 'group':
        case 'subgroup': {
            if (typeof payload.collection_id === 'string') return payload.collection_id
            const table = SYNC_ENTITIES[op.entityType].table
            const row = await selectOne<{ collection_id: string }>(
                client,
                `SELECT collection_id FROM ${table} WHERE user_id = $1 AND id = $2`,
                [userId, id]
            )
            return row?.collection_id ?? null
        }
        case 'category': {
            const row = await selectOne<{ collection_id: string }>(
                client,
                typeof payload.subgroup_id === 'string'
                    ? `SELECT collection_id FROM subgroups WHERE user_id = $1 AND id = $2`
                    : `SELECT s.collection_id FROM categories c
                       JOIN subgroups s ON s.user_id = c.user_id AND s.id = c.subgroup_id
                       WHERE c.user_id = $1 AND c.id = $2`,
                [userId, typeof payload.subgroup_id === 'string' ? payload.subgroup_id : id]
            )
            return row?.collection_id ?? null
        }
        case 'document_category_link': {
            const [, categoryId] = entityKeyValues(op.entityType, op.entityId)
            const row = await selectOne<{ collection_id: string }>(
                client,
                `SELECT s.collection_id FROM categories c
                 JOIN subgroups s ON s.user_id = c.user_id AND s.id = c.subgroup_id
                 WHERE c.user_id = $1 AND c.id = $2`,
                [userId, categoryId]
            )
            return row?.collection_id ?? null
        }
        default:
            return null
    }
}

/**
 * Applies one op to the mirror tables. The rules that make the result not
 * depend on which device pushes first:
 * - create/update only win over a row whose updated_at is not newer;
 * - update never resurrects a deleted row (it matches 0 rows instead);
 * - delete always wins, and the FKs cascade it like on the device.
 */
async function applyOp(client: pg.PoolClient, userId: string, op: SyncPushOp, changedAt: string): Promise<ApplyOutcome> {
    const def = SYNC_ENTITIES[op.entityType]
    const keys = entityKeyValues(op.entityType, op.entityId)

    const collectionId = await collectionOf(client, userId, op)
    if (collectionId && op.op !== 'detach') {
        const detached = await selectOne<{ detached_at: Date }>(
            client,
            'SELECT detached_at FROM sync_detached WHERE user_id = $1 AND collection_id = $2',
            [userId, collectionId]
        )
        if (detached) {
            // Made before sync was turned off, by a device that hadn't heard yet.
            if (Date.parse(changedAt) <= detached.detached_at.getTime()) {
                return { status: 'rejected', reason: 'collection_detached' }
            }
            // Sync turned back on: the collection is uploaded again from scratch.
            if (op.entityType === 'collection' && op.op === 'create') {
                await client.query('DELETE FROM sync_detached WHERE user_id = $1 AND collection_id = $2', [
                    userId,
                    collectionId,
                ])
            }
        }
    }

    switch (op.op) {
        case 'create': {
            const cols = [...def.keyColumns, ...def.columns]
            const values = [
                ...keys,
                ...def.columns.map((col) => columnValue(op.entityType, col, op.payload?.[col])),
            ]
            const placeholders = cols.map((_, i) => `$${i + 2}`).join(', ')
            const updates = [...def.columns.map((col) => `${col} = EXCLUDED.${col}`), 'updated_at = EXCLUDED.updated_at']
            const result = await client.query(
                `INSERT INTO ${def.table} (user_id, ${cols.join(', ')}, updated_at)
                 VALUES ($1, ${placeholders}, $${cols.length + 2})
                 ON CONFLICT (user_id, ${def.keyColumns.join(', ')}) DO UPDATE SET ${updates.join(', ')}
                 WHERE ${def.table}.updated_at <= EXCLUDED.updated_at`,
                [userId, ...values, changedAt]
            )
            return { status: result.rowCount ? 'applied' : 'ignored' }
        }

        case 'update': {
            // Only columns the payload carries: an older app version that
            // doesn't know a column leaves it alone instead of nulling it.
            const cols = def.columns.filter((col) => op.payload && col in op.payload)
            const sets = [...cols.map((col, i) => `${col} = $${i + 1}`), `updated_at = $${cols.length + 1}`]
            const params = [
                ...cols.map((col) => columnValue(op.entityType, col, op.payload[col])),
                changedAt,
                userId,
                ...keys,
            ]
            const result = await client.query(
                `UPDATE ${def.table} SET ${sets.join(', ')}
                 WHERE user_id = $${cols.length + 2} AND ${keyWhere(op.entityType, cols.length + 3)}
                   AND updated_at <= $${cols.length + 1}`,
                params
            )
            return { status: result.rowCount ? 'applied' : 'ignored' }
        }

        case 'delete': {
            const result = await client.query(
                `DELETE FROM ${def.table} WHERE user_id = $1 AND ${keyWhere(op.entityType, 2)}`,
                [userId, ...keys]
            )
            return { status: result.rowCount ? 'applied' : 'ignored' }
        }

        case 'detach': {
            await client.query('DELETE FROM collections WHERE user_id = $1 AND id = $2', [userId, op.entityId])
            await client.query(
                `INSERT INTO sync_detached (user_id, collection_id, detached_at) VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, collection_id) DO UPDATE
                 SET detached_at = GREATEST(sync_detached.detached_at, EXCLUDED.detached_at)`,
                [userId, op.entityId, changedAt]
            )
            // Always logged, so every other device stops syncing it too.
            return { status: 'applied' }
        }
    }
    return { status: 'rejected', reason: 'invalid' }
}

syncRoutes.post('/push', async (c) => {
    const user = c.get('user')
    const body = await c.req.json<{ deviceId?: string; ops?: SyncPushOp[] }>().catch(() => null)
    const deviceId = body?.deviceId
    const ops = body?.ops

    if (typeof deviceId !== 'string' || deviceId.length === 0 || deviceId.length > 100 || !Array.isArray(ops)) {
        return c.json({ error: 'Expected { deviceId, ops[] }.' }, 400)
    }
    if (ops.length > SYNC_PUSH_MAX_OPS) {
        return c.json({ error: `At most ${SYNC_PUSH_MAX_OPS} ops per push.` }, 413)
    }

    const response: SyncPushResponse = { acked: [], rejected: [] }
    const client = await pool.connect()
    try {
        await client.query('BEGIN')
        // One push at a time per user. seq is assigned at INSERT but becomes
        // visible at COMMIT; without this, a concurrent push could commit a
        // lower seq after a device already pulled past it, and that op would
        // never reach the device.
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [user.id])

        for (const op of ops) {
            if (!isValidOp(op)) {
                response.rejected.push({ opId: String(op?.opId), reason: 'invalid' })
                continue
            }

            const seen = await client.query('SELECT 1 FROM sync_log WHERE op_id = $1 AND user_id = $2', [
                op.opId,
                user.id,
            ])
            if (seen.rowCount) {
                response.acked.push(op.opId) // a retry of something already applied
                continue
            }

            // A device clock running ahead must not win every future conflict.
            const changedAt = new Date(Math.min(Date.parse(op.changedAt), Date.now())).toISOString()

            await client.query('SAVEPOINT op')
            try {
                const outcome = await applyOp(client, user.id, op, changedAt)
                if (outcome.status === 'applied') {
                    await client.query(
                        `INSERT INTO sync_log (user_id, device_id, op_id, entity_type, entity_id, op, payload, changed_at)
                         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                        [user.id, deviceId, op.opId, op.entityType, op.entityId, op.op, op.payload ?? {}, changedAt]
                    )
                }
                await client.query('RELEASE SAVEPOINT op')

                if (outcome.status === 'rejected') response.rejected.push({ opId: op.opId, reason: outcome.reason })
                else response.acked.push(op.opId)
            } catch (err) {
                await client.query('ROLLBACK TO SAVEPOINT op')
                const code = (err as { code?: string }).code ?? ''
                const reason = REJECT_CODES[code] ?? (code.startsWith('22') ? 'invalid' : null)
                if (!reason) throw err
                response.rejected.push({ opId: op.opId, reason })
            }
        }

        await client.query('COMMIT')
    } catch (err) {
        await client.query('ROLLBACK')
        console.error('[sync] push failed:', err)
        return c.json({ error: 'Could not apply changes.' }, 500)
    } finally {
        client.release()
    }

    return c.json(response)
})

syncRoutes.get('/pull', async (c) => {
    const user = c.get('user')
    const since = Number(c.req.query('since') ?? 0)
    const limit = Math.min(Number(c.req.query('limit') ?? 500), SYNC_PULL_MAX_LIMIT)
    const deviceId = c.req.query('deviceId') ?? ''

    if (!Number.isInteger(since) || since < 0 || !Number.isInteger(limit) || limit < 1) {
        return c.json({ error: 'Invalid since/limit.' }, 400)
    }

    const result = await pool.query(
        `SELECT seq, device_id, op_id, entity_type, entity_id, op, payload, changed_at
         FROM sync_log WHERE user_id = $1 AND seq > $2 ORDER BY seq LIMIT $3`,
        [user.id, since, limit + 1]
    )
    const hasMore = result.rows.length > limit
    const rows = result.rows.slice(0, limit)

    // The requesting device's own ops are skipped, but still advance the
    // cursor so the next pull doesn't scan them again.
    const ops: SyncPulledOp[] = rows
        .filter((r) => r.device_id !== deviceId)
        .map((r) => ({
            seq: Number(r.seq),
            deviceId: r.device_id,
            opId: r.op_id,
            entityType: r.entity_type,
            entityId: r.entity_id,
            op: r.op,
            payload: r.payload,
            changedAt: (r.changed_at as Date).toISOString(),
        }))

    const response: SyncPullResponse = {
        ops,
        nextSeq: rows.length > 0 ? Number(rows[rows.length - 1].seq) : since,
        hasMore,
    }
    return c.json(response)
})

/** Everything the user has, for a device syncing for the first time. */
syncRoutes.get('/snapshot', async (c) => {
    const user = c.get('user')
    const client = await pool.connect()
    try {
        // One consistent view: the rows and the seq to pull from must match.
        await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')

        const { rows: seqRows } = await client.query(
            'SELECT COALESCE(MAX(seq), 0) AS seq FROM sync_log WHERE user_id = $1',
            [user.id]
        )

        const rows = {} as SyncSnapshotResponse['rows']
        for (const type of SYNC_ENTITY_TYPES) {
            const def = SYNC_ENTITIES[type]
            const cols = [...def.keyColumns, ...def.columns, 'updated_at']
            const result = await client.query(`SELECT ${cols.join(', ')} FROM ${def.table} WHERE user_id = $1`, [
                user.id,
            ])
            rows[type] = result.rows
        }

        const detached = await client.query(
            'SELECT collection_id, detached_at FROM sync_detached WHERE user_id = $1',
            [user.id]
        )
        await client.query('COMMIT')

        const response: SyncSnapshotResponse = {
            seq: Number(seqRows[0].seq),
            rows,
            detached: detached.rows.map((r) => ({
                collectionId: r.collection_id,
                detachedAt: (r.detached_at as Date).toISOString(),
            })),
        }
        return c.json(response)
    } catch (err) {
        await client.query('ROLLBACK')
        console.error('[sync] snapshot failed:', err)
        return c.json({ error: 'Could not read snapshot.' }, 500)
    } finally {
        client.release()
    }
})
