import type { CollectionScoreResult } from '../scoringEngine/types'
import type { ReportData, ReportSubgroupItem, ReportCategoryItem, ReportDocumentItem } from './types'

interface CollectionDetailInput {
    id: string
    name: string
    subgroups: Array<{
        id: string
        name: string
        minPoints: number | null
        maxPoints: number | null
        categories: Array<{
            id: string
            name: string
            rule: any
            documents: Array<{
                id: string
                title: string
                issuedAt: string | null
                quantity: number
                hours: number | null
                filePath: string | null
            }>
        }>
    }>
}

interface UserSessionInput {
    name?: string | null
    email?: string | null
}

export function buildReportData(
    collectionDetail: CollectionDetailInput,
    scoreResult: CollectionScoreResult,
    session?: UserSessionInput | null
): ReportData {
    const subgroupScoreMap = new Map(scoreResult.subgroups.map((s) => [s.subgroupId, s]))

    const subgroups: ReportSubgroupItem[] = collectionDetail.subgroups.map((subgroup) => {
        const scoreSubgroup = subgroupScoreMap.get(subgroup.id)
        const categoryScoreMap = new Map(
            scoreSubgroup?.categories.map((c) => [c.categoryId, c]) ?? []
        )

        const categories: ReportCategoryItem[] = subgroup.categories.map((category) => {
            const scoreCategory = categoryScoreMap.get(category.id)
            const docScoreMap = new Map(
                scoreCategory?.breakdown.map((b) => [b.documentId, b.points]) ?? []
            )

            const documents: ReportDocumentItem[] = category.documents.map((doc) => ({
                id: doc.id,
                title: doc.title,
                issuedAt: doc.issuedAt,
                quantity: doc.quantity ?? 1,
                hours: doc.hours ?? null,
                points: docScoreMap.get(doc.id) ?? 0,
                hasFile: Boolean(doc.filePath),
                filePath: doc.filePath ?? null,
            }))

            return {
                id: category.id,
                name: category.name,
                rule: category.rule,
                rawTotal: scoreCategory?.rawTotal ?? 0,
                total: scoreCategory?.total ?? 0,
                capped: scoreCategory?.capped ?? false,
                documents,
            }
        })

        return {
            id: subgroup.id,
            name: subgroup.name,
            minPoints: subgroup.minPoints,
            maxPoints: subgroup.maxPoints,
            total: scoreSubgroup?.total ?? 0,
            completion: scoreSubgroup?.completion ?? null,
            categories,
        }
    })

    return {
        collectionId: collectionDetail.id,
        collectionName: collectionDetail.name,
        userName: session?.name || 'Docente / Usuário',
        userEmail: session?.email || 'N/A',
        generatedAt: new Date().toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        }),
        totalScore: scoreResult.total,
        subgroups,
    }
}