import { describe, expect, it } from 'vitest'
import {
    computeCategoryScore,
    computeCollectionScore,
    computeGroupScore,
    computeSubgroupCompletion,
    computeSubgroupScore,
} from '@/services/scoringEngine/computeScore'
import { validateRule } from '@/services/scoringEngine/validateRule'
import type { CappedRule, FlatRule, HoursRule } from '@/services/scoringEngine/types'
import type { SubgroupInput } from '@/services/scoringEngine/computeScore'

describe('flat rule', () => {
    const rule: FlatRule = { type: 'flat', pointsPerUnit: 30 }

    it('multiplies pointsPerUnit by document count', () => {
        const result = computeCategoryScore({
            id: 'cat-1',
            rule,
            documents: [{ id: 'd1' }, { id: 'd2' }],
        })
        expect(result.total).toBe(60)
        expect(result.rawTotal).toBe(60)
        expect(result.capped).toBe(false)
    })

    it('returns zero for an empty category without throwing (NFR-07-03)', () => {
        const result = computeCategoryScore({ id: 'cat-1', rule, documents: [] })
        expect(result.total).toBe(0)
        expect(result.breakdown).toEqual([])
    })

    it('produces a per-document breakdown (NFR-08-02)', () => {
        const result = computeCategoryScore({
            id: 'cat-1',
            rule,
            documents: [{ id: 'd1' }, { id: 'd2' }],
        })
        expect(result.breakdown).toEqual([
            { documentId: 'd1', points: 30 },
            { documentId: 'd2', points: 30 },
        ])
    })
})

describe('hours rule', () => {
    const rule: HoursRule = { type: 'hours', pointsPerUnit: 1, unitSize: 15 }

    it('computes continuous (non-floored) points from declared hours', () => {
        const result = computeCategoryScore({
            id: 'cat-1',
            rule,
            documents: [{ id: 'd1', hours: 45 }],
        })
        expect(result.total).toBe(3)
    })

    it('does not floor partial units', () => {
        const result = computeCategoryScore({
            id: 'cat-1',
            rule,
            documents: [{ id: 'd1', hours: 20 }],
        })
        expect(result.total).toBeCloseTo(1.333, 3)
    })

    it('treats missing hours as zero rather than throwing', () => {
        const result = computeCategoryScore({
            id: 'cat-1',
            rule,
            documents: [{ id: 'd1' }],
        })
        expect(result.total).toBe(0)
    })

    it('sums hours across multiple documents', () => {
        const result = computeCategoryScore({
            id: 'cat-1',
            rule,
            documents: [
                { id: 'd1', hours: 15 },
                { id: 'd2', hours: 30 },
            ],
        })
        expect(result.total).toBe(3)
    })
})

describe('capped rule', () => {
    const rule: CappedRule = {
        type: 'capped',
        inner: { type: 'flat', pointsPerUnit: 10 },
        cap: 20,
    }

    it('clamps the total at the cap when exceeded', () => {
        const result = computeCategoryScore({
            id: 'cat-1',
            rule,
            documents: [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }],
        })
        expect(result.rawTotal).toBe(30)
        expect(result.total).toBe(20)
        expect(result.capped).toBe(true)
    })

    it('does not clamp when under the cap', () => {
        const result = computeCategoryScore({
            id: 'cat-1',
            rule,
            documents: [{ id: 'd1' }],
        })
        expect(result.total).toBe(10)
        expect(result.capped).toBe(false)
    })

    it('works with an hours inner rule too', () => {
        const hoursCapped: CappedRule = {
            type: 'capped',
            inner: { type: 'hours', pointsPerUnit: 1, unitSize: 15 },
            cap: 2,
        }
        const result = computeCategoryScore({
            id: 'cat-1',
            rule: hoursCapped,
            documents: [{ id: 'd1', hours: 60 }],
        })
        expect(result.rawTotal).toBe(4)
        expect(result.total).toBe(2)
    })
})

describe('quantity multiplier', () => {
    it('multiplies a flat rule result by document quantity', () => {
        const result = computeCategoryScore({
            id: 'cat-1',
            rule: { type: 'flat', pointsPerUnit: 5 },
            documents: [{ id: 'd1', quantity: 2 }],
        })
        expect(result.total).toBe(10)
    })

    it('multiplies an hours rule result by document quantity', () => {
        const result = computeCategoryScore({
            id: 'cat-1',
            rule: { type: 'hours', pointsPerUnit: 1, unitSize: 15 },
            documents: [{ id: 'd1', hours: 15, quantity: 3 }],
        })
        expect(result.total).toBe(3)
    })

    it('defaults quantity to 1 when not provided', () => {
        const result = computeCategoryScore({
            id: 'cat-1',
            rule: { type: 'flat', pointsPerUnit: 5 },
            documents: [{ id: 'd1' }],
        })
        expect(result.total).toBe(5)
    })

    it('applies the cap after quantity is factored in', () => {
        const result = computeCategoryScore({
            id: 'cat-1',
            rule: { type: 'capped', inner: { type: 'flat', pointsPerUnit: 5 }, cap: 8 },
            documents: [{ id: 'd1', quantity: 3 }],
        })
        expect(result.rawTotal).toBe(15)
        expect(result.total).toBe(8)
        expect(result.capped).toBe(true)
    })

    it('sums quantity-adjusted contributions across multiple documents', () => {
        const result = computeCategoryScore({
            id: 'cat-1',
            rule: { type: 'flat', pointsPerUnit: 2 },
            documents: [
                { id: 'd1', quantity: 2 },
                { id: 'd2', quantity: 1 },
                { id: 'd3' },
            ],
        })
        expect(result.total).toBe(8)
    })
})

describe('subgroup completion state', () => {
    it('is incomplete when below minPoints', () => {
        expect(computeSubgroupCompletion(20, 32, null)).toBe('incomplete')
    })

    it('is complete when within range', () => {
        expect(computeSubgroupCompletion(32, 32, 50)).toBe('complete')
    })

    it('is exceeded when above maxPoints', () => {
        expect(computeSubgroupCompletion(60, 32, 50)).toBe('exceeded')
    })

    it('is null when no thresholds are set (NFR-07-07)', () => {
        expect(computeSubgroupCompletion(100, null, null)).toBe(null)
    })

    it('treats a subgroup with only minPoints correctly', () => {
        expect(computeSubgroupCompletion(10, 5, null)).toBe('complete')
        expect(computeSubgroupCompletion(3, 5, null)).toBe('incomplete')
    })
})

describe('subgroup and collection aggregation', () => {
    it('sums category totals into the subgroup total, and subgroup totals into the collection total (NFR-07-02)', () => {
        // Collection → Group → Subgroup → Category: subgroups now live inside a group.
        const collection = computeCollectionScore({
            id: 'col-1',
            groups: [
                {
                    id: 'grp-1',
                    subgroups: [
                        {
                            id: 'sub-1',
                            minPoints: 5,
                            maxPoints: null,
                            categories: [
                                {
                                    id: 'cat-1',
                                    rule: { type: 'flat', pointsPerUnit: 2 },
                                    documents: [{ id: 'd1' }, { id: 'd2' }],
                                },
                                {
                                    id: 'cat-2',
                                    rule: { type: 'hours', pointsPerUnit: 1, unitSize: 15 },
                                    documents: [{ id: 'd3', hours: 15 }],
                                },
                            ],
                        },
                        {
                            id: 'sub-2',
                            categories: [
                                {
                                    id: 'cat-3',
                                    rule: { type: 'flat', pointsPerUnit: 10 },
                                    documents: [{ id: 'd4' }],
                                },
                            ],
                        },
                    ],
                },
            ],
        })

        const group = collection.groups[0]
        expect(group.subgroups[0].total).toBe(5)
        expect(group.subgroups[0].completion).toBe('complete')
        expect(group.subgroups[1].total).toBe(10)
        expect(group.total).toBe(15)
        expect(collection.total).toBe(15)
    })

    it('handles an empty category within a subgroup without breaking the total', () => {
        const subgroup = computeSubgroupScore({
            id: 'sub-1',
            categories: [
                { id: 'cat-1', rule: { type: 'flat', pointsPerUnit: 5 }, documents: [] },
                {
                    id: 'cat-2',
                    rule: { type: 'flat', pointsPerUnit: 5 },
                    documents: [{ id: 'd1' }],
                },
            ],
        })
        expect(subgroup.total).toBe(5)
    })
})

// Builds a subgroup worth exactly `points` (one flat category, 1 point per document).
function subgroupWorth(id: string, points: number, limits: Pick<SubgroupInput, 'minPoints' | 'maxPoints'> = {}): SubgroupInput {
    return {
        id,
        ...limits,
        categories: [
            {
                id: `${id}-cat`,
                rule: { type: 'flat', pointsPerUnit: 1 },
                documents: Array.from({ length: points }, (_, i) => ({ id: `${id}-d${i}` })),
            },
        ],
    }
}

describe('group level', () => {
    it('sums its subgroups into the group total', () => {
        const group = computeGroupScore({
            id: 'grp',
            subgroups: [subgroupWorth('a', 10), subgroupWorth('b', 7)],
        })
        expect(group.rawTotal).toBe(17)
        expect(group.total).toBe(17)
    })

    it('has no completion state and no bonus when nothing is configured (NFR-07-07)', () => {
        const group = computeGroupScore({ id: 'grp', subgroups: [subgroupWorth('a', 10)] })
        expect(group.completion).toBe(null)
        expect(group.bonus).toBe(null)
    })

    it('handles a group with no subgroups', () => {
        const group = computeGroupScore({ id: 'grp', minPoints: 5, subgroups: [] })
        expect(group.total).toBe(0)
        expect(group.completion).toBe('incomplete')
    })

    it('adds each subgroup AFTER its own cap is applied', () => {
        // Subgroup capped at 12 (like Subgrupo I3) earns 20 raw — only 12 reach the group.
        const group = computeGroupScore({
            id: 'grp',
            subgroups: [subgroupWorth('capped', 20, { maxPoints: 12 }), subgroupWorth('free', 5)],
        })
        expect(group.subgroups[0].total).toBe(12)
        expect(group.total).toBe(17)
    })

    describe('maxPoints', () => {
        const group = computeGroupScore({
            id: 'grp',
            maxPoints: 15,
            subgroups: [subgroupWorth('a', 12), subgroupWorth('b', 8)],
        })

        it('clamps the total but keeps the unclamped rawTotal', () => {
            expect(group.rawTotal).toBe(20)
            expect(group.total).toBe(15)
        })

        it('reports exceeded, derived from rawTotal', () => {
            expect(group.completion).toBe('exceeded')
        })

        it('only the clamped total reaches the collection total', () => {
            const collection = computeCollectionScore({
                id: 'col',
                groups: [
                    { id: 'capped', maxPoints: 15, subgroups: [subgroupWorth('a', 12), subgroupWorth('b', 8)] },
                    { id: 'other', subgroups: [subgroupWorth('c', 4)] },
                ],
            })
            expect(collection.groups.map((g) => g.total)).toEqual([15, 4])
            expect(collection.total).toBe(19)
        })
    })

    describe('completion across subgroups (group-spanning minimum)', () => {
        // Like Grupo I: 32 points required across all its subgroups together.
        it('is incomplete when the subgroups together fall short', () => {
            const group = computeGroupScore({
                id: 'grp',
                minPoints: 32,
                subgroups: [subgroupWorth('a', 20), subgroupWorth('b', 10)],
            })
            expect(group.completion).toBe('incomplete')
        })

        it('is complete when the subgroups together reach the minimum', () => {
            const group = computeGroupScore({
                id: 'grp',
                minPoints: 32,
                subgroups: [subgroupWorth('a', 20), subgroupWorth('b', 12)],
            })
            expect(group.completion).toBe('complete')
        })
    })

    describe('surplus bonus (bonusRate)', () => {
        it('values the points above minPoints at bonusRate, separately from the total', () => {
            const group = computeGroupScore({
                id: 'grp',
                minPoints: 32,
                bonusRate: 0.5,
                subgroups: [subgroupWorth('a', 30), subgroupWorth('b', 10)],
            })
            expect(group.total).toBe(40) // bonus is never added into the total
            expect(group.bonus).toBe(4) // (40 - 32) × 0.5
        })

        it('is 0, not null, when the group is at or below its minimum', () => {
            const atMin = computeGroupScore({ id: 'g', minPoints: 10, bonusRate: 0.5, subgroups: [subgroupWorth('a', 10)] })
            const below = computeGroupScore({ id: 'g', minPoints: 10, bonusRate: 0.5, subgroups: [subgroupWorth('a', 6)] })
            expect(atMin.bonus).toBe(0)
            expect(below.bonus).toBe(0)
        })

        it('is null when bonusRate or minPoints is not configured', () => {
            const noRate = computeGroupScore({ id: 'g', minPoints: 10, subgroups: [subgroupWorth('a', 20)] })
            const noMin = computeGroupScore({ id: 'g', bonusRate: 0.5, subgroups: [subgroupWorth('a', 20)] })
            expect(noRate.bonus).toBe(null)
            expect(noMin.bonus).toBe(null)
        })

        it('is computed from the clamped total, not from points already capped away', () => {
            const group = computeGroupScore({
                id: 'grp',
                minPoints: 32,
                maxPoints: 40,
                bonusRate: 0.5,
                subgroups: [subgroupWorth('a', 50)],
            })
            expect(group.rawTotal).toBe(50)
            expect(group.total).toBe(40)
            expect(group.bonus).toBe(4) // (40 - 32) × 0.5, not (50 - 32) × 0.5
        })

        it('does not change the collection total', () => {
            const collection = computeCollectionScore({
                id: 'col',
                groups: [{ id: 'g', minPoints: 10, bonusRate: 1, subgroups: [subgroupWorth('a', 15)] }],
            })
            expect(collection.groups[0].bonus).toBe(5)
            expect(collection.total).toBe(15)
        })
    })
})

describe('rule validation', () => {
    it('accepts a valid flat rule', () => {
        expect(validateRule({ type: 'flat', pointsPerUnit: 5 }).valid).toBe(true)
    })

    it('rejects a flat rule with non-positive pointsPerUnit', () => {
        const result = validateRule({ type: 'flat', pointsPerUnit: 0 })
        expect(result.valid).toBe(false)
        expect(result.errors.length).toBeGreaterThan(0)
    })

    it('accepts a valid hours rule', () => {
        expect(validateRule({ type: 'hours', pointsPerUnit: 1, unitSize: 15 }).valid).toBe(true)
    })

    it('rejects an hours rule with zero unitSize', () => {
        expect(validateRule({ type: 'hours', pointsPerUnit: 1, unitSize: 0 }).valid).toBe(false)
    })

    it('rejects a capped rule with cap of zero (NFR-04-04)', () => {
        const result = validateRule({
            type: 'capped',
            inner: { type: 'flat', pointsPerUnit: 5 },
            cap: 0,
        })
        expect(result.valid).toBe(false)
    })

    it('rejects a capped rule with a missing inner rule (NFR-04-04)', () => {
        const result = validateRule({
            type: 'capped',
            inner: undefined as any,
            cap: 10,
        })
        expect(result.valid).toBe(false)
    })

    it('accepts a valid capped rule', () => {
        const result = validateRule({
            type: 'capped',
            inner: { type: 'flat', pointsPerUnit: 5 },
            cap: 20,
        })
        expect(result.valid).toBe(true)
    })

    it('rejects an unknown rule type', () => {
        const result = validateRule({ type: 'made_up' } as any)
        expect(result.valid).toBe(false)
    })

    it('rejects a null/undefined rule', () => {
        expect(validateRule(null).valid).toBe(false)
        expect(validateRule(undefined).valid).toBe(false)
    })
})

describe('referential transparency (NFR-04-01)', () => {
    it('produces identical results across repeated calls with identical inputs', () => {
        const input = {
            id: 'cat-1',
            rule: { type: 'hours' as const, pointsPerUnit: 2, unitSize: 10 },
            documents: [{ id: 'd1', hours: 25 }],
        }
        const first = computeCategoryScore(input)
        const second = computeCategoryScore(input)
        expect(first).toEqual(second)
    })
})