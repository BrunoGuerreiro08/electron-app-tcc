import type { Subgroup } from '@/types/entities'

export const subgroupRepository = {
    listByCollection: (collectionId: string): Promise<Subgroup[]> =>
        window.api.subgroups.listByCollection(collectionId),
    create: (collectionId: string, name: string, displayOrder?: number): Promise<string> =>
        window.api.subgroups.create(collectionId, name, displayOrder),
    update: (
        id: string,
        updates: { name?: string; minPoints?: number | null; maxPoints?: number | null }
    ): Promise<void> => window.api.subgroups.update(id, updates),
    delete: (id: string): Promise<void> => window.api.subgroups.delete(id),
}