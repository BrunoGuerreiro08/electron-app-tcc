import type {
    ReportData,
    ReportGroupItem,
    ReportSubgroupItem,
    ReportCategoryItem,
    ReportDocumentItem,
} from '../types'

/* ------------------------------------------------------------------ */
/* Number / text helpers                                               */
/* ------------------------------------------------------------------ */

const ptNumber = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

/** Removes float noise (0.1 + 0.2 → 0.3) without losing meaningful precision. */
export const clean = (n: number | null | undefined): number =>
    n == null || !Number.isFinite(n) ? 0 : Number(n.toFixed(6))

/**
 * Human-readable description of a scoring rule.
 * Covers every rule type in scoringEngine/types.ts: flat | hours | capped | cappedPerDocument.
 * Strings are pt-BR to match the rest of the report; swap for i18n if needed.
 */
export function describeRule(rule: unknown): string {
    const r = rule as any
    if (!r || typeof r !== 'object') return ''
    switch (r.type) {
        case 'flat':
            return `${ptNumber.format(r.pointsPerUnit)} pt por unidade`
        case 'hours':
            return `${ptNumber.format(r.pointsPerUnit)} pt a cada ${ptNumber.format(r.unitSize)} h`
        case 'capped':
            return `${describeRule(r.inner)} (teto: ${ptNumber.format(r.cap)} pts)`
        case 'cappedPerDocument':
            return `${describeRule(r.inner)} (teto por documento: ${ptNumber.format(r.capPerDocument)} pts)`
        default:
            return String(r.type ?? '')
    }
}

const COMPLETION_LABELS: Record<string, string> = {
    incomplete: 'Incompleto',
    complete: 'Completo',
    exceeded: 'Excedido',
}

/** Falls back to the raw value so an unexpected engine state is never hidden. */
export const completionLabel = (c: string | null | undefined): string =>
    c ? (COMPLETION_LABELS[c] ?? c) : ''

/** Only the file name — never leak the user's local absolute path into an export. */
export const fileNameOf = (path: string | null | undefined): string | null =>
    path ? (path.split(/[\\/]/).pop() ?? null) : null

/** `YYYY-MM-DD…` → `{y, m, d}`; null when the value isn't ISO-like. */
export function parseIsoDate(value: string | null | undefined) {
    const m = value ? /^(\d{4})-(\d{2})-(\d{2})/.exec(value) : null
    return m ? { y: +m[1], m: +m[2], d: +m[3] } : null
}

/** Keeps accents/letters (unlike the PDF regex), replaces everything else. */
export const safeFilename = (name: string): string =>
    name.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || 'colecao'

export const todayStamp = (): string => new Date().toISOString().slice(0, 10)

/* ------------------------------------------------------------------ */
/* Flattening                                                          */
/* ------------------------------------------------------------------ */

export interface FlatDocumentRow {
    group: ReportGroupItem
    subgroup: ReportSubgroupItem
    category: ReportCategoryItem
    document: ReportDocumentItem
}

/** One row per document, carrying its full ancestry. Empty categories yield no rows. */
export function flattenDocuments(report: ReportData): FlatDocumentRow[] {
    const rows: FlatDocumentRow[] = []
    for (const group of report.groups)
        for (const subgroup of group.subgroups)
            for (const category of subgroup.categories)
                for (const document of category.documents)
                    rows.push({ group, subgroup, category, document })
    return rows
}