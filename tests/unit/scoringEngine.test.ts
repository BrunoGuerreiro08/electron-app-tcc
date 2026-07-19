import { describe, expect, it } from 'vitest'
import {
    computeCategoryScore,
    computeCollectionScore,
    computeSubgroupCompletion,
    computeSubgroupScore,
} from '@/services/scoringEngine/computeScore'
import { validateRule } from '@/services/scoringEngine/validateRule'
import type { CappedRule, FlatRule, HoursRule } from '@/services/scoringEngine/types'

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
        const collection = computeCollectionScore({
            id: 'col-1',
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
        })

        expect(collection.subgroups[0].total).toBe(5)
        expect(collection.subgroups[0].completion).toBe('complete')
        expect(collection.subgroups[1].total).toBe(10)
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