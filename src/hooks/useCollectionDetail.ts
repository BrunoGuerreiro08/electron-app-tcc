import { useCallback, useEffect, useState } from 'react'
import { subgroupRepository } from '@/repository/subgroupRepository'
import { categoryRepository } from '@/repository/categoryRepository'
import { documentCategoryLinkRepository } from '@/repository/documentCategoryLinkRepository'
import { computeCollectionScore } from '@/services/scoringEngine/computeScore'
import type { CollectionScoreResult } from '@/services/scoringEngine/types'
import type { Category, Subgroup } from '@/types/entities'

export interface LinkedDocument {
    id: string
    title: string
    issuer: string | null
    issued_at: string | null
    hours: number | null
    quantity: number
}

export interface CategoryWithDocuments extends Category {
    documents: LinkedDocument[]
}

export interface SubgroupWithCategories extends Subgroup {
    categories: CategoryWithDocuments[]
}

export function useCollectionDetail(collectionId: string) {
    const [subgroups, setSubgroups] = useState<SubgroupWithCategories[]>([])
    const [score, setScore] = useState<CollectionScoreResult | null>(null)
    const [loading, setLoading] = useState(true)

    const refresh = useCallback(async () => {
        setLoading(true)

        const rawSubgroups = await subgroupRepository.listByCollection(collectionId)

        const enriched = await Promise.all(
            rawSubgroups.map(async (sg) => {
                const categories = await categoryRepository.listBySubgroup(sg.id)
                const categoriesWithDocs = await Promise.all(
                    categories.map(async (cat) => {
                        const documents = await documentCategoryLinkRepository.listByCategory(cat.id)
                        return { ...cat, documents } as CategoryWithDocuments
                    })
                )
                return { ...sg, categories: categoriesWithDocs }
            })
        )

        setSubgroups(enriched)

        const result = computeCollectionScore({
            id: collectionId,
            subgroups: enriched.map((sg) => ({
                id: sg.id,
                minPoints: sg.min_points,
                maxPoints: sg.max_points,
                categories: sg.categories.map((cat) => ({
                    id: cat.id,
                    rule: cat.rule,
                    documents: cat.documents,
                })),
            })),
        })

        setScore(result)
        setLoading(false)
    }, [collectionId])

    useEffect(() => {
        refresh()
    }, [refresh])

    return { subgroups, score, loading, refresh }
}