import type { Subgroup } from '@/types/entities'

export const subgroupRepository = {
    listByCollection: (collectionId: string): Promise<Subgroup[]> =>
        window.api.subgroups.listByCollection(collectionId),
    create: (collectionId: string, groupId: string, name: string, displayOrder?: number): Promise<string> =>
        window.api.subgroups.create(collectionId, groupId, name, displayOrder),
    update: (
        id: string,
        updates: { name?: string; minPoints?: number | null; maxPoints?: number | null }
    ): Promise<void> => window.api.subgroups.update(id, updates),
    reorder: (orderedIds: string[]): Promise<void> => window.api.subgroups.reorder(orderedIds),
    delete: (id: string): Promise<void> => window.api.subgroups.delete(id),
}