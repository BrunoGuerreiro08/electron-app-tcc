import { create } from 'zustand'
import { reviewRepository } from '@/repository/reviewRepository'
import { summarizeExport } from '@/services/collectionImport/validateExport'
import type { ReviewListItem, ReviewSnapshot } from '@/types/review'

interface ReviewsState {
    items: ReviewListItem[]
    loading: boolean
    load: () => Promise<void>
    /** `data` must already have passed validateCollectionExport. Returns the new review's id. */
    importReview: (data: ReviewSnapshot, sourceFileName: string) => Promise<string>
    remove: (id: string) => Promise<void>
}

export const useReviewsStore = create<ReviewsState>((set, get) => ({
    items: [],
    loading: false,

    load: async () => {
        set({ loading: true })
        try {
            set({ items: await reviewRepository.list() })
        } finally {
            set({ loading: false })
        }
    },

    importReview: async (data, sourceFileName) => {
        const saved = await reviewRepository.save({
            data,
            summary: summarizeExport(data),
            sourceFileName,
        })
        await get().load()
        return saved.id
    },

    remove: async (id) => {
        await reviewRepository.remove(id)
        await get().load()
    },
}))