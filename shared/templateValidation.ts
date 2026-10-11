// Template schema and validator shared by the Electron app (importing and
// applying templates) and the server (publishing official ones), so both
// sides agree on what a valid template is (NFR-12-01, NFR-A01-02).
// Pure TypeScript with no runtime dependencies — keep it that way, both
// bundlers and the server's tsx import it directly.

// --- Schema ---------------------------------------------------------
//
// Mirrors the REAL src/services/scoringEngine/types.ts (confirmed —
// this replaces the earlier entities.md-guessed shape). One detail that
// matters for validation: CappedRule.inner is FlatRule | HoursRule
// ONLY — capped rules can't nest inside each other.
export interface FlatRule {
    type: 'flat'
    pointsPerUnit: number
}

export interface HoursRule {
    type: 'hours'
    pointsPerUnit: number
    unitSize: number
}

export interface CappedRule {
    type: 'capped'
    inner: FlatRule | HoursRule
    cap: number
}

/**
 * Caps EACH document's own contribution individually, before summing —
 * distinct from CappedRule's aggregate-sum cap. See the matching
 * comment in src/services/scoringEngine/types.ts for the full
 * reasoning; kept in sync manually here for the same main/renderer
 * boundary reason as the rest of this file's local Rule shape.
 */
export interface CappedPerDocumentRule {
    type: 'cappedPerDocument'
    inner: FlatRule | HoursRule
    capPerDocument: number
}

export type Rule = FlatRule | HoursRule | CappedRule | CappedPerDocumentRule

/**
 * A document reference carried by a `collection_export` JSON being reused
 * as a template (see src/services/reportEngine/exporters/exportJson.tsx —
 * that export is deliberately kept template-compatible). Absent on a plain
 * structure-only template. `file_name` is what gets matched against an
 * uploaded ZIP's entries at apply time.
 */
export interface TemplateDocumentRef {
    title: string
    issued_at: string | null
    quantity: number
    hours: number | null
    file_name: string | null
}

export interface TemplateCategory {
    name: string
    display_order: number
    rule: Rule
    documents?: TemplateDocumentRef[]
}

export interface TemplateSubgroup {
    name: string
    display_order: number
    min_points?: number | null
    max_points?: number | null
    categories: TemplateCategory[]
}

export interface TemplateGroup {
    name: string
    display_order: number
    min_points?: number | null
    max_points?: number | null
    bonus_rate?: number | null
    subgroups: TemplateSubgroup[]
}

export interface TemplateFile {
    schemaVersion: 1
    name: string
    description?: string
    groups: TemplateGroup[]
}

// --- Validation ---------------------------------------------------------
//
// Errors are structured (key + params + location), not text: the app
// translates them into the user's language (src/lib/translateTemplateErrors.ts),
// while the server and the publish script — admin-facing, English is fine —
// use formatTemplateError() below. Keeps this module free of any i18n
// dependency, since both sides import it.

export type TemplateErrorKey =
    // whole file (the last two are raised by the app when reading the file)
    | 'file.notObject'
    | 'file.unreadable'
    | 'file.invalidJson'
    // template level
    | 'template.schemaVersion'
    | 'template.missingName'
    | 'template.noGroups'
    | 'template.noValidCategory'
    // structure
    | 'group.notObject'
    | 'group.missingName'
    | 'group.maxNotAboveMin'
    | 'group.bonusRateInvalid'
    | 'group.bonusRateNeedsMin'
    | 'group.noSubgroups'
    | 'subgroup.notObject'
    | 'subgroup.missingName'
    | 'subgroup.maxNotAboveMin'
    | 'subgroup.noCategories'
    | 'category.notObject'
    | 'category.missingName'
    | 'category.documentsNotList'
    | 'document.notObject'
    | 'document.missingTitle'
    | 'document.fileNameInvalid'
    // scoring rules
    | 'rule.missing'
    | 'rule.flatPointsPerUnit'
    | 'rule.hoursPointsPerUnit'
    | 'rule.hoursUnitSize'
    | 'rule.innerType'
    | 'rule.cappedCap'
    | 'rule.cappedPerDocumentCap'
    | 'rule.unknownType'
    // documents ZIP paired with a template (raised by the app)
    | 'zip.unreadable'

/**
 * Where in the template the problem is. Indexes are 0-based; names are
 * included when the item has one, so messages can say "Grupo I › I3"
 * instead of "groups[0].subgroups[2]".
 */
export interface TemplateErrorLocation {
    group?: number
    groupName?: string
    subgroup?: number
    subgroupName?: string
    category?: number
    categoryName?: string
    document?: number
    documentTitle?: string
    /** The problem is in a capped rule's inner rule. */
    innerRule?: boolean
}

export interface TemplateError {
    key: TemplateErrorKey
    params?: Record<string, string | number>
    at?: TemplateErrorLocation
}

export interface ValidationResult {
    ok: boolean
    errors: TemplateError[]
    template?: TemplateFile
}

function nameOf(value: unknown, field: 'name' | 'title' = 'name'): string | undefined {
    if (!value || typeof value !== 'object') return undefined
    const raw = (value as Record<string, unknown>)[field]
    return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : undefined
}

function validateFlatOrHours(rule: unknown, at: TemplateErrorLocation, errors: TemplateError[]): boolean {
    if (!rule || typeof rule !== 'object') {
        errors.push({ key: 'rule.missing', at })
        return false
    }
    const r = rule as Record<string, unknown>

    if (r.type === 'flat') {
        if (typeof r.pointsPerUnit !== 'number' || r.pointsPerUnit <= 0) {
            errors.push({ key: 'rule.flatPointsPerUnit', at })
            return false
        }
        return true
    }

    if (r.type === 'hours') {
        if (typeof r.pointsPerUnit !== 'number' || r.pointsPerUnit <= 0) {
            errors.push({ key: 'rule.hoursPointsPerUnit', at })
            return false
        }
        if (typeof r.unitSize !== 'number' || r.unitSize <= 0) {
            errors.push({ key: 'rule.hoursUnitSize', at })
            return false
        }
        return true
    }

    errors.push({ key: 'rule.innerType', params: { type: String(r.type) }, at })
    return false
}

function validateRule(rule: unknown, at: TemplateErrorLocation, errors: TemplateError[]): rule is Rule {
    if (!rule || typeof rule !== 'object') {
        errors.push({ key: 'rule.missing', at })
        return false
    }
    const r = rule as Record<string, unknown>

    if (r.type === 'flat' || r.type === 'hours') {
        return validateFlatOrHours(r, at, errors)
    }

    if (r.type === 'capped') {
        if (typeof r.cap !== 'number' || r.cap <= 0) {
            errors.push({ key: 'rule.cappedCap', at })
            return false
        }
        // Deliberately validateFlatOrHours, not a recursive validateRule
        // call — capped rules can't wrap another capped rule.
        return validateFlatOrHours(r.inner, { ...at, innerRule: true }, errors)
    }

    if (r.type === 'cappedPerDocument') {
        if (typeof r.capPerDocument !== 'number' || r.capPerDocument <= 0) {
            errors.push({ key: 'rule.cappedPerDocumentCap', at })
            return false
        }
        return validateFlatOrHours(r.inner, { ...at, innerRule: true }, errors)
    }

    errors.push({ key: 'rule.unknownType', params: { type: String(r.type) }, at })
    return false
}

/**
 * Validates a parsed JSON value against the template schema, collecting
 * every problem found rather than stopping at the first one — so an
 * import failure can tell the user exactly what's wrong (NFR-12-02)
 * instead of a generic "invalid file" message.
 */
export function validateTemplate(data: unknown): ValidationResult {
    if (!data || typeof data !== 'object') {
        return { ok: false, errors: [{ key: 'file.notObject' }] }
    }

    const errors: TemplateError[] = []
    const t = data as Record<string, unknown>

    if (t.schemaVersion !== 1) {
        errors.push({ key: 'template.schemaVersion', params: { got: JSON.stringify(t.schemaVersion) ?? 'undefined' } })
    }
    if (typeof t.name !== 'string' || t.name.trim() === '') {
        errors.push({ key: 'template.missingName' })
    }

    let hasValidCategory = false

    if (!Array.isArray(t.groups) || t.groups.length === 0) {
        errors.push({ key: 'template.noGroups' })
    } else {
        t.groups.forEach((grp: unknown, g: number) => {
            const grpAt: TemplateErrorLocation = { group: g, groupName: nameOf(grp) }
            if (!grp || typeof grp !== 'object') {
                errors.push({ key: 'group.notObject', at: grpAt })
                return
            }
            const group = grp as Record<string, unknown>

            if (!grpAt.groupName) {
                errors.push({ key: 'group.missingName', at: grpAt })
            }
            if (
                typeof group.min_points === 'number' &&
                typeof group.max_points === 'number' &&
                group.max_points <= group.min_points
            ) {
                errors.push({ key: 'group.maxNotAboveMin', at: grpAt })
            }
            if (group.bonus_rate != null) {
                if (typeof group.bonus_rate !== 'number' || group.bonus_rate <= 0) {
                    errors.push({ key: 'group.bonusRateInvalid', at: grpAt })
                }
                // A surplus bonus is only meaningful relative to a minimum.
                if (typeof group.min_points !== 'number') {
                    errors.push({ key: 'group.bonusRateNeedsMin', at: grpAt })
                }
            }

            if (!Array.isArray(group.subgroups) || group.subgroups.length === 0) {
                errors.push({ key: 'group.noSubgroups', at: grpAt })
                return
            }

            group.subgroups.forEach((sg: unknown, i: number) => {
                const sgAt: TemplateErrorLocation = { ...grpAt, subgroup: i, subgroupName: nameOf(sg) }
                if (!sg || typeof sg !== 'object') {
                    errors.push({ key: 'subgroup.notObject', at: sgAt })
                    return
                }
                const s = sg as Record<string, unknown>

                if (!sgAt.subgroupName) {
                    errors.push({ key: 'subgroup.missingName', at: sgAt })
                }
                if (
                    typeof s.min_points === 'number' &&
                    typeof s.max_points === 'number' &&
                    s.max_points <= s.min_points
                ) {
                    errors.push({ key: 'subgroup.maxNotAboveMin', at: sgAt })
                }

                if (!Array.isArray(s.categories) || s.categories.length === 0) {
                    errors.push({ key: 'subgroup.noCategories', at: sgAt })
                    return
                }

                s.categories.forEach((cat: unknown, j: number) => {
                    const catAt: TemplateErrorLocation = { ...sgAt, category: j, categoryName: nameOf(cat) }
                    if (!cat || typeof cat !== 'object') {
                        errors.push({ key: 'category.notObject', at: catAt })
                        return
                    }
                    const c = cat as Record<string, unknown>

                    if (!catAt.categoryName) {
                        errors.push({ key: 'category.missingName', at: catAt })
                    }
                    if (validateRule(c.rule, catAt, errors)) {
                        hasValidCategory = true
                    }

                    // Optional — only present when this file is a collection_export
                    // being reused as a template. Light validation only: this isn't
                    // required for the template to be usable, just for the document
                    // list to be trustworthy if present at all.
                    if (c.documents !== undefined) {
                        if (!Array.isArray(c.documents)) {
                            errors.push({ key: 'category.documentsNotList', at: catAt })
                        } else {
                            c.documents.forEach((docRaw: unknown, di: number) => {
                                const docAt: TemplateErrorLocation = {
                                    ...catAt,
                                    document: di,
                                    documentTitle: nameOf(docRaw, 'title'),
                                }
                                if (!docRaw || typeof docRaw !== 'object') {
                                    errors.push({ key: 'document.notObject', at: docAt })
                                    return
                                }
                                const d = docRaw as Record<string, unknown>
                                if (!docAt.documentTitle) {
                                    errors.push({ key: 'document.missingTitle', at: docAt })
                                }
                                if (d.file_name !== null && typeof d.file_name !== 'string') {
                                    errors.push({ key: 'document.fileNameInvalid', at: docAt })
                                }
                            })
                        }
                    }
                })
            })
        })
    }

    // A template with no valid category anywhere is useless even if every
    // individual field technically parsed.
    if (Array.isArray(t.groups) && t.groups.length > 0 && !hasValidCategory) {
        errors.push({ key: 'template.noValidCategory' })
    }

    if (errors.length > 0) {
        return { ok: false, errors }
    }

    return { ok: true, errors: [], template: t as unknown as TemplateFile }
}

// --- English formatting (server, publish script, logs) ------------------

const ENGLISH: Record<TemplateErrorKey, string> = {
    'file.notObject': 'Template file is not a valid JSON object.',
    'file.unreadable': 'Could not read the file.',
    'file.invalidJson': 'File is not valid JSON.',
    'template.schemaVersion': 'Unsupported schemaVersion (expected 1, got {{got}}).',
    'template.missingName': 'Template is missing a name.',
    'template.noGroups': 'Template must have at least one group.',
    'template.noValidCategory': 'Template must have at least one category with a valid scoring rule.',
    'group.notObject': 'not a valid object.',
    'group.missingName': 'missing a name.',
    'group.maxNotAboveMin': 'max_points must be greater than min_points.',
    'group.bonusRateInvalid': 'bonus_rate must be a positive number when present.',
    'group.bonusRateNeedsMin': 'bonus_rate requires min_points to be set.',
    'group.noSubgroups': 'must have at least one subgroup.',
    'subgroup.notObject': 'not a valid object.',
    'subgroup.missingName': 'missing a name.',
    'subgroup.maxNotAboveMin': 'max_points must be greater than min_points.',
    'subgroup.noCategories': 'must have at least one category.',
    'category.notObject': 'not a valid object.',
    'category.missingName': 'missing a name.',
    'category.documentsNotList': 'documents must be a list.',
    'document.notObject': 'not a valid object.',
    'document.missingTitle': 'missing a title.',
    'document.fileNameInvalid': 'file_name must be a string or null.',
    'rule.missing': 'rule is missing or not an object.',
    'rule.flatPointsPerUnit': 'flat rule needs a positive numeric pointsPerUnit.',
    'rule.hoursPointsPerUnit': 'hours rule needs a positive numeric pointsPerUnit.',
    'rule.hoursUnitSize': 'hours rule needs a positive numeric unitSize.',
    'rule.innerType': 'expected "flat" or "hours", got "{{type}}".',
    'rule.cappedCap': 'capped rule needs a numeric cap greater than zero.',
    'rule.cappedPerDocumentCap': 'cappedPerDocument rule needs a numeric capPerDocument greater than zero.',
    'rule.unknownType': 'unknown rule type "{{type}}".',
    'zip.unreadable': 'Could not read the documents ZIP.',
}

/** JSON-path style location, e.g. `groups[0].subgroups[2].categories[1].rule.inner`. */
export function formatTemplateErrorPath(at: TemplateErrorLocation | undefined, key?: TemplateErrorKey): string {
    if (!at || at.group == null) return ''
    let p = `groups[${at.group}]`
    if (at.subgroup != null) p += `.subgroups[${at.subgroup}]`
    if (at.category != null) p += `.categories[${at.category}]`
    if (at.document != null) p += `.documents[${at.document}]`
    else if (key?.startsWith('rule.')) p += at.innerRule ? '.rule.inner' : '.rule'
    return p
}

export function formatTemplateError(error: TemplateError): string {
    const message = ENGLISH[error.key].replace(/\{\{(\w+)\}\}/g, (_, name: string) =>
        String(error.params?.[name] ?? '')
    )
    const where = formatTemplateErrorPath(error.at, error.key)
    return where ? `${where}: ${message}` : message
}
