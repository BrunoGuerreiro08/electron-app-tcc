import type { TFunction } from 'i18next'
import type { ValidationError } from '@/services/scoringEngine/types'

/**
 * Translates the structured error keys returned by validateRule() into
 * display strings. Lives on the UI side deliberately — validateRule() itself
 * must stay framework-agnostic (NFR-04-06), so translation happens here,
 * one layer up, not inside the scoring engine.
 */
export function translateRuleErrors(errors: ValidationError[], t: TFunction): string[] {
    return errors.map((e) => t(`categories:rule.errors.${e.key}`, e.params))
}