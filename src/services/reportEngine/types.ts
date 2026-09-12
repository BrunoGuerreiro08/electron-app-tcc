import type { Rule, SubgroupCompletionState } from '../scoringEngine/types'

export interface ReportDocumentItem {
    id: string
    title: string
    issuedAt: string | null
    quantity: number
    hours: number | null
    points: number
    hasFile: boolean
    filePath: string | null
}

export interface ReportCategoryItem {
    id: string
    name: string
    rule: Rule
    rawTotal: number
    total: number
    capped: boolean
    documents: ReportDocumentItem[]
}

export interface ReportSubgroupItem {
    id: string
    name: string
    minPoints: number | null
    maxPoints: number | null
    rawTotal: number // NEW
    total: number
    completion: SubgroupCompletionState
    categories: ReportCategoryItem[]
}


export interface ReportGroupItem {
    id: string
    name: string
    minPoints: number | null
    maxPoints: number | null
    rawTotal: number
    total: number
    completion: SubgroupCompletionState // reuse whatever completion-state type ReportSubgroupItem.completion already uses
    bonus: number | null
    subgroups: ReportSubgroupItem[]
}

export interface ReportData {
    collectionId: string
    collectionName: string
    userName: string
    userEmail: string
    generatedAt: string
    totalScore: number
    groups: ReportGroupItem[]
}