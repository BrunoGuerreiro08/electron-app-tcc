import type { Category } from '@/types/entities'
import type { ScorableDocument } from '@/services/scoringEngine/types'

export const documentCategoryLinkRepository = {
    listByCategory: (categoryId: string): Promise<ScorableDocument[]> =>
        window.api.documentCategoryLinks.listByCategory(categoryId),
    listByDocument: (documentId: string): Promise<(Category & { collection_id: string })[]> =>
        window.api.documentCategoryLinks.listByDocument(documentId),
    link: (documentId: string, categoryId: string): Promise<void> =>
        window.api.documentCategoryLinks.link(documentId, categoryId),
    unlink: (documentId: string, categoryId: string): Promise<void> =>
        window.api.documentCategoryLinks.unlink(documentId, categoryId),
}