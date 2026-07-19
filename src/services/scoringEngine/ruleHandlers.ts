import type {
    CappedRule,
    DocumentContribution,
    FlatRule,
    HoursRule,
    Rule,
    ScorableDocument,
} from './types'

export interface RuleHandlerResult {
    rawTotal: number
    breakdown: DocumentContribution[]
}

export type RuleHandler<R extends Rule = Rule> = (
    rule: R,
    documents: ScorableDocument[]
) => RuleHandlerResult

// ---- flat: N points per document ----
const flatHandler: RuleHandler<FlatRule> = (rule, documents) => {
    const breakdown = documents.map((doc) => ({
        documentId: doc.id,
        points: rule.pointsPerUnit,
    }))
    const rawTotal = breakdown.reduce((sum, b) => sum + b.points, 0)
    return { rawTotal, breakdown }
}

// ---- hours: pointsPerUnit awarded per unitSize hours declared, continuous ----
const hoursHandler: RuleHandler<HoursRule> = (rule, documents) => {
    const breakdown = documents.map((doc) => {
        const hours = doc.hours ?? 0
        const points = (hours / rule.unitSize) * rule.pointsPerUnit
        return { documentId: doc.id, points }
    })
    const rawTotal = breakdown.reduce((sum, b) => sum + b.points, 0)
    return { rawTotal, breakdown }
}

// ---- capped: delegates to inner rule's handler, caller applies the clamp ----
const cappedHandler: RuleHandler<CappedRule> = (rule, documents) => {
    const innerHandler = ruleHandlerRegistry[rule.inner.type] as RuleHandler
    return innerHandler(rule.inner, documents)
}

/**
 * Registry mapping rule type -> handler.
 * Adding a new rule type requires adding one entry here — nothing else
 * in the engine changes (NFR-04-02).
 */
export const ruleHandlerRegistry: Record<Rule['type'], RuleHandler<any>> = {
    flat: flatHandler,
    hours: hoursHandler,
    capped: cappedHandler,
}

export function registerRuleHandler<R extends Rule>(
    type: R['type'],
    handler: RuleHandler<R>
) {
    ruleHandlerRegistry[type] = handler as RuleHandler<any>
}