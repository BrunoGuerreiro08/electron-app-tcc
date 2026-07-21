import { useEffect, useState } from 'react'
import { collectionRepository } from '@/repository/collectionRepository'
import { subgroupRepository } from '@/repository/subgroupRepository'
import { categoryRepository } from '@/repository/categoryRepository'

export interface CategoryOption {
    categoryId: string
    categoryName: string
    subgroupName: string
    collectionName: string
}

export function useCategoryOptions() {
    const [options, setOptions] = useState<CategoryOption[]>([])
    const [loading, setLoading] = useState(true)

    const load = async () => {
        setLoading(true)
        const collections = await collectionRepository.list()
        const all: CategoryOption[] = []

        for (const col of collections) {
            const subgroups = await subgroupRepository.listByCollection(col.id)
            for (const sg of subgroups) {
                const categories = await categoryRepository.listBySubgroup(sg.id)
                for (const cat of categories) {
                    all.push({
                        categoryId: cat.id,
                        categoryName: cat.name,
                        subgroupName: sg.name,
                        collectionName: col.name,
                    })
                }
            }
        }

        setOptions(all)
        setLoading(false)
    }

    useEffect(() => {
        load()
    }, [])

    return { options, loading, reload: load }
}