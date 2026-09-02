import type { ValidationError, ValidationResult } from './types'
import { validateMinMax, type MinMaxThresholds } from './validateSubgroup'

export interface GroupThresholds extends MinMaxThresholds {
    bonusRate?: number | null
}

/**
 * Validates a group's min/max/bonus thresholds before they're written
 * to storage — same NFR-04-03-style discipline as validateRule and
 * validateSubgroupThresholds, one level further up the hierarchy.
 *
 * This is where bonusRate validation actually lives now (it briefly
 * lived in validateSubgroupThresholds before Group existed — see that
 * file's note). A surplus bonus only makes sense relative to a group's
 * own minimum, so bonusRate without minPoints is rejected here the same
 * way it was before.
 */
export function validateGroupThresholds(input: GroupThresholds): ValidationResult {
    const errors: ValidationError[] = validateMinMax(input, 'group')
    const { minPoints, bonusRate } = input

    if (bonusRate != null) {
        if (typeof bonusRate !== 'number' || !Number.isFinite(bonusRate) || bonusRate <= 0) {
            errors.push({ key: 'group.bonusRateNotPositive' })
        }
        if (minPoints == null) {
            errors.push({ key: 'group.bonusRateRequiresMinPoints' })
        }
    }

    return { valid: errors.length === 0, errors }
}