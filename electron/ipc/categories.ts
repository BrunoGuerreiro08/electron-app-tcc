import { ipcMain } from 'electron'
import { getDb } from '../db'
import { randomUUID } from 'node:crypto'
import { validateRule } from '../../src/services/scoringEngine/validateRule'
import type { Rule } from '../../src/services/scoringEngine/types'
import { recordDelete, recordUpsert } from '../sync/recorder'

export function registerCategoryHandlers() {
    ipcMain.handle('categories:listBySubgroup', (_event, subgroupId: string) => {
        const rows = getDb()
            .prepare('SELECT * FROM categories WHERE subgroup_id = ? ORDER BY display_order')
            .all(subgroupId) as any[]
        return rows.map((r) => ({ ...r, rule: JSON.parse(r.rule) }))
    })

    ipcMain.handle(
        'categories:create',
        (_event, subgroupId: string, name: string, rule: Rule, displayOrder?: number) => {
            const { valid, errors } = validateRule(rule)
            if (!valid) {
                throw new Error(`Invalid rule: ${errors.join(' ')}`)
            }

            const db = getDb()
            // No explicit order → append after the sub-group's current last category.
            const order =
                displayOrder ??
                (db
                    .prepare('SELECT COALESCE(MAX(display_order), -1) + 1 AS next FROM categories WHERE subgroup_id = ?')
                    .get(subgroupId) as { next: number }).next
            const id = randomUUID()
            db.transaction(() => {
                db.prepare(
                    'INSERT INTO categories (id, subgroup_id, name, rule, display_order) VALUES (?, ?, ?, ?, ?)'
                ).run(id, subgroupId, name, JSON.stringify(rule), order)
                recordUpsert('category', id, 'create')
            })()
            return id
        }
    )

    ipcMain.handle('categories:reorder', (_event, orderedIds: string[]) => {
        const db = getDb()
        const update = db.prepare('UPDATE categories SET display_order = ? WHERE id = ?')
        db.transaction(() => {
            orderedIds.forEach((id, index) => {
                update.run(index, id)
                recordUpsert('category', id, 'update')
            })
        })()
    })

    ipcMain.handle(
        'categories:update',
        (_event, id: string, updates: { name?: string; rule?: Rule }) => {
            const current = getDb().prepare('SELECT * FROM categories WHERE id = ?').get(id) as any
            if (!current) throw new Error('Category not found')

            const name = updates.name ?? current.name
            let ruleJson = current.rule

            if (updates.rule) {
                const { valid, errors } = validateRule(updates.rule)
                if (!valid) throw new Error(`Invalid rule: ${errors.join(' ')}`)
                ruleJson = JSON.stringify(updates.rule)
            }

            const db = getDb()
            db.transaction(() => {
                db.prepare('UPDATE categories SET name = ?, rule = ? WHERE id = ?').run(name, ruleJson, id)
                recordUpsert('category', id, 'update')
            })()
        }
    )

    ipcMain.handle('categories:delete', (_event, id: string) => {
        // Cascades document_category_links only — documents are untouched.
        const db = getDb()
        db.transaction(() => {
            recordDelete('category', id)
            db.prepare('DELETE FROM categories WHERE id = ?').run(id)
        })()
    })
}