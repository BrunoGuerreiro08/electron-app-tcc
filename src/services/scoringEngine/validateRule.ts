import type { CappedRule, FlatRule, HoursRule, Rule, ValidationError, ValidationResult } from './types'

function validateFlat(rule: FlatRule): ValidationError[] {
    const errors: ValidationError[] = []
    if (typeof rule.pointsPerUnit !== 'number' || !Number.isFinite(rule.pointsPerUnit)) {
        errors.push({ key: 'flat.pointsPerUnitNotFinite' })
    } else if (rule.pointsPerUnit <= 0) {
        errors.push({ key: 'flat.pointsPerUnitNotPositive' })
    }
    return errors
}

function validateHours(rule: HoursRule): ValidationError[] {
    const errors: ValidationError[] = []
    if (typeof rule.pointsPerUnit !== 'number' || !Number.isFinite(rule.pointsPerUnit)) {
        errors.push({ key: 'hours.pointsPerUnitNotFinite' })
    } else if (rule.pointsPerUnit <= 0) {
        errors.push({ key: 'hours.pointsPerUnitNotPositive' })
    }
    if (typeof rule.unitSize !== 'number' || !Number.isFinite(rule.unitSize)) {
        errors.push({ key: 'hours.unitSizeNotFinite' })
    } else if (rule.unitSize <= 0) {
        errors.push({ key: 'hours.unitSizeNotPositive' })
    }
    return errors
}

function validateCapped(rule: CappedRule): ValidationError[] {
    const errors: ValidationError[] = []

    if (!rule.inner) {
        errors.push({ key: 'capped.missingInner' })
    } else if (rule.inner.type === 'flat') {
        errors.push(...validateFlat(rule.inner))
    } else if (rule.inner.type === 'hours') {
        errors.push(...validateHours(rule.inner))
    } else {
        errors.push({ key: 'capped.invalidInnerType' })
    }

    if (typeof rule.cap !== 'number' || !Number.isFinite(rule.cap)) {
        errors.push({ key: 'capped.capNotFinite' })
    } else if (rule.cap <= 0) {
        errors.push({ key: 'capped.capNotPositive' })
    }

    return errors
}

/**
 * Validates a rule object against its expected schema (NFR-04-03).
 * Must be called before a rule is written to storage — a malformed
 * rule should be rejected at the service layer, not discovered at
 * read/score time.
 *
 * Returns structured error keys (not display text) so this stays a pure,
 * framework-agnostic function per NFR-04-06. Callers are responsible for
 * translating `key`/`params` into a user-facing message — see
 * `categories.json`'s `rule.errors.*` keys for the matching translations.
 */
export function validateRule(rule: Rule | null | undefined): ValidationResult {
    if (!rule || typeof rule !== 'object') {
        return { valid: false, errors: [{ key: 'ruleRequired' }] }
    }

    let errors: ValidationError[] = []

    switch (rule.type) {
        case 'flat':
            errors = validateFlat(rule)
            break
        case 'hours':
            errors = validateHours(rule)
            break
        case 'capped':
            errors = validateCapped(rule)
            break
        default:
            errors = [{ key: 'unknownType', params: { type: (rule as { type: string }).type } }]
    }

    return { valid: errors.length === 0, errors }
}