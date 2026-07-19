import { ruleHandlerRegistry } from './ruleHandlers'
import type {
    CategoryScoreResult,
    CollectionScoreResult,
    Rule,
    ScorableDocument,
    SubgroupCompletionState,
    SubgroupScoreResult,
} from './types'

export interface CategoryInput {
    id: string
    rule: Rule
    documents: ScorableDocument[]
}

export interface SubgroupInput {
    id: string
    minPoints?: number | null
    maxPoints?: number | null
    categories: CategoryInput[]
}

export interface CollectionInput {
    id: string
    subgroups: SubgroupInput[]
}

/**
 * Computes the score for a single category by delegating to the
 * registered handler for its rule type, applying each document's
 * `quantity` as a multiplier on its base contribution (uniformly,
 * regardless of rule type — a document representing 2 internship
 * orientations counts twice under a flat OR hours rule), then applying
 * a cap if the rule is "capped". Returns zero for a category with no
 * documents (NFR-07-03) rather than throwing.
 */
export function computeCategoryScore(input: CategoryInput): CategoryScoreResult {
    const { id, rule, documents } = input
    const handler = ruleHandlerRegistry[rule.type]

    if (!handler) {
        throw new Error(`No rule handler registered for type "${rule.type}".`)
    }

    const { breakdown: baseBreakdown } = handler(rule, documents)

    const quantityById = new Map(documents.map((doc) => [doc.id, doc.quantity ?? 1]))
    const breakdown = baseBreakdown.map((entry) => ({
        documentId: entry.documentId,
        points: entry.points * (quantityById.get(entry.documentId) ?? 1),
    }))
    const rawTotal = breakdown.reduce((sum, b) => sum + b.points, 0)

    const cap = rule.type === 'capped' ? rule.cap : null
    const total = cap !== null ? Math.min(rawTotal, cap) : rawTotal
    const capped = cap !== null && rawTotal > cap

    return {
        categoryId: id,
        rule,
        rawTotal,
        total,
        capped,
        breakdown,
    }
}

/**
 * Derives a subgroup's completion state purely from its current total
 * and its stored thresholds — no additional state is kept (NFR-07-06).
 * Returns null when no thresholds are defined (NFR-07-07).
 */
export function computeSubgroupCompletion(
    total: number,
    minPoints?: number | null,
    maxPoints?: number | null
): SubgroupCompletionState {
    if (minPoints == null && maxPoints == null) return null
    if (minPoints != null && total < minPoints) return 'incomplete'
    if (maxPoints != null && total > maxPoints) return 'exceeded'
    return 'complete'
}

export function computeSubgroupScore(input: SubgroupInput): SubgroupScoreResult {
    const categories = input.categories.map(computeCategoryScore)
    const total = categories.reduce((sum, c) => sum + c.total, 0)
    const minPoints = input.minPoints ?? null
    const maxPoints = input.maxPoints ?? null

    return {
        subgroupId: input.id,
        total,
        minPoints,
        maxPoints,
        completion: computeSubgroupCompletion(total, minPoints, maxPoints),
        categories,
    }
}

export function computeCollectionScore(input: CollectionInput): CollectionScoreResult {
    const subgroups = input.subgroups.map(computeSubgroupScore)
    const total = subgroups.reduce((sum, s) => sum + s.total, 0)

    return {
        collectionId: input.id,
        total,
        subgroups,
    }
}