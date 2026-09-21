import type { CollectionExportJson } from '@/services/reportEngine/exporters/exportJson'

export type ReviewSnapshot = CollectionExportJson

export interface ReviewSummary {
    name: string
    senderName: string | null
    senderEmail: string | null
    exportedAt: string
    totalScore: number
    groupCount: number
    documentCount: number
}

export interface ReviewListItem {
    id: string
    importedAt: string
    sourceFileName: string
    summary: ReviewSummary
}

export interface StoredReview extends ReviewListItem {
    data: ReviewSnapshot
}

export interface SaveReviewInput {
    data: ReviewSnapshot
    summary: ReviewSummary
    sourceFileName: string
}