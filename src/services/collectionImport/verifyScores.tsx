import { computeCollectionScore, type CollectionInput } from '@/services/scoringEngine/computeScore'
import type { ReviewSnapshot } from '@/types/review'
import { completionLabel } from '@/services/reportEngine/exporters/shared'
import { formatPoints } from '@/lib/formatPoints'

/**
 * Re-runs THIS app's scoring engine over an imported snapshot and compares the
 * result with the scores the sender saved in the file.
 *
 * The snapshot carries everything the engine needs — rules, thresholds, bonus
 * rates, and each document's quantity/hours — so nothing is guessed. Ids are
 * positional (see `keyOf`) because exports intentionally carry no database ids.
 *
 * What a difference can mean (the UI says all three):
 *   - the file was edited by hand,
 *   - the file is internally inconsistent,
 *   - sender and reviewer run versions of the app with different scoring rules.
 *
 * What a clean result does NOT prove: that the documents themselves are genuine.
 * Someone who changes a document's hours AND every score above it consistently
 * will still verify — that is what the attached files are for.
 */

/** Exports round to 6 decimals, so anything beyond float noise is a real difference. */
const TOLERANCE = 1e-4

/** Shared key format: the adapter and the UI must agree on where a difference belongs. */
export const keyOf = {
    total: 'total',
    group: (g: number) => `g${g}`,
    subgroup: (g: number, s: number) => `g${g}.s${s}`,
    category: (g: number, s: number, c: number) => `g${g}.s${s}.c${c}`,
    document: (g: number, s: number, c: number, d: number) => `g${g}.s${s}.c${c}.d${d}`,
}

export type DiscrepancyField =
    | 'points'
    | 'raw_total'
    | 'total'
    | 'capped'
    | 'completion'
    | 'bonus'
    | 'total_score'

type Value = number | boolean | string | null

export interface ScoreDiscrepancy {
    /** Position in the snapshot, see `keyOf` */
    key: string
    /** Human-readable location, e.g. `Grupo I › I.2 - Orientação › I.2.3 …` */
    label: string
    field: DiscrepancyField
    sent: Value
    recomputed: Value
}

export type VerificationResult =
    | { status: 'verified'; checked: number }
    | { status: 'mismatch'; checked: number; discrepancies: ScoreDiscrepancy[] }
    | { status: 'error'; message: string }

export function formatValue(v: Value): string {
    if (v === null) return '—'
    if (typeof v === 'number') return formatPoints(v)
    if (typeof v === 'boolean') return v ? 'sim' : 'não'
    return completionLabel(v) || v
}

const short = (s: string, n = 48) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

/** Builds the engine's input from a snapshot. Mirrors useCollectionDetail's mapping. */
export function snapshotToEngineInput(data: ReviewSnapshot): CollectionInput {
    return {
        id: 'review',
        groups: data.groups.map((g, gi) => ({
            id: keyOf.group(gi),
            minPoints: g.min_points,
            maxPoints: g.max_points,
            bonusRate: g.bonus_rate,
            subgroups: g.subgroups.map((s, si) => ({
                id: keyOf.subgroup(gi, si),
                minPoints: s.min_points,
                maxPoints: s.max_points,
                categories: s.categories.map((c, ci) => ({
                    id: keyOf.category(gi, si, ci),
                    rule: c.rule,
                    documents: c.documents.map((d, di) => ({
                        id: keyOf.document(gi, si, ci, di),
                        hours: d.hours,
                        quantity: d.quantity,
                    })),
                })),
            })),
        })),
    }
}

export function verifySnapshotScores(data: ReviewSnapshot): VerificationResult {
    let result
    try {
        result = computeCollectionScore(snapshotToEngineInput(data))
    } catch (err) {
        return {
            status: 'error',
            message: err instanceof Error ? err.message : 'falha ao recalcular as pontuações',
        }
    }

    const discrepancies: ScoreDiscrepancy[] = []
    let checked = 0

    const check = (key: string, label: string, field: DiscrepancyField, sent: Value, recomputed: Value) => {
        checked++
        const same =
            typeof sent === 'number' && typeof recomputed === 'number'
                ? Math.abs(sent - recomputed) <= TOLERANCE
                : sent === recomputed
        if (!same) discrepancies.push({ key, label, field, sent, recomputed })
    }

    check(keyOf.total, short(data.name), 'total_score', data.total_score, result.total)

    data.groups.forEach((g, gi) => {
        const rg = result.groups[gi]
        const gLabel = short(g.name)
        const gKey = keyOf.group(gi)
        check(gKey, gLabel, 'raw_total', g.score.raw_total, rg.rawTotal)
        check(gKey, gLabel, 'total', g.score.total, rg.total)
        check(gKey, gLabel, 'completion', g.score.completion, rg.completion)
        check(gKey, gLabel, 'bonus', g.score.bonus, rg.bonus)

        g.subgroups.forEach((s, si) => {
            const rs = rg.subgroups[si]
            const sLabel = `${gLabel} › ${short(s.name)}`
            const sKey = keyOf.subgroup(gi, si)
            check(sKey, sLabel, 'raw_total', s.score.raw_total, rs.rawTotal)
            check(sKey, sLabel, 'total', s.score.total, rs.total)
            check(sKey, sLabel, 'completion', s.score.completion, rs.completion)

            s.categories.forEach((c, ci) => {
                const rc = rs.categories[ci]
                const cLabel = `${sLabel} › ${short(c.name)}`
                const cKey = keyOf.category(gi, si, ci)
                check(cKey, cLabel, 'raw_total', c.score.raw_total, rc.rawTotal)
                check(cKey, cLabel, 'total', c.score.total, rc.total)
                check(cKey, cLabel, 'capped', c.score.capped, rc.capped)

                const pointsById = new Map(rc.breakdown.map((b) => [b.documentId, b.points]))
                c.documents.forEach((d, di) => {
                    const dKey = keyOf.document(gi, si, ci, di)
                    check(dKey, `${cLabel} › “${short(d.title, 30)}”`, 'points', d.points, pointsById.get(dKey) ?? 0)
                })
            })
        })
    })

    return discrepancies.length === 0
        ? { status: 'verified', checked }
        : { status: 'mismatch', checked, discrepancies }
}