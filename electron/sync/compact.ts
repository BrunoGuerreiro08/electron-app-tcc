import type { SyncEntityType, SyncOp, SyncPushOp } from '../../shared/syncProtocol'

export interface OutboxRow {
    seq: number
    op_id: string
    entity_type: SyncEntityType
    entity_id: string
    op: SyncOp
    payload: string
    changed_at: string
}

export interface CompactedOp {
    op: SyncPushOp
    /** Outbox rows this op stands for; all of them leave once it's acked or rejected. */
    seqs: number[]
}

export interface CompactResult {
    ops: CompactedOp[]
    /** Rows that cancel out (created and deleted before ever being pushed). */
    dropped: number[]
}

function toPushOp(row: OutboxRow): SyncPushOp {
    return {
        opId: row.op_id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        op: row.op,
        payload: JSON.parse(row.payload),
        changedAt: row.changed_at,
    }
}

/**
 * Collapses the pending ops of each entity into at most one, keeping the
 * order the server must apply them in:
 * - create … delete       → nothing (the server never needs to hear of it)
 * - … delete              → delete, at the delete's position
 * - create/update …       → one create (if any was a create) or update,
 *                           carrying the latest snapshot, at the FIRST
 *                           position — a parent is always queued before
 *                           any child created under it, so it stays first.
 * Detaches stay as they are: they act on a whole subtree, not one row.
 */
export function compactOutbox(rows: OutboxRow[]): CompactResult {
    const sorted = [...rows].sort((a, b) => a.seq - b.seq)
    const groups = new Map<string, OutboxRow[]>()
    const placed: { pos: number; compacted: CompactedOp }[] = []
    const dropped: number[] = []

    for (const row of sorted) {
        if (row.op === 'detach') {
            placed.push({ pos: row.seq, compacted: { op: toPushOp(row), seqs: [row.seq] } })
            continue
        }
        const key = `${row.entity_type}|${row.entity_id}`
        const group = groups.get(key)
        if (group) group.push(row)
        else groups.set(key, [row])
    }

    for (const group of groups.values()) {
        const first = group[0]
        const last = group[group.length - 1]
        const seqs = group.map((r) => r.seq)

        if (last.op === 'delete') {
            if (first.op === 'create') dropped.push(...seqs)
            else placed.push({ pos: last.seq, compacted: { op: toPushOp(last), seqs } })
            continue
        }

        const op: SyncOp = group.some((r) => r.op === 'create') ? 'create' : 'update'
        placed.push({ pos: first.seq, compacted: { op: { ...toPushOp(last), op }, seqs } })
    }

    placed.sort((a, b) => a.pos - b.pos)
    return { ops: placed.map((p) => p.compacted), dropped }
}
