import type { ValidationError, ValidationResult } from './types'

export interface MinMaxThresholds {
    minPoints?: number | null
    maxPoints?: number | null
}

/**
 * Shared min/max validation — used by both validateSubgroupThresholds
 * here and validateGroupThresholds in validateGroup.ts, since the rule
 * ("max must exceed min when both are set") is identical at either
 * level. Exported so validateGroup.ts can reuse it directly rather than
 * duplicating the same four checks.
 */
export function validateMinMax(input: MinMaxThresholds, prefix: 'subgroup' | 'group'): ValidationError[] {
    const errors: ValidationError[] = []
    const { minPoints, maxPoints } = input

    if (minPoints != null && (typeof minPoints !== 'number' || !Number.isFinite(minPoints))) {
        errors.push({ key: `${prefix}.minPointsNotFinite` })
    }
    if (maxPoints != null && (typeof maxPoints !== 'number' || !Number.isFinite(maxPoints))) {
        errors.push({ key: `${prefix}.maxPointsNotFinite` })
    }
    if (
        minPoints != null &&
        maxPoints != null &&
        Number.isFinite(minPoints) &&
        Number.isFinite(maxPoints) &&
        maxPoints <= minPoints
    ) {
        errors.push({ key: `${prefix}.maxPointsNotGreaterThanMin` })
    }

    return errors
}

export type SubgroupThresholds = MinMaxThresholds

/**
 * Validates a subgroup's min/max thresholds before they're written to
 * storage (mirrors validateRule's NFR-04-03 role, one level up — same
 * "reject at the service layer, not at read/score time" discipline).
 *
 * NOTE: no longer includes bonusRate — that moved to Group, since a
 * group-spanning bonus needs to sit above the subgroups it spans, not
 * on one subgroup standing in for the whole group. See
 * validateGroupThresholds in validateGroup.ts.
 *
 * Same structured-key contract as validateRule: callers translate
 * `key`/`params` into display text — see categories.json's
 * `rule.errors.*` for the existing pattern; matching keys for
 * `subgroup.*` need adding wherever that translation happens.
 */
export function validateSubgroupThresholds(input: SubgroupThresholds): ValidationResult {
    const errors = validateMinMax(input, 'subgroup')
    return { valid: errors.length === 0, errors }
}