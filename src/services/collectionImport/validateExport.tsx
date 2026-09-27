import type { ReviewSnapshot, ReviewSummary } from '@/types/review'
import type { FlatRule, HoursRule, Rule } from '@/services/scoringEngine/types'
import { validateRule } from '@/services/scoringEngine/validateRule'

/**
 * Validates and NORMALISES a collection-export JSON received from another user.
 *
 * The file is untrusted input, so this never returns the parsed object as-is:
 * it rebuilds a clean snapshot from known fields only (unknown keys are dropped).
 * Errors are specific and path-based so the user can tell what is wrong (NFR-12-02).
 */

export type ValidationResult =
    | { ok: true; data: ReviewSnapshot }
    | { ok: false; errors: string[] }

const MAX_ERRORS = 15

class Collector {
    errors: string[] = []
    add(path: string, message: string) {
        if (this.errors.length < MAX_ERRORS) this.errors.push(`${path}: ${message}`)
    }
    get truncated() {
        return this.errors.length >= MAX_ERRORS
    }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v)

function readNumber(c: Collector, v: unknown, path: string): number {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        c.add(path, 'deve ser um número')
        return 0
    }
    return v
}

function readNumberOrNull(c: Collector, v: unknown, path: string): number | null {
    return v === null || v === undefined ? null : readNumber(c, v, path)
}

function readText(c: Collector, v: unknown, path: string): string {
    if (typeof v !== 'string') {
        c.add(path, 'deve ser um texto')
        return ''
    }
    return v
}

function readTextOrNull(c: Collector, v: unknown, path: string): string | null {
    return v === null || v === undefined ? null : readText(c, v, path)
}

function readArray(c: Collector, v: unknown, path: string): unknown[] {
    if (!Array.isArray(v)) {
        c.add(path, 'deve ser uma lista')
        return []
    }
    return v
}

function readObject(c: Collector, v: unknown, path: string): Record<string, unknown> {
    if (!isRecord(v)) {
        c.add(path, 'deve ser um objeto')
        return {}
    }
    return v
}

const KNOWN_RULE_TYPES = ['flat', 'hours', 'capped', 'cappedPerDocument']

const normalizeInner = (r: FlatRule | HoursRule): FlatRule | HoursRule =>
    r.type === 'flat'
        ? { type: 'flat', pointsPerUnit: r.pointsPerUnit }
        : { type: 'hours', pointsPerUnit: r.pointsPerUnit, unitSize: r.unitSize }

/** Rebuilds a rule from known fields only (drops anything extra a file may carry). */
function normalizeRule(r: Rule): Rule {
    switch (r.type) {
        case 'flat':
        case 'hours':
            return normalizeInner(r)
        case 'capped':
            return { type: 'capped', inner: normalizeInner(r.inner), cap: r.cap }
        case 'cappedPerDocument':
            return { type: 'cappedPerDocument', inner: normalizeInner(r.inner), capPerDocument: r.capPerDocument }
    }
}

function readRule(c: Collector, v: unknown, path: string): Rule {
    const fallback: Rule = { type: 'flat', pointsPerUnit: 1 }
    if (!isRecord(v)) {
        c.add(path, 'a categoria não tem regra de pontuação válida')
        return fallback
    }
    if (!KNOWN_RULE_TYPES.includes(v.type as string)) {
        c.add(
            `${path}.type`,
            `tipo de regra desconhecido (${JSON.stringify(v.type)}) — pode ter sido criado em uma versão mais nova do aplicativo`
        )
        return fallback
    }
    // Same validation the app applies before it ever saves a rule (NFR-04-03):
    // one source of truth, so an import can't accept a rule the app itself would reject.
    const result = validateRule(v as unknown as Rule)
    if (!result.valid) {
        c.add(path, `regra de pontuação inválida (${result.errors.map((e) => e.key).join(', ')})`)
        return fallback
    }
    return normalizeRule(v as unknown as Rule)
}

export function validateCollectionExport(raw: unknown): ValidationResult {
    if (!isRecord(raw)) {
        return { ok: false, errors: ['O arquivo não contém um objeto JSON de coleção.'] }
    }

    // Friendly, specific message for the most likely wrong file: a template.
    if (raw.kind === undefined && Array.isArray(raw.groups)) {
        return {
            ok: false,
            errors: [
                'Este arquivo parece ser um modelo de coleção (template), não uma exportação de coleção. ' +
                'Modelos não contêm documentos nem pontuações e não podem ser abertos para revisão.',
            ],
        }
    }
    if (raw.kind !== 'collection_export') {
        return {
            ok: false,
            errors: ['Este arquivo não é uma exportação de coleção (campo "kind" ausente ou diferente de "collection_export").'],
        }
    }
    if (raw.schemaVersion !== 1) {
        return {
            ok: false,
            errors: [
                `Versão do formato não suportada (${JSON.stringify(raw.schemaVersion)}). ` +
                'Peça a quem enviou para exportar novamente com a versão atual do aplicativo.',
            ],
        }
    }

    const c = new Collector()

    const name = readText(c, raw.name, 'name')
    if (!name.trim()) c.add('name', 'não pode estar vazio')

    const exportedAt = readText(c, raw.exported_at, 'exported_at')
    if (exportedAt && Number.isNaN(Date.parse(exportedAt))) c.add('exported_at', 'não é uma data válida')

    let templateOrigin: ReviewSnapshot['template_origin'] = null
    if (raw.template_origin !== null && raw.template_origin !== undefined) {
        const to = readObject(c, raw.template_origin, 'template_origin')
        templateOrigin = {
            template_name: readText(c, to.template_name, 'template_origin.template_name'),
            template_fingerprint: readText(c, to.template_fingerprint, 'template_origin.template_fingerprint'),
            unmodified: to.unmodified === true,
        }
        if (typeof to.unmodified !== 'boolean') c.add('template_origin.unmodified', 'deve ser verdadeiro ou falso')
    }

    let exportedBy: ReviewSnapshot['exported_by'] = null
    if (raw.exported_by !== null && raw.exported_by !== undefined) {
        const by = readObject(c, raw.exported_by, 'exported_by')
        exportedBy = {
            name: readText(c, by.name, 'exported_by.name'),
            email: readTextOrNull(c, by.email, 'exported_by.email'),
        }
    }

    const groups: ReviewSnapshot['groups'] = readArray(c, raw.groups, 'groups').map((gRaw, gi) => {
        const gp = `groups[${gi}]`
        const g = readObject(c, gRaw, gp)
        const gScore = readObject(c, g.score, `${gp}.score`)

        const subgroups = readArray(c, g.subgroups, `${gp}.subgroups`).map((sRaw, si) => {
            const sp = `${gp}.subgroups[${si}]`
            const s = readObject(c, sRaw, sp)
            const sScore = readObject(c, s.score, `${sp}.score`)

            const categories = readArray(c, s.categories, `${sp}.categories`).map((cRaw, ci) => {
                const cp = `${sp}.categories[${ci}]`
                const cat = readObject(c, cRaw, cp)
                const cScore = readObject(c, cat.score, `${cp}.score`)

                const documents = readArray(c, cat.documents, `${cp}.documents`).map((dRaw, di) => {
                    const dp = `${cp}.documents[${di}]`
                    const d = readObject(c, dRaw, dp)
                    if (typeof d.has_file !== 'boolean') c.add(`${dp}.has_file`, 'deve ser verdadeiro ou falso')
                    return {
                        title: readText(c, d.title, `${dp}.title`),
                        issued_at: readTextOrNull(c, d.issued_at, `${dp}.issued_at`),
                        quantity: readNumber(c, d.quantity, `${dp}.quantity`),
                        hours: readNumberOrNull(c, d.hours, `${dp}.hours`),
                        points: readNumber(c, d.points, `${dp}.points`),
                        has_file: d.has_file === true,
                        file_name: readTextOrNull(c, d.file_name, `${dp}.file_name`),
                    }
                })

                return {
                    name: readText(c, cat.name, `${cp}.name`),
                    display_order: ci,
                    rule: readRule(c, cat.rule, `${cp}.rule`),
                    score: {
                        raw_total: readNumber(c, cScore.raw_total, `${cp}.score.raw_total`),
                        total: readNumber(c, cScore.total, `${cp}.score.total`),
                        capped: cScore.capped === true,
                    },
                    documents,
                }
            })

            return {
                name: readText(c, s.name, `${sp}.name`),
                display_order: si,
                min_points: readNumberOrNull(c, s.min_points, `${sp}.min_points`),
                max_points: readNumberOrNull(c, s.max_points, `${sp}.max_points`),
                score: {
                    raw_total: readNumber(c, sScore.raw_total, `${sp}.score.raw_total`),
                    total: readNumber(c, sScore.total, `${sp}.score.total`),
                    completion: readTextOrNull(c, sScore.completion, `${sp}.score.completion`),
                },
                categories,
            }
        })

        return {
            name: readText(c, g.name, `${gp}.name`),
            display_order: gi,
            min_points: readNumberOrNull(c, g.min_points, `${gp}.min_points`),
            max_points: readNumberOrNull(c, g.max_points, `${gp}.max_points`),
            bonus_rate: readNumberOrNull(c, g.bonus_rate, `${gp}.bonus_rate`),
            score: {
                raw_total: readNumber(c, gScore.raw_total, `${gp}.score.raw_total`),
                total: readNumber(c, gScore.total, `${gp}.score.total`),
                completion: readTextOrNull(c, gScore.completion, `${gp}.score.completion`),
                bonus: readNumberOrNull(c, gScore.bonus, `${gp}.score.bonus`),
            },
            subgroups,
        }
    })

    const totalScore = readNumber(c, raw.total_score, 'total_score')
    const description = readTextOrNull(c, raw.description, 'description')

    if (c.errors.length > 0) {
        const errors = [...c.errors]
        if (c.truncated) errors.push('… e possivelmente outros erros. Corrija estes primeiro.')
        return { ok: false, errors }
    }

    return {
        ok: true,
        data: {
            schemaVersion: 1,
            kind: 'collection_export',
            name,
            description,
            exported_at: exportedAt,
            exported_by: exportedBy,
            template_origin: templateOrigin,
            total_score: totalScore,
            groups,
        },
    }
}

export function summarizeExport(data: ReviewSnapshot): ReviewSummary {
    let documentCount = 0
    for (const g of data.groups)
        for (const s of g.subgroups)
            for (const cat of s.categories) documentCount += cat.documents.length

    return {
        name: data.name,
        senderName: data.exported_by?.name ?? null,
        senderEmail: data.exported_by?.email ?? null,
        exportedAt: data.exported_at,
        totalScore: data.total_score,
        groupCount: data.groups.length,
        documentCount,
    }
}