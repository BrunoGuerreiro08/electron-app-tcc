import type { Rule } from '@/services/scoringEngine/types'

/**
 * Deterministic fingerprint of a collection's STRUCTURE — groups, subgroups,
 * categories, rules, thresholds, bonus rate — never its documents or scores.
 * Used to answer "is this still exactly what the template defined?" without
 * trusting a label the sender's app could have gotten wrong or lied about:
 * both sides compute this the same way from data they each hold, and compare.
 *
 * Not a security hash (no need for collision resistance against an attacker
 * who can shape input) — FNV-1a is enough, and it runs identically in the
 * renderer, the main process and this test harness with zero platform APIs
 * (no Node crypto, no Web Crypto — both would work but neither is needed).
 */

const round = (n: number) => Math.round(n * 1e6) / 1e6 // survives JSON round-trips; kills float noise

function canonRule(rule: Rule): unknown {
    switch (rule.type) {
        case 'flat':
            return { type: 'flat', p: round(rule.pointsPerUnit) }
        case 'hours':
            return { type: 'hours', p: round(rule.pointsPerUnit), u: round(rule.unitSize) }
        case 'capped':
            return { type: 'capped', inner: canonRule(rule.inner), cap: round(rule.cap) }
        case 'cappedPerDocument':
            return { type: 'cappedPerDocument', inner: canonRule(rule.inner), cap: round(rule.capPerDocument) }
    }
}

export interface StructureCategory {
    name: string
    rule: Rule
}
export interface StructureSubgroup {
    name: string
    minPoints: number | null
    maxPoints: number | null
    categories: StructureCategory[]
}
export interface StructureGroup {
    name: string
    minPoints: number | null
    maxPoints: number | null
    bonusRate: number | null
    subgroups: StructureSubgroup[]
}

function canonicalize(groups: StructureGroup[]): string {
    const shape = groups.map((g) => ({
        n: g.name,
        mn: g.minPoints == null ? null : round(g.minPoints),
        mx: g.maxPoints == null ? null : round(g.maxPoints),
        br: g.bonusRate == null ? null : round(g.bonusRate),
        s: g.subgroups.map((s) => ({
            n: s.name,
            mn: s.minPoints == null ? null : round(s.minPoints),
            mx: s.maxPoints == null ? null : round(s.maxPoints),
            c: s.categories.map((c) => ({ n: c.name, r: canonRule(c.rule) })),
        })),
    }))
    return JSON.stringify(shape)
}

/** FNV-1a, 32-bit, hex-encoded — short, deterministic, dependency-free. */
function fnv1a(str: string): string {
    let hash = 0x811c9dc5
    for (let i = 0; i < str.length; i++) {
        hash ^= str.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193)
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
}

export function computeStructureFingerprint(groups: StructureGroup[]): string {
    return fnv1a(canonicalize(groups))
}