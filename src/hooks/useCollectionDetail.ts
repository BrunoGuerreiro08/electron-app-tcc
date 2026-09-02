import { useCallback, useEffect, useState } from 'react'
import { groupRepository } from '@/repository/groupRepository'
import { subgroupRepository } from '@/repository/subgroupRepository'
import { categoryRepository } from '@/repository/categoryRepository'
import { documentCategoryLinkRepository } from '@/repository/documentCategoryLinkRepository'
import { computeCollectionScore } from '@/services/scoringEngine/computeScore'
import type { CollectionScoreResult } from '@/services/scoringEngine/types'
import type { Category, Group, Subgroup } from '@/types/entities'

export interface LinkedDocument {
    id: string
    title: string
    issuer: string | null
    issued_at: string | null
    hours: number | null
    quantity: number
    file_path?: string | null
    file_status?: 'ok' | 'missing' | 'orphaned' | null
}

export interface CategoryWithDocuments extends Category {
    documents: LinkedDocument[]
}

export interface SubgroupWithCategories extends Subgroup {
    categories: CategoryWithDocuments[]
}

export interface GroupWithSubgroups extends Group {
    subgroups: SubgroupWithCategories[]
}

export function useCollectionDetail(collectionId: string) {
    const [groups, setGroups] = useState<GroupWithSubgroups[]>([])
    const [score, setScore] = useState<CollectionScoreResult | null>(null)
    const [loading, setLoading] = useState(true)

    const refresh = useCallback(async () => {
        setLoading(true)

        // Groups and ALL of the collection's subgroups fetched in parallel,
        // then merged client-side by subgroup.group_id — subgroups still
        // carry collection_id (kept in db.ts specifically so this stays a
        // flat 2-call fetch instead of one query per group).
        const [rawGroups, rawSubgroups] = await Promise.all([
            groupRepository.listByCollection(collectionId),
            subgroupRepository.listByCollection(collectionId),
        ])

        const enrichedSubgroups: SubgroupWithCategories[] = await Promise.all(
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

        const enrichedGroups: GroupWithSubgroups[] = rawGroups
            .slice()
            .sort((a, b) => a.display_order - b.display_order)
            .map((g) => ({
                ...g,
                subgroups: enrichedSubgroups
                    .filter((sg) => sg.group_id === g.id)
                    .sort((a, b) => a.display_order - b.display_order),
            }))

        setGroups(enrichedGroups)

        const result = computeCollectionScore({
            id: collectionId,
            groups: enrichedGroups.map((g) => ({
                id: g.id,
                minPoints: g.min_points,
                maxPoints: g.max_points,
                bonusRate: g.bonus_rate,
                subgroups: g.subgroups.map((sg) => ({
                    id: sg.id,
                    minPoints: sg.min_points,
                    maxPoints: sg.max_points,
                    categories: sg.categories.map((cat) => ({
                        id: cat.id,
                        rule: cat.rule,
                        documents: cat.documents,
                    })),
                })),
            })),
        })

        setScore(result)
        setLoading(false)
    }, [collectionId])

    useEffect(() => {
        refresh()
    }, [refresh])

    return { groups, score, loading, refresh }
}