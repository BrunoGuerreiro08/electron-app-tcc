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

export interface ValidationResult {
    ok: boolean
    errors: string[]
    template?: TemplateFile
}

function validateFlatOrHours(rule: unknown, fieldPath: string, errors: string[]): boolean {
    if (!rule || typeof rule !== 'object') {
        errors.push(`${fieldPath}: rule is missing or not an object.`)
        return false
    }
    const r = rule as Record<string, unknown>

    if (r.type === 'flat') {
        if (typeof r.pointsPerUnit !== 'number' || r.pointsPerUnit <= 0) {
            errors.push(`${fieldPath}: flat rule needs a positive numeric pointsPerUnit.`)
            return false
        }
        return true
    }

    if (r.type === 'hours') {
        if (typeof r.pointsPerUnit !== 'number' || r.pointsPerUnit <= 0) {
            errors.push(`${fieldPath}: hours rule needs a positive numeric pointsPerUnit.`)
            return false
        }
        if (typeof r.unitSize !== 'number' || r.unitSize <= 0) {
            errors.push(`${fieldPath}: hours rule needs a positive numeric unitSize.`)
            return false
        }
        return true
    }

    errors.push(`${fieldPath}: expected "flat" or "hours", got "${String(r.type)}".`)
    return false
}

function validateRule(rule: unknown, fieldPath: string, errors: string[]): rule is Rule {
    if (!rule || typeof rule !== 'object') {
        errors.push(`${fieldPath}: rule is missing or not an object.`)
        return false
    }
    const r = rule as Record<string, unknown>

    if (r.type === 'flat' || r.type === 'hours') {
        return validateFlatOrHours(r, fieldPath, errors)
    }

    if (r.type === 'capped') {
        if (typeof r.cap !== 'number' || r.cap <= 0) {
            errors.push(`${fieldPath}: capped rule needs a numeric cap greater than zero.`)
            return false
        }
        // Deliberately validateFlatOrHours, not a recursive validateRule
        // call — capped rules can't wrap another capped rule.
        if (!validateFlatOrHours(r.inner, `${fieldPath}.inner`, errors)) {
            return false
        }
        return true
    }

    if (r.type === 'cappedPerDocument') {
        if (typeof r.capPerDocument !== 'number' || r.capPerDocument <= 0) {
            errors.push(`${fieldPath}: cappedPerDocument rule needs a numeric capPerDocument greater than zero.`)
            return false
        }
        if (!validateFlatOrHours(r.inner, `${fieldPath}.inner`, errors)) {
            return false
        }
        return true
    }

    errors.push(`${fieldPath}: unknown rule type "${String(r.type)}".`)
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
        return { ok: false, errors: ['Template file is not a valid JSON object.'] }
    }

    const errors: string[] = []
    const t = data as Record<string, unknown>

    if (t.schemaVersion !== 1) {
        errors.push(`Unsupported schemaVersion (expected 1, got ${JSON.stringify(t.schemaVersion)}).`)
    }
    if (typeof t.name !== 'string' || t.name.trim() === '') {
        errors.push('Template is missing a name.')
    }

    let hasValidCategory = false

    if (!Array.isArray(t.groups) || t.groups.length === 0) {
        errors.push('Template must have at least one group.')
    } else {
        t.groups.forEach((grp: unknown, g: number) => {
            const grpPath = `groups[${g}]`
            if (!grp || typeof grp !== 'object') {
                errors.push(`${grpPath}: not a valid object.`)
                return
            }
            const group = grp as Record<string, unknown>

            if (typeof group.name !== 'string' || group.name.trim() === '') {
                errors.push(`${grpPath}: missing a name.`)
            }
            if (
                typeof group.min_points === 'number' &&
                typeof group.max_points === 'number' &&
                group.max_points <= group.min_points
            ) {
                errors.push(`${grpPath}: max_points must be greater than min_points.`)
            }
            if (group.bonus_rate != null) {
                if (typeof group.bonus_rate !== 'number' || group.bonus_rate <= 0) {
                    errors.push(`${grpPath}: bonus_rate must be a positive number when present.`)
                }
                if (typeof group.min_points !== 'number') {
                    errors.push(`${grpPath}: bonus_rate requires min_points to be set — a surplus bonus is only meaningful relative to a minimum.`)
                }
            }

            if (!Array.isArray(group.subgroups) || group.subgroups.length === 0) {
                errors.push(`${grpPath}: must have at least one subgroup.`)
                return
            }

            group.subgroups.forEach((sg: unknown, i: number) => {
                const sgPath = `${grpPath}.subgroups[${i}]`
                if (!sg || typeof sg !== 'object') {
                    errors.push(`${sgPath}: not a valid object.`)
                    return
                }
                const s = sg as Record<string, unknown>

                if (typeof s.name !== 'string' || s.name.trim() === '') {
                    errors.push(`${sgPath}: missing a name.`)
                }
                if (
                    typeof s.min_points === 'number' &&
                    typeof s.max_points === 'number' &&
                    s.max_points <= s.min_points
                ) {
                    errors.push(`${sgPath}: max_points must be greater than min_points.`)
                }

                if (!Array.isArray(s.categories) || s.categories.length === 0) {
                    errors.push(`${sgPath}: must have at least one category.`)
                    return
                }

                s.categories.forEach((cat: unknown, j: number) => {
                    const catPath = `${sgPath}.categories[${j}]`
                    if (!cat || typeof cat !== 'object') {
                        errors.push(`${catPath}: not a valid object.`)
                        return
                    }
                    const c = cat as Record<string, unknown>

                    if (typeof c.name !== 'string' || c.name.trim() === '') {
                        errors.push(`${catPath}: missing a name.`)
                    }
                    if (validateRule(c.rule, `${catPath}.rule`, errors)) {
                        hasValidCategory = true
                    }

                    // Optional — only present when this file is a collection_export
                    // being reused as a template. Light validation only: this isn't
                    // required for the template to be usable, just for the document
                    // list to be trustworthy if present at all.
                    if (c.documents !== undefined) {
                        if (!Array.isArray(c.documents)) {
                            errors.push(`${catPath}.documents: must be a list.`)
                        } else {
                            c.documents.forEach((docRaw: unknown, di: number) => {
                                const docPath = `${catPath}.documents[${di}]`
                                if (!docRaw || typeof docRaw !== 'object') {
                                    errors.push(`${docPath}: not a valid object.`)
                                    return
                                }
                                const d = docRaw as Record<string, unknown>
                                if (typeof d.title !== 'string' || d.title.trim() === '') {
                                    errors.push(`${docPath}: missing a title.`)
                                }
                                if (d.file_name !== null && typeof d.file_name !== 'string') {
                                    errors.push(`${docPath}.file_name: must be a string or null.`)
                                }
                            })
                        }
                    }
                })
            })
        })
    }

    // Mirrors NFR-A01-01: a template with no valid category anywhere is
    // useless even if every individual field technically parsed.
    if (Array.isArray(t.groups) && t.groups.length > 0 && !hasValidCategory) {
        errors.push('Template must have at least one category with a valid scoring rule.')
    }

    if (errors.length > 0) {
        return { ok: false, errors }
    }

    return { ok: true, errors: [], template: t as unknown as TemplateFile }
}
