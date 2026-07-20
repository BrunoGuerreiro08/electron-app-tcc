import { create } from 'zustand'
import { collectionRepository } from '@/repository/collectionRepository'
import type { Collection } from '@/types/entities'

interface CollectionsState {
    collections: Collection[]
    loading: boolean
    load: () => Promise<void>
    create: (name: string, color?: string) => Promise<string>
}

export const useCollectionsStore = create<CollectionsState>((set, get) => ({
    collections: [],
    loading: true,

    load: async () => {
        set({ loading: true })
        const collections = await collectionRepository.list()
        set({ collections, loading: false })
    },

    create: async (name, color) => {
        const id = await collectionRepository.create(name, color)
        await get().load()
        return id
    },
}))