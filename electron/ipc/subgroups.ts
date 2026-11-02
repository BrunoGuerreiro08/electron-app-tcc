import { ipcMain } from 'electron'
import { getDb } from '../db'
import { randomUUID } from 'node:crypto'
import { ensureDefaultSubgroupIfNone } from '../groups'
import { recordDelete, recordUpsert } from '../sync/recorder'

export function registerSubgroupHandlers() {
    ipcMain.handle('subgroups:listByCollection', (_event, collectionId: string) => {
        return getDb()
            .prepare('SELECT * FROM subgroups WHERE collection_id = ? ORDER BY display_order')
            .all(collectionId)
    })

    ipcMain.handle(
        'subgroups:create',
        (_event, collectionId: string, groupId: string, name: string, displayOrder?: number) => {
            const db = getDb()
            // No explicit order → append after the group's current last sub-group.
            const order =
                displayOrder ??
                (db
                    .prepare('SELECT COALESCE(MAX(display_order), -1) + 1 AS next FROM subgroups WHERE group_id = ?')
                    .get(groupId) as { next: number }).next
            const id = randomUUID()
            db.transaction(() => {
                db.prepare(
                    'INSERT INTO subgroups (id, collection_id, group_id, name, display_order) VALUES (?, ?, ?, ?, ?)'
                ).run(id, collectionId, groupId, name, order)
                recordUpsert('subgroup', id, 'create')
            })()
            return id
        }
    )

    ipcMain.handle('subgroups:reorder', (_event, orderedIds: string[]) => {
        const db = getDb()
        const update = db.prepare('UPDATE subgroups SET display_order = ? WHERE id = ?')
        db.transaction(() => {
            orderedIds.forEach((id, index) => {
                update.run(index, id)
                recordUpsert('subgroup', id, 'update')
            })
        })()
    })

    ipcMain.handle(
        'subgroups:update',
        (
            _event,
            id: string,
            updates: { name?: string; minPoints?: number | null; maxPoints?: number | null }
        ) => {
            const current = getDb().prepare('SELECT * FROM subgroups WHERE id = ?').get(id) as any
            if (!current) throw new Error('Subgroup not found')

            const name = updates.name ?? current.name
            const minPoints = updates.minPoints !== undefined ? updates.minPoints : current.min_points
            const maxPoints = updates.maxPoints !== undefined ? updates.maxPoints : current.max_points

            if (minPoints != null && maxPoints != null && maxPoints <= minPoints) {
                throw new Error('max_points must be greater than min_points')
            }

            const db = getDb()
            db.transaction(() => {
                db.prepare('UPDATE subgroups SET name = ?, min_points = ?, max_points = ? WHERE id = ?').run(
                    name,
                    minPoints,
                    maxPoints,
                    id
                )
                recordUpsert('subgroup', id, 'update')
            })()
        }
    )

    ipcMain.handle('subgroups:delete', (_event, id: string) => {
        const db = getDb()
        db.transaction(() => {
            const row = db.prepare('SELECT collection_id, group_id FROM subgroups WHERE id = ?').get(id) as
                | { collection_id: string; group_id: string | null }
                | undefined
            if (!row) return

            recordDelete('subgroup', id)
            db.prepare('DELETE FROM subgroups WHERE id = ?').run(id)
            // A group is never left without a subgroup: deleting the last
            // one recreates the default "Geral"/"General". (group_id is only
            // null on pre-Group legacy rows, which have no group to refill.)
            if (row.group_id) ensureDefaultSubgroupIfNone(row.collection_id, row.group_id)
        })()
    })
}