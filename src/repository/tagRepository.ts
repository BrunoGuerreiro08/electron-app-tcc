import type { Tag } from '@/types/entities'

export const tagRepository = {
    list: (): Promise<Tag[]> => window.api.tags.list(),
    create: (name: string, color?: string): Promise<string> => window.api.tags.create(name, color),
    delete: (id: string): Promise<void> => window.api.tags.delete(id),
    listForDocument: (documentId: string): Promise<Tag[]> =>
        window.api.tags.listForDocument(documentId),
    attachToDocument: (documentId: string, tagId: string): Promise<void> =>
        window.api.tags.attachToDocument(documentId, tagId),
    detachFromDocument: (documentId: string, tagId: string): Promise<void> =>
        window.api.tags.detachFromDocument(documentId, tagId),
}