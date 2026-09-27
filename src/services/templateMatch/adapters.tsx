import type { ReportData } from '../reportEngine/types'
import type { CollectionExportJson } from '../reportEngine/exporters/exportJson'
import type { StructureGroup } from './structureFingerprint'

/** From the live collection's ReportData (has real minPoints/maxPoints/bonusRate/rule). */
export function structureFromReportData(report: ReportData): StructureGroup[] {
    return report.groups.map((g) => ({
        name: g.name,
        minPoints: g.minPoints,
        maxPoints: g.maxPoints,
        bonusRate: g.bonus,
        subgroups: g.subgroups.map((s) => ({
            name: s.name,
            minPoints: s.minPoints,
            maxPoints: s.maxPoints,
            categories: s.categories.map((c) => ({ name: c.name, rule: c.rule })),
        })),
    }))
}

/** From a received collection-export JSON (snake_case field names). */
export function structureFromCollectionExport(data: CollectionExportJson): StructureGroup[] {
    return data.groups.map((g) => ({
        name: g.name,
        minPoints: g.min_points,
        maxPoints: g.max_points,
        bonusRate: g.bonus_rate,
        subgroups: g.subgroups.map((s) => ({
            name: s.name,
            minPoints: s.min_points,
            maxPoints: s.max_points,
            categories: s.categories.map((c) => ({ name: c.name, rule: c.rule })),
        })),
    }))
}

/** From a template JSON in the app's template format (same snake_case shape, no documents/scores). */
export function structureFromTemplate(template: {
    groups: Array<{
        name: string
        min_points: number | null
        max_points: number | null
        bonus_rate: number | null
        subgroups: Array<{
            name: string
            min_points: number | null
            max_points: number | null
            categories: Array<{ name: string; rule: unknown }>
        }>
    }>
}): StructureGroup[] {
    return template.groups.map((g) => ({
        name: g.name,
        minPoints: g.min_points,
        maxPoints: g.max_points,
        bonusRate: g.bonus_rate,
        subgroups: g.subgroups.map((s) => ({
            name: s.name,
            minPoints: s.min_points,
            maxPoints: s.max_points,
            categories: s.categories.map((c) => ({ name: c.name, rule: c.rule as any })),
        })),
    }))
}