import { ipcMain } from 'electron'
import { getDb } from '../db'
import { randomUUID } from 'node:crypto'

export function registerSubgroupHandlers() {
    ipcMain.handle('subgroups:listByCollection', (_event, collectionId: string) => {
        return getDb()
            .prepare('SELECT * FROM subgroups WHERE collection_id = ? ORDER BY display_order')
            .all(collectionId)
    })

    ipcMain.handle(
        'subgroups:create',
        (_event, collectionId: string, name: string, displayOrder = 0) => {
            const id = randomUUID()
            getDb().prepare(
                'INSERT INTO subgroups (id, collection_id, name, display_order) VALUES (?, ?, ?, ?)'
            ).run(id, collectionId, name, displayOrder)
            return id
        }
    )

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

            getDb().prepare(
                'UPDATE subgroups SET name = ?, min_points = ?, max_points = ? WHERE id = ?'
            ).run(name, minPoints, maxPoints, id)
        }
    )

    ipcMain.handle('subgroups:delete', (_event, id: string) => {
        getDb().prepare('DELETE FROM subgroups WHERE id = ?').run(id)
    })
}