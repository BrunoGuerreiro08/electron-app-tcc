import { ipcMain } from 'electron'
import { getDb } from '../db'
import { randomUUID } from 'node:crypto'
import { validateRule } from '../../src/services/scoringEngine/validateRule'
import type { Rule } from '../../src/services/scoringEngine/types'

export function registerCategoryHandlers() {
    ipcMain.handle('categories:listBySubgroup', (_event, subgroupId: string) => {
        const rows = getDb()
            .prepare('SELECT * FROM categories WHERE subgroup_id = ? ORDER BY display_order')
            .all(subgroupId) as any[]
        return rows.map((r) => ({ ...r, rule: JSON.parse(r.rule) }))
    })

    ipcMain.handle(
        'categories:create',
        (_event, subgroupId: string, name: string, rule: Rule, displayOrder = 0) => {
            const { valid, errors } = validateRule(rule)
            if (!valid) {
                throw new Error(`Invalid rule: ${errors.join(' ')}`)
            }

            const id = randomUUID()
            getDb().prepare(
                'INSERT INTO categories (id, subgroup_id, name, rule, display_order) VALUES (?, ?, ?, ?, ?)'
            ).run(id, subgroupId, name, JSON.stringify(rule), displayOrder)
            return id
        }
    )

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

            getDb().prepare('UPDATE categories SET name = ?, rule = ? WHERE id = ?').run(
                name,
                ruleJson,
                id
            )
        }
    )

    ipcMain.handle('categories:delete', (_event, id: string) => {
        // Cascades document_category_links only — documents are untouched.
        getDb().prepare('DELETE FROM categories WHERE id = ?').run(id)
    })
}