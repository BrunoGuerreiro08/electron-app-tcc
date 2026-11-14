/**
 * Wire format and entity definitions for server sync, shared by the app
 * (electron/sync/) and the server (server/src/routes/sync.ts).
 *
 * The server keeps a mirror of the local tables, plus user_id. Every change
 * travels as an op carrying a full snapshot of the row's synced columns;
 * `changed_at` (ISO) is what decides which of two edits to a row is newer.
 */

export type SyncEntityType =
    | 'collection'
    | 'group'
    | 'subgroup'
    | 'category'
    | 'document'
    | 'tag'
    | 'document_tag'
    | 'document_category_link'

export type SyncOp = 'create' | 'update' | 'delete' | 'detach'

export interface SyncEntityDef {
    table: string
    /** Identity columns. Join rows use their two ids, so entity_id is "a:b". */
    keyColumns: string[]
    /** Columns that travel. Anything else on the local row stays on the device. */
    columns: string[]
    /** Columns holding JSON (TEXT locally, JSONB on the server). */
    jsonColumns?: string[]
}

export const SYNC_ENTITIES: Record<SyncEntityType, SyncEntityDef> = {
    collection: { table: 'collections', keyColumns: ['id'], columns: ['name', 'color', 'created_at'] },
    group: {
        table: 'groups',
        keyColumns: ['id'],
        columns: ['collection_id', 'name', 'display_order', 'min_points', 'max_points', 'bonus_rate'],
    },
    subgroup: {
        table: 'subgroups',
        keyColumns: ['id'],
        columns: ['collection_id', 'group_id', 'name', 'display_order', 'min_points', 'max_points'],
    },
    category: {
        table: 'categories',
        keyColumns: ['id'],
        columns: ['subgroup_id', 'name', 'rule', 'display_order'],
        jsonColumns: ['rule'],
    },
    document: {
        table: 'documents',
        keyColumns: ['id'],
        // file_path/file_status are per device; the hash is what tells other
        // devices the document has a file.
        columns: ['title', 'issuer', 'issued_at', 'created_at', 'quantity', 'hours', 'notes', 'file_hash'],
    },
    tag: { table: 'tags', keyColumns: ['id'], columns: ['name', 'color'] },
    document_tag: { table: 'document_tags', keyColumns: ['document_id', 'tag_id'], columns: [] },
    document_category_link: {
        table: 'document_category_links',
        keyColumns: ['document_id', 'category_id'],
        columns: ['linked_at'],
    },
}

export const SYNC_ENTITY_TYPES = Object.keys(SYNC_ENTITIES) as SyncEntityType[]

/** Parents before children: the order creates must be applied in (deletes go in reverse). */
export const SYNC_APPLY_ORDER: SyncEntityType[] = [
    'collection',
    'group',
    'subgroup',
    'category',
    'document',
    'tag',
    'document_tag',
    'document_category_link',
]

/** Splits an entity_id back into its key column values. */
export function entityKeyValues(type: SyncEntityType, entityId: string): string[] {
    return SYNC_ENTITIES[type].keyColumns.length > 1 ? entityId.split(':') : [entityId]
}

export interface SyncPushOp {
    opId: string
    entityType: SyncEntityType
    entityId: string
    op: SyncOp
    /** Synced columns (keys included) for create/update; empty for delete/detach. */
    payload: Record<string, unknown>
    changedAt: string
}

export interface SyncPushRequest {
    deviceId: string
    ops: SyncPushOp[]
}

export interface SyncPushResponse {
    /** Applied, already applied (retry), or ignored as stale — done either way. */
    acked: string[]
    /** Could not apply: parent gone, or the collection stopped syncing. */
    rejected: { opId: string; reason: string }[]
}

export interface SyncPulledOp extends SyncPushOp {
    seq: number
    deviceId: string
}

export interface SyncPullResponse {
    ops: SyncPulledOp[]
    nextSeq: number
    hasMore: boolean
}

export interface SyncSnapshotResponse {
    /** Pull from here after applying the snapshot. */
    seq: number
    rows: Record<SyncEntityType, Record<string, unknown>[]>
    detached: { collectionId: string; detachedAt: string }[]
}

/** The app's sync engine state, as the renderer sees it (not part of the wire format). */
export type SyncState = 'disabled' | 'idle' | 'syncing' | 'offline' | 'unauthorized' | 'error'

export interface SyncStatus {
    state: SyncState
    /** Changes waiting in the outbox. */
    pending: number
    lastSyncedAt: number | null
    /** Names of collections another device stopped syncing, until the renderer clears them. */
    detachedRemotely: string[]
}

export const SYNC_PUSH_MAX_OPS = 500
export const SYNC_PULL_MAX_LIMIT = 1000
