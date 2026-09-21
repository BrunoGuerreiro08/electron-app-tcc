import type { ReviewListItem, SaveReviewInput, StoredReview } from '@/types/review'

export const reviewRepository = {
    list: (): Promise<ReviewListItem[]> => window.api.reviews.list(),
    get: (id: string): Promise<StoredReview> => window.api.reviews.get(id),
    save: (input: SaveReviewInput): Promise<ReviewListItem> => window.api.reviews.save(input),
    remove: (id: string): Promise<void> => window.api.reviews.remove(id),
}