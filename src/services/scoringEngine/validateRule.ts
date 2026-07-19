import type { CappedRule, FlatRule, HoursRule, Rule, ValidationResult } from './types'

function validateFlat(rule: FlatRule): string[] {
    const errors: string[] = []
    if (typeof rule.pointsPerUnit !== 'number' || !Number.isFinite(rule.pointsPerUnit)) {
        errors.push('flat rule: pointsPerUnit must be a finite number.')
    } else if (rule.pointsPerUnit <= 0) {
        errors.push('flat rule: pointsPerUnit must be greater than zero.')
    }
    return errors
}

function validateHours(rule: HoursRule): string[] {
    const errors: string[] = []
    if (typeof rule.pointsPerUnit !== 'number' || !Number.isFinite(rule.pointsPerUnit)) {
        errors.push('hours rule: pointsPerUnit must be a finite number.')
    } else if (rule.pointsPerUnit <= 0) {
        errors.push('hours rule: pointsPerUnit must be greater than zero.')
    }
    if (typeof rule.unitSize !== 'number' || !Number.isFinite(rule.unitSize)) {
        errors.push('hours rule: unitSize must be a finite number.')
    } else if (rule.unitSize <= 0) {
        errors.push('hours rule: unitSize must be greater than zero.')
    }
    return errors
}

function validateCapped(rule: CappedRule): string[] {
    const errors: string[] = []

    if (!rule.inner) {
        errors.push('capped rule: must reference a valid inner rule.')
    } else if (rule.inner.type === 'flat') {
        errors.push(...validateFlat(rule.inner))
    } else if (rule.inner.type === 'hours') {
        errors.push(...validateHours(rule.inner))
    } else {
        errors.push('capped rule: inner rule must be of type "flat" or "hours".')
    }

    if (typeof rule.cap !== 'number' || !Number.isFinite(rule.cap)) {
        errors.push('capped rule: cap must be a finite number.')
    } else if (rule.cap <= 0) {
        errors.push('capped rule: cap must be greater than zero.')
    }

    return errors
}

/**
 * Validates a rule object against its expected schema (NFR-04-03).
 * Must be called before a rule is written to storage — a malformed
 * rule should be rejected at the service layer, not discovered at
 * read/score time.
 */
export function validateRule(rule: Rule | null | undefined): ValidationResult {
    if (!rule || typeof rule !== 'object') {
        return { valid: false, errors: ['Rule is required.'] }
    }

    let errors: string[] = []

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
            errors = [`Unknown rule type: "${(rule as { type: string }).type}".`]
    }

    return { valid: errors.length === 0, errors }
}