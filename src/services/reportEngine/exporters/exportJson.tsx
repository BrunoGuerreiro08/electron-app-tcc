import type { ReportData } from '../types'
import type { Rule } from '@/services/scoringEngine/types'
import { clean, fileNameOf } from './shared'

/**
 * Same skeleton as the collection template JSON
 * (schemaVersion / name / description / groups → subgroups → categories, snake_case),
 * plus the user's documents and the engine's calculated scores.
 *
 * Every template key is kept unchanged, so this file can still be read as a
 * template: the extra keys (`score`, `documents`, `total_score`, …) are additive.
 */
export interface CollectionExportJson {
    schemaVersion: 1
    kind: 'collection_export'
    name: string
    description: string | null
    exported_at: string
    /** Who produced this snapshot. Lets a reviewer see whose data they're reading. */
    exported_by: { name: string; email: string | null } | null
    total_score: number
    groups: Array<{
        name: string
        display_order: number
        min_points: number | null
        max_points: number | null
        bonus_rate: number | null
        score: {
            raw_total: number
            total: number
            completion: string | null
            bonus: number | null
        }
        subgroups: Array<{
            name: string
            display_order: number
            min_points: number | null
            max_points: number | null
            score: { raw_total: number; total: number; completion: string | null }
            categories: Array<{
                name: string
                display_order: number
                rule: Rule
                score: { raw_total: number; total: number; capped: boolean }
                documents: Array<{
                    title: string
                    issued_at: string | null
                    quantity: number
                    hours: number | null
                    points: number
                    has_file: boolean
                    file_name: string | null
                }>
            }>
        }>
    }>
}

export interface BuildJsonOptions {
    /** ReportData doesn't carry the collection description; pass it if you have it. */
    description?: string | null
    /** Include the sender's name/e-mail (default true). Set false for anonymous sharing. */
    includeSender?: boolean
}

export function buildExportJson(
    report: ReportData,
    options: BuildJsonOptions = {}
): CollectionExportJson {
    return {
        schemaVersion: 1,
        kind: 'collection_export',
        name: report.collectionName,
        description: options.description ?? null,
        exported_at: new Date().toISOString(),
        exported_by:
            options.includeSender === false
                ? null
                : {
                    name: report.userName,
                    // The mapper uses the literal 'N/A' when there is no e-mail.
                    email: report.userEmail && report.userEmail !== 'N/A' ? report.userEmail : null,
                },
        total_score: clean(report.totalScore),
        groups: report.groups.map((g, gi) => ({
            name: g.name,
            display_order: gi,
            min_points: g.minPoints,
            max_points: g.maxPoints,
            bonus_rate: g.bonus ?? null,
            score: {
                raw_total: clean(g.rawTotal),
                total: clean(g.total),
                completion: g.completion ?? null,
                bonus: g.bonus == null ? null : clean(g.bonus),
            },
            subgroups: g.subgroups.map((s, si) => ({
                name: s.name,
                display_order: si,
                min_points: s.minPoints,
                max_points: s.maxPoints,
                score: {
                    raw_total: clean(s.rawTotal),
                    total: clean(s.total),
                    completion: s.completion ?? null,
                },
                categories: s.categories.map((c, ci) => ({
                    name: c.name,
                    display_order: ci,
                    rule: c.rule,
                    score: {
                        raw_total: clean(c.rawTotal),
                        total: clean(c.total),
                        capped: c.capped,
                    },
                    documents: c.documents.map((d) => ({
                        title: d.title,
                        issued_at: d.issuedAt,
                        quantity: d.quantity,
                        hours: d.hours,
                        points: clean(d.points),
                        has_file: d.hasFile,
                        // File name only: local absolute paths are machine-specific
                        // and shouldn't leak into a shareable file.
                        file_name: fileNameOf(d.filePath),
                    })),
                })),
            })),
        })),
    }
}

export const serializeExportJson = (report: ReportData, options?: BuildJsonOptions): string =>
    JSON.stringify(buildExportJson(report, options), null, 2)