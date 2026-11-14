import { describe, expect, it } from 'vitest'
import { compactOutbox, type OutboxRow } from '../../electron/sync/compact'
import type { SyncEntityType, SyncOp } from '../../shared/syncProtocol'

let seq = 0
function row(entityType: SyncEntityType, entityId: string, op: SyncOp, payload: object = {}): OutboxRow {
    seq++
    return {
        seq,
        op_id: `op-${seq}`,
        entity_type: entityType,
        entity_id: entityId,
        op,
        payload: JSON.stringify(payload),
        changed_at: new Date(seq * 1000).toISOString(),
    }
}

describe('compactOutbox', () => {
    it('drops an entity created and deleted before ever being pushed', () => {
        const rows = [row('category', 'c1', 'create'), row('category', 'c1', 'update'), row('category', 'c1', 'delete')]
        const { ops, dropped } = compactOutbox(rows)
        expect(ops).toEqual([])
        expect(dropped).toEqual(rows.map((r) => r.seq))
    })

    it('sends only the delete for a rename followed by a delete', () => {
        const rename = row('category', 'c1', 'update', { name: 'New' })
        const del = row('category', 'c1', 'delete')
        const { ops } = compactOutbox([rename, del])
        expect(ops).toHaveLength(1)
        expect(ops[0].op).toMatchObject({ op: 'delete', opId: del.op_id })
        expect(ops[0].seqs).toEqual([rename.seq, del.seq])
    })

    it('merges create + updates into one create with the latest snapshot', () => {
        const create = row('collection', 'k', 'create', { name: 'A' })
        const middle = row('collection', 'k', 'update', { name: 'B' })
        const last = row('collection', 'k', 'update', { name: 'C' })
        const { ops } = compactOutbox([create, middle, last])
        expect(ops).toHaveLength(1)
        expect(ops[0].op).toMatchObject({ op: 'create', payload: { name: 'C' }, changedAt: last.changed_at })
    })

    it('keeps a parent ahead of a child created under it, even if the parent was edited later', () => {
        const parent = row('subgroup', 's1', 'create')
        const child = row('category', 'c1', 'create')
        const parentEdit = row('subgroup', 's1', 'update')
        const { ops } = compactOutbox([parent, child, parentEdit])
        expect(ops.map((o) => o.op.entityId)).toEqual(['s1', 'c1'])
    })

    it('turns unlink + relink of a link into a create', () => {
        const { ops } = compactOutbox([
            row('document_category_link', 'd:c', 'delete'),
            row('document_category_link', 'd:c', 'create'),
        ])
        expect(ops).toHaveLength(1)
        expect(ops[0].op.op).toBe('create')
    })

    it('keeps the delete of a link the server already has, even after relink + unlink', () => {
        const { ops, dropped } = compactOutbox([
            row('document_category_link', 'd:c', 'delete'),
            row('document_category_link', 'd:c', 'create'),
            row('document_category_link', 'd:c', 'delete'),
        ])
        expect(dropped).toEqual([])
        expect(ops.map((o) => o.op.op)).toEqual(['delete'])
    })

    it('leaves detaches in place, after the collection ops they follow', () => {
        const create = row('collection', 'k', 'create')
        const detach = row('collection', 'k', 'detach')
        const reattach = row('collection', 'k', 'create')
        const { ops } = compactOutbox([create, detach, reattach])
        expect(ops.map((o) => o.op.op)).toEqual(['create', 'detach'])
        // The two creates merge at the first one's position, before the detach.
        expect(ops[0].seqs).toEqual([create.seq, reattach.seq])
    })
})
