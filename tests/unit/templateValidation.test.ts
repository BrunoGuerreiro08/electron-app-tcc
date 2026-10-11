import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { validateTemplate } from '../../shared/templateValidation'

function template(rule: unknown) {
    return {
        schemaVersion: 1,
        name: 'Test',
        groups: [
            {
                name: 'G',
                display_order: 0,
                subgroups: [
                    { name: 'S', display_order: 0, categories: [{ name: 'C', display_order: 0, rule }] },
                ],
            },
        ],
    }
}

describe('validateTemplate (shared by app and server — NFR-12-01, NFR-A01-02)', () => {
    it('accepts a minimal template with a valid rule', () => {
        const result = validateTemplate(template({ type: 'flat', pointsPerUnit: 10 }))
        expect(result.ok).toBe(true)
        expect(result.template?.name).toBe('Test')
    })

    it('rejects an unknown rule type and says where', () => {
        const result = validateTemplate(template({ type: 'nope' }))
        expect(result.ok).toBe(false)
        expect(result.errors.join('\n')).toContain('groups[0].subgroups[0].categories[0].rule')
    })

    it('rejects a template with no groups', () => {
        expect(validateTemplate({ schemaVersion: 1, name: 'Empty', groups: [] }).ok).toBe(false)
    })

    it('rejects non-objects', () => {
        expect(validateTemplate(null).ok).toBe(false)
        expect(validateTemplate('{}').ok).toBe(false)
    })

    // The files the server publishes must stay valid as the schema evolves.
    const officialDir = path.resolve(__dirname, '../../server/templates')
    for (const fileName of fs.readdirSync(officialDir).filter((f) => f.endsWith('.json'))) {
        it(`official template ${fileName} is valid`, () => {
            const result = validateTemplate(JSON.parse(fs.readFileSync(path.join(officialDir, fileName), 'utf-8')))
            expect(result.errors).toEqual([])
            expect(result.ok).toBe(true)
        })
    }
})
