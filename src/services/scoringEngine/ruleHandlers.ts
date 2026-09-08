import type {
    CappedPerDocumentRule,
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

// ---- cappedPerDocument: delegates to inner rule's handler, THEN clamps
// each document's own contribution — unlike `capped`, which delegates
// and lets the caller (computeCategoryScore) clamp the aggregate sum.
//
// This has to happen HERE, inside the handler, rather than in
// computeCategoryScore's shared post-processing — that post-processing
// applies `quantity` scaling AFTER the handler returns, and the clamp
// needs to land BEFORE that scaling. A document with quantity=2 (one
// certificate representing 2 real-world instances) should have the cap
// applied per-instance, then doubled — not have its combined value
// clamped as if it were a single instance. Clamping in the handler
// (pre-quantity) gets this right for free; clamping in the shared
// post-processing (post-quantity, where `capped`'s aggregate clamp
// lives) would under-credit bundled multi-instance documents.
const cappedPerDocumentHandler: RuleHandler<CappedPerDocumentRule> = (rule, documents) => {
    const innerHandler = ruleHandlerRegistry[rule.inner.type] as RuleHandler
    const { breakdown: innerBreakdown } = innerHandler(rule.inner, documents)

    const breakdown = innerBreakdown.map((entry) => ({
        documentId: entry.documentId,
        points: Math.min(entry.points, rule.capPerDocument),
    }))
    const rawTotal = breakdown.reduce((sum, b) => sum + b.points, 0)

    return { rawTotal, breakdown }
}

/**
 * Registry mapping rule type -> handler.
 * Adding a new rule type requires adding one entry here — nothing else
 * in the engine changes (NFR-04-02). cappedPerDocument is a clean
 * demonstration of exactly this: computeCategoryScore needed zero
 * changes to support it.
 */
export const ruleHandlerRegistry: Record<Rule['type'], RuleHandler<any>> = {
    flat: flatHandler,
    hours: hoursHandler,
    capped: cappedHandler,
    cappedPerDocument: cappedPerDocumentHandler,
}

export function registerRuleHandler<R extends Rule>(
    type: R['type'],
    handler: RuleHandler<R>
) {
    ruleHandlerRegistry[type] = handler as RuleHandler<any>
}