import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import i18next from 'i18next'
import { formatTemplateError, validateTemplate, type TemplateError } from '../../shared/templateValidation'
import { translateTemplateErrors } from '@/lib/translateTemplateErrors'
import enCollections from '@/i18n/locales/en/collections.json'
import ptCollections from '@/i18n/locales/pt-BR/collections.json'

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

    it('rejects an unknown rule type and says where, with the names along the way', () => {
        const result = validateTemplate(template({ type: 'nope' }))
        expect(result.ok).toBe(false)
        expect(result.errors[0]).toEqual({
            key: 'rule.unknownType',
            params: { type: 'nope' },
            at: { group: 0, groupName: 'G', subgroup: 0, subgroupName: 'S', category: 0, categoryName: 'C' },
        })
    })

    it('flags problems inside a capped rule as the inner rule', () => {
        const result = validateTemplate(template({ type: 'capped', cap: 10, inner: { type: 'hours', pointsPerUnit: 1 } }))
        expect(result.errors[0].key).toBe('rule.hoursUnitSize')
        expect(result.errors[0].at?.innerRule).toBe(true)
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

describe('formatTemplateError (English, for the server and publish script)', () => {
    it('keeps the JSON path and fills params', () => {
        const [error] = validateTemplate(template({ type: 'nope' })).errors
        expect(formatTemplateError(error)).toBe('groups[0].subgroups[0].categories[0].rule: unknown rule type "nope".')
    })

    it('points at the inner rule of a capped rule', () => {
        const [error] = validateTemplate(template({ type: 'capped', cap: 5, inner: { type: 'flat' } })).errors
        expect(formatTemplateError(error)).toBe(
            'groups[0].subgroups[0].categories[0].rule.inner: flat rule needs a positive numeric pointsPerUnit.'
        )
    })
})

describe('translateTemplateErrors (app language)', () => {
    const i18n = i18next.createInstance()
    i18n.init({
        lng: 'pt-BR',
        resources: { en: { collections: enCollections }, 'pt-BR': { collections: ptCollections } },
        interpolation: { escapeValue: false },
    })

    const unknownRule: TemplateError = {
        key: 'rule.unknownType',
        params: { type: 'nope' },
        at: { group: 0, groupName: 'Grupo I', subgroup: 2, subgroupName: 'I3', category: 0, categoryName: 'Orientação' },
    }

    it('translates into Portuguese with a readable location', async () => {
        await i18n.changeLanguage('pt-BR')
        expect(translateTemplateErrors([unknownRule], i18n.t)).toEqual([
            'Grupo I › I3 › Orientação: tipo de regra desconhecido: "nope".',
        ])
    })

    it('translates into English', async () => {
        await i18n.changeLanguage('en')
        expect(translateTemplateErrors([unknownRule], i18n.t)).toEqual([
            'Grupo I › I3 › Orientação: unknown rule type: "nope".',
        ])
    })

    it('falls back to positions when items have no name, and marks inner rules', async () => {
        await i18n.changeLanguage('pt-BR')
        const [message] = translateTemplateErrors(
            [{ key: 'rule.hoursUnitSize', at: { group: 0, subgroup: 1, category: 2, innerRule: true } }],
            i18n.t
        )
        expect(message).toBe(
            '1º grupo › 2º subgrupo › 3ª categoria (regra interna): a regra por horas precisa de um tamanho de unidade (horas) maior que zero.'
        )
    })

    it('has no location for whole-template errors', async () => {
        await i18n.changeLanguage('pt-BR')
        expect(translateTemplateErrors([{ key: 'template.noGroups' }], i18n.t)).toEqual([
            'O modelo precisa ter pelo menos um grupo.',
        ])
    })

    // Every key the validator can emit must have a message in both languages.
    const source = fs.readFileSync(path.resolve(__dirname, '../../shared/templateValidation.ts'), 'utf-8')
    const keys = [...source.matchAll(/\| '([a-zA-Z]+\.[a-zA-Z]+)'/g)].map((m) => m[1])
    for (const [lang, bundle] of Object.entries({ en: enCollections, 'pt-BR': ptCollections })) {
        it(`${lang} has a translation for all ${keys.length} error keys`, () => {
            const errors = bundle.templateErrors as Record<string, Record<string, string>>
            const missing = keys.filter((key) => {
                const [scope, name] = key.split('.')
                return typeof errors[scope]?.[name] !== 'string'
            })
            expect(missing).toEqual([])
        })
    }
})
