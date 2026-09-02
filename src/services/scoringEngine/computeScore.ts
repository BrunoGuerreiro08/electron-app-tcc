import { ruleHandlerRegistry } from './ruleHandlers'
import { computeSubgroupBonus } from './subgroupBonus'
import type {
    CategoryScoreResult,
    CollectionScoreResult,
    CompletionState,
    GroupScoreResult,
    Rule,
    ScorableDocument,
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

export interface GroupInput {
    id: string
    minPoints?: number | null
    maxPoints?: number | null
    bonusRate?: number | null
    subgroups: SubgroupInput[]
}

export interface CollectionInput {
    id: string
    groups: GroupInput[]
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
 * Derives a completion state purely from a current total and its stored
 * thresholds — no additional state is kept (NFR-07-06). Returns null
 * when no thresholds are defined (NFR-07-07). Level-agnostic: used
 * identically for both SubGroup and Group, since the logic only ever
 * depends on (total, min, max), never on what's above or below in the
 * hierarchy.
 */
export function computeCompletionState(
    total: number,
    minPoints?: number | null,
    maxPoints?: number | null
): CompletionState {
    if (minPoints == null && maxPoints == null) return null
    if (minPoints != null && total < minPoints) return 'incomplete'
    if (maxPoints != null && total > maxPoints) return 'exceeded'
    return 'complete'
}

// Old name kept as an alias — computeSubgroupScore below already called
// this before Group existed; no need to churn every call site.
export const computeSubgroupCompletion = computeCompletionState

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
        completion: computeCompletionState(total, minPoints, maxPoints),
        categories,
    }
}

/**
 * Sums its subgroups' totals (each already individually capped by its
 * own maxPoints, e.g. Subgrupo I3's 12-point cap) into the group's own
 * total, then checks that combined total against the GROUP's own
 * threshold — this is what makes a group-spanning minimum (e.g. Grupo
 * I's 32 points across I1+I2+I3) representable at all, which a 2-level
 * SubGroup-only hierarchy couldn't do.
 */
export function computeGroupScore(input: GroupInput): GroupScoreResult {
    const subgroups = input.subgroups.map(computeSubgroupScore)
    const total = subgroups.reduce((sum, s) => sum + s.total, 0)
    const minPoints = input.minPoints ?? null
    const maxPoints = input.maxPoints ?? null
    const bonusRate = input.bonusRate ?? null

    return {
        groupId: input.id,
        total,
        minPoints,
        maxPoints,
        completion: computeCompletionState(total, minPoints, maxPoints),
        bonus: computeSubgroupBonus(total, minPoints, bonusRate),
        subgroups,
    }
}

export function computeCollectionScore(input: CollectionInput): CollectionScoreResult {
    const groups = input.groups.map(computeGroupScore)
    const total = groups.reduce((sum, g) => sum + g.total, 0)

    return {
        collectionId: input.id,
        total,
        groups,
    }
}